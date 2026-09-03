import {
  type InputDefinition,
  type LanguageDescriptor,
  type Type,
  typeToString,
} from "@dendrite-lang/core";

//? descriptor.inputs → widget descriptions. Framework-free: this is the descriptor-driven
// UI mapping the future editor (code AND rete side) builds on; panes.ts renders it.
// The SESSION is the source of truth for values (panes read via getValue) - this module
// only describes shape, and provides the one shared initial-value derivation so the UI
// and the evaluator can never disagree about an input's starting value.

export type Control = "number" | "boolean" | "text" | "json";

export interface WidgetSpec {
  name: string;
  typeLabel: string; // e.g. "number", "Bus[]", "TallyState"
  control: Control;
}

// A named type's primitive base, following the `extends` chain - so a numeric enum like
// `TallyState extends number` gets a number widget, not a JSON box. Cycle-guarded.
const primitiveBase = (t: Type, descriptor: LanguageDescriptor): string | undefined => {
  if (t.kind !== "name") return undefined;
  const seen = new Set<string>();
  let current: string | undefined = t.name;
  while (current && !seen.has(current)) {
    if (current === "number" || current === "boolean" || current === "string") return current;
    seen.add(current);
    current = descriptor.types.get(current)?.extends;
  }
  return undefined;
};

const controlFor = (t: Type, descriptor: LanguageDescriptor): Control => {
  switch (primitiveBase(t, descriptor)) {
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "string":
      return "text";
    default:
      return "json"; // arrays, functions, structs, opaque named types
  }
};

/** The starting value for an input: its declared default, else a sensible zero. */
export function initialValueFor(def: InputDefinition, descriptor: LanguageDescriptor): unknown {
  if (def.default !== undefined) return def.default;
  switch (controlFor(def.type, descriptor)) {
    case "number":
      return 0;
    case "boolean":
      return false;
    case "text":
      return "";
    default:
      return def.type.kind === "array" ? [] : null;
  }
}

export function widgetsFor(descriptor: LanguageDescriptor): WidgetSpec[] {
  return [...descriptor.inputs.values()].map((def) => ({
    name: def.name,
    typeLabel: typeToString(def.type),
    control: controlFor(def.type, descriptor),
  }));
}
