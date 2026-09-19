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
// Both come out as the editor's own token classes (`tok-*`) and, for the declarations, its
// pane rows, so an entry looks like the MinimalLayout it would be if the page mounted a live
// editor per sample - which would put ~670 kB of JavaScript on a reference page that today
// ships none. The same trick OpsReference.astro uses for its produced values.

/** A stretch of text with one of the editor's token classes, or none. */
export interface Part {
  text: string;
  cls?: string;
}

const t = (text: string, cls?: string): Part => ({ text, cls });

const width = (parts: Part[]): number => parts.reduce((sum, part) => sum + part.text.length, 0);

const escape = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The parts as HTML, the way the editor's own `sourceHtml` does it. A `<pre>` printing its
 * children cannot be reformatted by a formatter without changing what it shows, so the page
 * hands it one string instead.
 */
export const partsHtml = (parts: Part[]): string =>
  parts
    .map((part) =>
      part.cls ? `<span class="tok-${part.cls}">${escape(part.text)}</span>` : escape(part.text),
    )
    .join("");

/** The same parts as plain text. */
export const partsText = (parts: Part[]): string => parts.map((part) => part.text).join("");

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
        t("->", "operator"),
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
function printType(type: Type): Part[] {
  const call = (method: string, inner: Part[]): Part[] => [
    t("Type", "op"),
    t(".", "punct"),
    t(method, "ident"),
    t("(", "punct"),
    ...inner,
    t(")", "punct"),
  ];
  switch (type.kind) {
    case "name":
      return TYPE_CONSTANTS.includes(type.name)
        ? [t("Type", "op"), t(".", "punct"), t(type.name, "ident")]
        : call("name", [t(`"${type.name}"`, "string")]);
    case "array":
      return call("array", printType(type.element));
    case "function":
      return call("fn", [
        t("[", "punct"),
        ...type.params.flatMap((param, index) =>
          index === 0 ? printType(param) : [t(", ", "punct"), ...printType(param)],
        ),
        t("], ", "punct"),
        ...printType(type.returns),
      ]);
  }
}

const literalParts = (value: unknown): Part[] => {
  if (typeof value === "string") return [t(JSON.stringify(value), "string")];
  if (typeof value === "number") return [t(String(value), "number")];
  if (typeof value === "boolean" || value === null) return [t(String(value), "literal")];
  return [t(String(JSON.stringify(value)))];
};

/** A node, an array, or a plain value, as the TypeScript that produces it. */
function print(value: unknown, indent: string): Part[] {
  if (value === null || typeof value !== "object") return literalParts(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return [t("[]", "punct")];
    return [
      t("[", "punct"),
      ...value.flatMap((item, index) =>
        index === 0 ? print(item, indent) : [t(", ", "punct"), ...print(item, indent)],
      ),
      t("]", "punct"),
    ];
  }
  if (isType(value)) return printType(value);

  // `source` is a span the parser sets; a hand-built node has none, and it is noise here.
  const entries = Object.entries(value).filter(
    ([key, field]) => field !== undefined && key !== "source",
  );

  // An operation node reads as its constructor, which is what a host writes.
  if ("kind" in value && value.kind === "operation" && "op" in value && "inputs" in value) {
    return [
      t("operationNode", "op"),
      t("(", "punct"),
      t(`"${String(value.op)}"`, "string"),
      t(", ", "punct"),
      ...print(value.inputs, indent),
      t(")", "punct"),
    ];
  }

  if (entries.length === 0) return [t("{}", "punct")];

  const inner = `${indent}  `;
  const pair = (key: string, field: unknown, at: string): Part[] => [
    t(key, "ident"),
    t(": ", "punct"),
    ...print(field, at),
  ];
  const oneLine = [
    t("{ ", "punct"),
    ...entries.flatMap(([key, field], index) =>
      index === 0 ? pair(key, field, inner) : [t(", ", "punct"), ...pair(key, field, inner)],
    ),
    t(" }", "punct"),
  ];
  if (width(oneLine) + indent.length <= 88) return oneLine;
  return [
    t("{\n", "punct"),
    ...entries.flatMap(([key, field]) => [t(inner), ...pair(key, field, inner), t(",\n", "punct")]),
    t(indent),
    t("}", "punct"),
  ];
}

/** A sample in `ast` form, as the `bindings` and `outputs` a host hands to `analyse`. */
export function hostCodeParts(example: SavedAstProgram): Part[] {
  return [
    t("bindings", "ident"),
    t(": ", "punct"),
    ...print(example.bindings, ""),
    t(",\n", "punct"),
    t("outputs", "ident"),
    t(": ", "punct"),
    ...print(example.outputs, ""),
    t(",", "punct"),
  ];
}
