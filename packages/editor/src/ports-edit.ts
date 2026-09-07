import {
  type InputDefinition,
  type OutputDefinition,
  type Ports,
  Type,
  typeToString,
  type Vocabulary,
} from "@dendrite-lang/core";

//? Editing a layer's Ports as DATA. Pure functions that return new Ports, plus the type
// options a picker offers. Framework-free: a pane calls these and hands the result to
// instance.setLayer(), which composes it and answers with any problems - so nothing here
// validates. Names, duplicates and clashes with a layer beneath are core's to judge.

// ---- inputs ----

export const addInput = (ports: Ports, input: InputDefinition): Ports => ({
  ...ports,
  inputs: [...ports.inputs, input],
});

export const updateInput = (
  ports: Ports,
  name: string,
  patch: Partial<InputDefinition>,
): Ports => ({
  ...ports,
  inputs: ports.inputs.map((input) => (input.name === name ? { ...input, ...patch } : input)),
});

export const removeInput = (ports: Ports, name: string): Ports => ({
  ...ports,
  inputs: ports.inputs.filter((input) => input.name !== name),
});

// ---- outputs ----

export const addOutput = (ports: Ports, output: OutputDefinition): Ports => ({
  ...ports,
  outputs: [...ports.outputs, output],
});

export const updateOutput = (
  ports: Ports,
  name: string,
  patch: Partial<OutputDefinition>,
): Ports => ({
  ...ports,
  outputs: ports.outputs.map((output) => (output.name === name ? { ...output, ...patch } : output)),
});

export const removeOutput = (ports: Ports, name: string): Ports => ({
  ...ports,
  outputs: ports.outputs.filter((output) => output.name !== name),
});

// ---- naming ----

/**
 * `base`, then `base2`, `base3`… - the first that no declaration in `taken` holds. A new row
 * has to be named before it exists, and composing rejects a duplicate outright, so the name
 * must clear every layer's declarations of that kind, not just the one being edited.
 */
export function uniqueName(taken: Iterable<string>, base: string): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}

export interface TypeOption {
  label: string; // typeToString(type): "number", "Bus[]"
  type: Type;
}

/**
 * The types a declaration may pick: every named type the language knows (builtins first,
 * then the rest alphabetically; `null` is not a useful declaration) and the list of each.
 * One array level - nothing has needed more.
 *
 * No vocabulary means composition failed, so the type universe is unknown; the four
 * primitives are still offered, because a broken declaration is fixed by retyping it.
 */
export function typeOptions(descriptor?: Vocabulary): TypeOption[] {
  const primitives = ["number", "boolean", "string", "any"];
  const others = [...(descriptor?.types.keys() ?? [])]
    .filter((name) => !primitives.includes(name) && name !== "null")
    .sort();
  const options: TypeOption[] = [];
  for (const name of [...primitives, ...others]) {
    const named = Type.name(name);
    options.push({ label: typeToString(named), type: named });
    options.push({ label: typeToString(Type.array(named)), type: Type.array(named) });
  }
  return options;
}

/**
 * The options for ONE row's picker: `typeOptions` plus the type it already holds, so a
 * declaration naming a type the language lost still shows what it says and can be retyped
 * rather than only deleted.
 */
export function typeOptionsFor(descriptor: Vocabulary | undefined, current: Type): TypeOption[] {
  const options = typeOptions(descriptor);
  const label = typeToString(current);
  return options.some((option) => option.label === label)
    ? options
    : [{ label, type: current }, ...options];
}

/** The option whose label matches (what a <select> hands back), or undefined. */
export const typeFromLabel = (options: TypeOption[], label: string): Type | undefined =>
  options.find((option) => option.label === label)?.type;
