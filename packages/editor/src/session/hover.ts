import { type Extension } from "@codemirror/state";
import { hoverTooltip } from "@codemirror/view";
import {
  defaultValueFor,
  type Language,
  type OpDefinition,
  type ProgramInstance,
  Type,
  typeToString,
} from "@dendrite-lang/core";

import { type HoverTarget, hoverAt, signatureParts } from "../code/hover";
import { type SourcePart, sourceParts } from "../code/source";
import { formatValue } from "../ports/format";

//? The editor's one hover: what `hoverAt` finds, explained from the language and the running
// instance. `hoverContent` is plain data, tested without a DOM; `dendriteHover` wires it into
// CodeMirror and renders it with text nodes and `tok-*` spans only, never markup, since a
// description, a name or a value may be a host's or a user's string.

/** What a hover shows: a coloured head, plain notes under it, then coloured code blocks. */
export interface HoverContent {
  head: SourcePart[];
  notes: string[];
  code: SourcePart[][];
}

const NOT_DECLARED = "No layer declares it.";

// A value is shown in one line, cut short: a host's input may hold a whole dataset.
const LIMIT = 120;
const shown = (value: unknown): string => {
  const text = formatValue(value);
  return text.length > LIMIT ? `${text.slice(0, LIMIT - 1)}…` : text;
};

/**
 * What to say about a target, read from the instance when it is called, so a value is the
 * current one. Nothing for an input or an output while the ports do not compose (the
 * Diagnostics pane says why).
 */
export function hoverContent(
  target: HoverTarget,
  instance: ProgramInstance,
  language: Language,
): HoverContent | undefined {
  switch (target.kind) {
    case "op":
      return opContent(target.op, language);
    case "input":
      return inputContent(target.name, instance, language);
    case "output":
      return outputContent(target.name, instance, language);
    case "type":
      return typeContent(target.name, language);
  }
}

function opContent(op: OpDefinition, language: Language): HoverContent {
  const example = op.examples?.find((saved) => saved.form === "code");
  return {
    head: signatureParts(op, language),
    notes: op.description ? [op.description] : [],
    code: example?.form === "code" ? [sourceParts(example.source, language)] : [],
  };
}

function inputContent(
  name: string,
  instance: ProgramInstance,
  language: Language,
): HoverContent | undefined {
  const { composed, layers } = instance.ports.get();
  if (!composed.ok) return undefined;
  const def = composed.descriptor.inputs.get(name);
  const origin = composed.provenance.inputs.get(name);
  if (!def || !origin) {
    return { head: sourceParts(`$${name}`, language), notes: [NOT_DECLARED], code: [] };
  }
  // Layer ids are unique across both levels: composing refuses a repeated one.
  const layer = layers.find((attached) => attached.layer.id === origin.layerId)?.layer;
  const feeds = layer?.policy.feeds === "host" ? "the host" : "the user";
  return {
    head: sourceParts(`$${name}: ${typeToString(def.type)}`, language),
    notes: [
      ...(def.trigger ? ["A trigger: it goes back to its start value after it fires."] : []),
      `Starts at ${shown(defaultValueFor(def, composed.descriptor))}.`,
      `Declared by layer '${origin.layerId}', fed by ${feeds}.`,
      // The instance holds program-level values only; a global one lives in the runtime.
      origin.level === "global"
        ? "A global input: its value is the host's."
        : `Value: ${shown(instance.values.get()[name])}`,
    ],
    code: [],
  };
}

function outputContent(
  name: string,
  instance: ProgramInstance,
  language: Language,
): HoverContent | undefined {
  const { composed } = instance.ports.get();
  if (!composed.ok) return undefined;
  const def = composed.descriptor.outputs.get(name);
  const origin = composed.provenance.outputs.get(name);
  const { outputs, stale } = instance.outputs.get();
  // An undeclared output is still produced, so it still has a value to show.
  return {
    head: sourceParts(
      def ? `output ${name}: ${typeToString(def.type)}` : `output ${name}`,
      language,
    ),
    notes: [
      def && origin
        ? `Declared by layer '${origin.layerId}', ${def.mode ?? "optional"}.`
        : NOT_DECLARED,
      outputs?.has(name)
        ? `Value: ${shown(outputs.get(name))}${stale ? " (stale)" : ""}`
        : "No value yet.",
    ],
    code: [],
  };
}

function typeContent(name: string, language: Language): HoverContent | undefined {
  const def = language.descriptor.types.get(name);
  if (!def) return undefined;
  // The one rule every input is seeded by, for an input that declares no default of its own.
  const start = defaultValueFor({ name, type: Type.name(name) }, language.descriptor);
  const lines = Object.entries(def.fields ?? {}).map(
    ([field, type]) => `${field}: ${typeToString(type)}`,
  );
  return {
    head: sourceParts(name, language),
    notes: [
      ...(def.extends ? [`Extends ${def.extends}.`] : []),
      `An input of this type starts at ${shown(start)}.`,
    ],
    code: lines.length > 0 ? [sourceParts(lines.join("\n"), language)] : [],
  };
}

/** The hover extension: `hoverAt`, then `hoverContent`, as a CodeMirror tooltip. */
export function dendriteHover(instance: ProgramInstance, language: Language): Extension {
  return hoverTooltip((view, pos, side) => {
    const target = hoverAt(view.state.doc.toString(), pos, side, language);
    const content = target && hoverContent(target, instance, language);
    if (!target || !content) return null;
    return {
      pos: target.from,
      end: target.to,
      above: true,
      create: () => ({ dom: render(content) }),
    };
  });
}

function render({ head, notes, code }: HoverContent): HTMLElement {
  const dom = document.createElement("div");
  dom.className = "dendrite-hover";
  dom.append(codeElement(head, "dendrite-hover-head"));
  for (const note of notes) {
    const p = dom.appendChild(document.createElement("p"));
    p.className = "dendrite-hover-note";
    p.textContent = note;
  }
  for (const block of code) dom.append(codeElement(block, "dendrite-hover-code"));
  return dom;
}

// Coloured parts as a `<code>`: the `tok-*` classes take the code's own colours (style.css).
function codeElement(parts: readonly SourcePart[], className: string): HTMLElement {
  const code = document.createElement("code");
  code.className = className;
  for (const part of parts) {
    if (!part.cls) {
      code.append(part.text);
      continue;
    }
    const span = code.appendChild(document.createElement("span"));
    span.className = `tok-${part.cls}`;
    span.textContent = part.text;
  }
  return code;
}
