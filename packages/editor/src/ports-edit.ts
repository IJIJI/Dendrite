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

export interface TypeOption {
  label: string; // typeToString(type): "number", "Bus[]"
  type: Type;
}

/**
 * The types a declaration may pick: every named type the language knows (builtins first,
 * then the rest alphabetically; `null` is not a useful declaration) and the list of each.
 * One array level - nothing has needed more.
 */
export function typeOptions(descriptor: Vocabulary): TypeOption[] {
  const primitives = ["number", "boolean", "string", "any"];
  const others = [...descriptor.types.keys()]
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

/** The option whose label matches (what a <select> hands back), or undefined. */
export const typeFromLabel = (options: TypeOption[], label: string): Type | undefined =>
  options.find((option) => option.label === label)?.type;
