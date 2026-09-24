import { type Ports, type SavedAstProgram, type Type } from "@dendrite-lang/core";

//? What DiagnosticsTable.astro prints beside each sample, kept out of the component so it
// can be tested (diagnostics.test.ts).
//
// Two jobs, both of which the page used to drop on the floor. `declarationsOf` prints a
// sample's port declarations - 25 samples carry them, and five of the `ports` kinds are
// provoked by a declaration rather than by any program, so a page showing only
// `output x = 1` under `invalid_name` reads as a lie. `hostCodeParts` prints a sample that is
// a graph rather than text as the host code that builds it, the only honest way to show a
// kind the code syntax cannot express.
//
// The declarations come out as the editor's own token classes (`tok-*`) and its pane rows, so
// an entry looks like the MinimalLayout it would be if the page mounted a live editor per
// sample - which would put ~670 kB of JavaScript on a reference page that today ships none.
// The host code comes out as TypeScript text, for the site's Shiki call to colour.

/** A stretch of text with one of the editor's token classes, or none. */
export interface Part {
  text: string;
  cls?: string;
}

const t = (text: string, cls?: string): Part => ({ text, cls });

/** A type as the editor colours one: the name in the type colour, the rest punctuation. */
function typeParts(type: Type): Part[] {
  switch (type.kind) {
    case "name":
      return [t(type.name, "type")];
    case "array":
      return [...typeParts(type.element), t("[]", "punct")];
    case "function":
      return [
        t("(", "punct"),
        ...type.params.flatMap((param, index) =>
          index === 0 ? typeParts(param) : [t(", ", "punct"), ...typeParts(param)],
        ),
        t(") ", "punct"),
        t("->", "symbol"),
        t(" "),
        ...typeParts(type.returns),
      ];
  }
}

// ── the declarations, as the panes would show them ─────────────────────────────

/** One declared port: what an Inputs or Outputs row renders. */
export interface PortLine {
  /** `$score` for an input, `total` for an output - an input wears its sigil. */
  name: string;
  type: Part[];
  /** `required`, `desired`, `trigger`, `= 20`: what no pane has room for yet. */
  tags: string[];
}

export interface Declarations {
  /** A layer's own type definitions. No pane shows these, so they stay text. */
  types: Part[][];
  inputs: PortLine[];
  outputs: PortLine[];
  /** The sample declares an empty layer, on purpose. */
  empty: boolean;
}

/** `Bus { id: number }`, `Child extends Parent { id: string }`, or a bare `Reading`. */
function typeDefinitionParts(definition: NonNullable<Ports["types"]>[number]): Part[] {
  const parts: Part[] = [t(definition.name, "type")];
  if (definition.extends) parts.push(t(" extends ", "keyword"), t(definition.extends, "type"));
  const fields = Object.entries(definition.fields ?? {});
  if (fields.length > 0) {
    parts.push(t(" { ", "punct"));
    fields.forEach(([name, type], index) => {
      if (index > 0) parts.push(t(", ", "punct"));
      parts.push(t(name, "ident"), t(": ", "punct"), ...typeParts(type));
    });
    parts.push(t(" }", "punct"));
  }
  return parts;
}

/** The declarations a sample carries, or null when it declares no layer at all. */
export function declarationsOf(ports: Ports | undefined): Declarations | null {
  if (!ports) return null;
  const types = (ports.types ?? []).map(typeDefinitionParts);
  const inputs = ports.inputs.map((input) => ({
    name: `$${input.name}`,
    type: typeParts(input.type),
    tags: [
      ...(input.trigger ? ["trigger"] : []),
      ...(input.default === undefined ? [] : [`= ${JSON.stringify(input.default)}`]),
    ],
  }));
  const outputs = ports.outputs.map((output) => ({
    name: output.name,
    type: typeParts(output.type),
    tags: output.mode ? [output.mode] : [],
  }));
  return {
    types,
    inputs,
    outputs,
    empty: types.length === 0 && inputs.length === 0 && outputs.length === 0,
  };
}

// ── a graph, as the host code that builds it ───────────────────────────────────

const TYPE_CONSTANTS = ["any", "null", "number", "boolean", "string"];

const isType = (value: object): value is Type =>
  ("kind" in value &&
    value.kind === "name" &&
    "name" in value &&
    Object.keys(value).length === 2) ||
  ("kind" in value && value.kind === "array" && "element" in value) ||
  ("kind" in value && value.kind === "function" && "returns" in value);

/** `Type.number`, `Type.name("Bus")`, `Type.array(Type.number)`. */
function printType(type: Type): string {
  switch (type.kind) {
    case "name":
      return TYPE_CONSTANTS.includes(type.name) ? `Type.${type.name}` : `Type.name("${type.name}")`;
    case "array":
      return `Type.array(${printType(type.element)})`;
    case "function":
      return `Type.fn([${type.params.map(printType).join(", ")}], ${printType(type.returns)})`;
  }
}

/** A node, an array, or a plain value, as the TypeScript that produces it. */
function print(value: unknown, indent: string): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return value.length === 0 ? "[]" : `[${value.map((item) => print(item, indent)).join(", ")}]`;
  }
  if (isType(value)) return printType(value);

  // `source` is a span the parser sets; a hand-built node has none, and it is noise here.
  const entries = Object.entries(value).filter(
    ([key, field]) => field !== undefined && key !== "source",
  );

  // An operation node reads as its constructor, which is what a host writes.
  if ("kind" in value && value.kind === "operation" && "op" in value && "inputs" in value) {
    return `operationNode("${String(value.op)}", ${print(value.inputs, indent)})`;
  }

  if (entries.length === 0) return "{}";

  const inner = `${indent}  `;
  const pair = (key: string, field: unknown, at: string): string => `${key}: ${print(field, at)}`;
  const oneLine = `{ ${entries.map(([key, field]) => pair(key, field, inner)).join(", ")} }`;
  if (oneLine.length + indent.length <= 88) return oneLine;
  return `{
${entries
  .map(
    ([key, field]) => `${inner}${pair(key, field, inner)},
`,
  )
  .join("")}${indent}}`;
}

/**
 * A sample in `ast` form, as the `bindings` and `outputs` a host hands to `analyse`: real
 * TypeScript, so the site's own highlighter colours it (`plugins/shiki-ts.ts`) rather than this
 * file guessing at token classes.
 */
export const hostCode = (example: SavedAstProgram): string =>
  `bindings: ${print(example.bindings, "")},
outputs: ${print(example.outputs, "")},`;
