import { hoverTooltip, type Tooltip } from "@codemirror/view";
import { type Language, type OpDefinition, typeToString } from "@dendrite-lang/core";

import { type SourcePart, sourceParts } from "./source";
import { styledRanges } from "./tokens";

//? Hover on an op's name: its signature, coloured as code, and its one-sentence description,
// from the language's own descriptor, so a host's op shows the same as the library's. The
// position logic is pure (`hoverAt`, tested without a DOM); `opHover` only wires it into
// CodeMirror and builds the element.

/**
 * An op's signature as highlighted parts, the way Dendrite writes a function type:
 * `Join(parts~: string[], separator?: string) -> string`, `If(condition: boolean, then: lazy
 * any, else: lazy any) -> any`. The name marks are the reference's (`...` variadic, `?`
 * optional, `~` converts, one at most) and `lazy` sits on the type. Assembled per input, not
 * highlighted as one line: `lazy` is no word of the language, and in `then: lazy any` the
 * highlighter would see `any` after an identifier, not after the colon, and lose its type
 * colour. A type highlighted on its own is always a type. The docs' reference renders the
 * same parts as HTML (`partsHtml`), so the signature has one definition.
 */
export function signatureParts(op: OpDefinition, language: Language): SourcePart[] {
  const den = (code: string): SourcePart[] => sourceParts(code, language);
  const parts = den(`${op.name}(`);
  op.inputs.forEach((input, i) => {
    if (i > 0) parts.push(...den(", "));
    const mark = input.variadic ? "..." : input.required === false ? "?" : input.convert ? "~" : "";
    parts.push(...den(`${input.name}${mark}: `));
    if (input.lazy) parts.push({ text: "lazy", cls: "keyword" }, { text: " " });
    parts.push(...den(typeToString(input.type)));
  });
  parts.push(...den(") -> "), ...den(typeToString(op.output)));
  return parts;
}

/** The op whose name covers the hovered character, with the name's range. */
export interface OpHover {
  op: OpDefinition;
  from: number;
  to: number;
}

/**
 * The op under the pointer, or undefined. `pos` and `side` are CodeMirror's: the position the
 * pointer is nearest, and whether it is before it (-1) or after it (1), so the character under
 * it is `pos - 1` or `pos`. A name's first and last characters are on it; the gap after it is
 * not. A token is an op where the highlighter colours it as one.
 */
export function hoverAt(
  source: string,
  pos: number,
  side: -1 | 1,
  language: Language,
): OpHover | undefined {
  const char = side < 0 ? pos - 1 : pos;
  const range = styledRanges(source, language).find(
    (r) => r.cls === "op" && r.from <= char && char < r.to,
  );
  const op = range && language.descriptor.ops.get(source.slice(range.from, range.to));
  return range && op ? { op, from: range.from, to: range.to } : undefined;
}

/** The hover extension: `hoverAt` as a CodeMirror tooltip. */
export function opHover(language: Language) {
  return hoverTooltip((view, pos, side): Tooltip | null => {
    const hover = hoverAt(view.state.doc.toString(), pos, side, language);
    if (!hover) return null;
    return {
      pos: hover.from,
      end: hover.to,
      above: true,
      create: () => {
        // Text nodes only: a description is a host's string, never markup. The `tok-*`
        // classes take the same colours as the code (style.css).
        const dom = document.createElement("div");
        dom.className = "dendrite-hover";
        const signature = dom.appendChild(document.createElement("code"));
        signature.className = "dendrite-hover-signature";
        for (const part of signatureParts(hover.op, language)) {
          if (!part.cls) {
            signature.append(part.text);
            continue;
          }
          const span = signature.appendChild(document.createElement("span"));
          span.className = `tok-${part.cls}`;
          span.textContent = part.text;
        }
        if (hover.op.description) {
          const description = dom.appendChild(document.createElement("p"));
          description.className = "dendrite-hover-description";
          description.textContent = hover.op.description;
        }
        return { dom };
      },
    };
  });
}
