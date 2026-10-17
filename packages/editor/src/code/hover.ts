import { type Language, type OpDefinition, typeToString } from "@dendrite-lang/core";

import { type SourcePart, sourceParts } from "./source";
import { type StyledRange, styledRanges } from "./tokens";

//? The language half of the hover, pure and DOM-free: what is under the pointer (`hoverAt`),
// and an op's signature as coloured parts. What the hover then says about an input, an
// output or a type needs the running instance: that half is session/hover.ts.

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

/** What a hover explains, with the range of source it covers. */
export type HoverTarget = { from: number; to: number } & (
  | { kind: "op"; op: OpDefinition }
  | { kind: "input"; name: string }
  | { kind: "output"; name: string }
  | { kind: "type"; name: string }
);

/**
 * What is under the pointer, or undefined. `pos` and `side` are CodeMirror's: the position the
 * pointer is nearest, and whether it is before it (-1) or after it (1), so the character under
 * it is `pos - 1` or `pos`. A name's first and last characters are on it; the gap after it is
 * not. Each kind is read off the highlighter's classes, so a hover is where a colour is: an
 * op's name; an input's `$` or its name, either one covering both; the name right after the
 * `output` keyword; a type where a type is written.
 */
export function hoverAt(
  source: string,
  pos: number,
  side: -1 | 1,
  language: Language,
): HoverTarget | undefined {
  const char = side < 0 ? pos - 1 : pos;
  const ranges = styledRanges(source, language);
  const at = ranges.findIndex((r) => r.from <= char && char < r.to);
  const range = ranges[at];
  if (!range) return undefined;
  const text = (r: StyledRange): string => source.slice(r.from, r.to);
  const span = { from: range.from, to: range.to };
  switch (range.cls) {
    case "op": {
      const op = language.descriptor.ops.get(text(range));
      return op && { kind: "op", op, ...span };
    }
    case "input": {
      // The `$` and the name are two ranges of one class, the `$` always first.
      const [sigil, name] = text(range) === "$" ? [range, ranges[at + 1]] : [ranges[at - 1], range];
      return sigil && name?.cls === "input" && text(name) !== "$"
        ? { kind: "input", name: text(name), from: sigil.from, to: name.to }
        : undefined;
    }
    case "type":
      return { kind: "type", name: text(range), ...span };
    case "ident": {
      const before = ranges[at - 1];
      return before?.cls === "keyword" && text(before) === "output"
        ? { kind: "output", name: text(range), ...span }
        : undefined;
    }
    default:
      return undefined;
  }
}
