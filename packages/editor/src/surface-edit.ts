import { type LanguageDescriptor, Type, typeToString } from "@dendrite-lang/core";

import { type SurfaceInputSpec, type SurfaceOutputSpec, type SurfaceSpec } from "./surface";

//? Editing a SurfaceSpec as DATA. Pure functions that return a new spec (the document stays
// the snapshot - a Memento-to-be), validation against the language the spec will be applied
// to, and the type options a picker offers. Framework-free: the panes call these and hand
// the result to editor.setSurface(), which is where the language is actually rebuilt.

/** What a name may look like: the lexer's identifier (the `$` sigil is not part of it). */
export const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface SurfaceProblem {
  kind: "invalid_name" | "duplicate_name" | "reserved_name" | "unknown_type";
  /** Which declaration: "input" | "output" + its name. */
  where: string;
  message: string;
}

// ---- inputs ----

export const addInput = (surface: SurfaceSpec, input: SurfaceInputSpec): SurfaceSpec => ({
  ...surface,
  inputs: [...surface.inputs, input],
});

export const updateInput = (
  surface: SurfaceSpec,
  name: string,
  patch: Partial<SurfaceInputSpec>,
): SurfaceSpec => ({
  ...surface,
  inputs: surface.inputs.map((input) => (input.name === name ? { ...input, ...patch } : input)),
});

export const removeInput = (surface: SurfaceSpec, name: string): SurfaceSpec => ({
  ...surface,
  inputs: surface.inputs.filter((input) => input.name !== name),
});

// ---- outputs ----

export const addOutput = (surface: SurfaceSpec, output: SurfaceOutputSpec): SurfaceSpec => ({
  ...surface,
  outputs: [...surface.outputs, output],
});

export const updateOutput = (
  surface: SurfaceSpec,
  name: string,
  patch: Partial<SurfaceOutputSpec>,
): SurfaceSpec => ({
  ...surface,
  outputs: surface.outputs.map((output) =>
    output.name === name ? { ...output, ...patch } : output,
  ),
});

export const removeOutput = (surface: SurfaceSpec, name: string): SurfaceSpec => ({
  ...surface,
  outputs: surface.outputs.filter((output) => output.name !== name),
});

// ---- validation ----

const BUILTIN_TYPES = ["number", "boolean", "string", "any", "null"];

// The named type at the bottom of arrays; functions are not declarable from a picker.
const baseName = (t: Type): string | undefined =>
  t.kind === "name" ? t.name : t.kind === "array" ? baseName(t.element) : undefined;

/**
 * Problems that would make `user` unusable once applied on top of `provided` and the
 * language behind `descriptor`: bad or duplicate names, names the host already provides,
 * types that resolve nowhere. Empty = safe to apply.
 */
export function validateSurface(
  user: SurfaceSpec,
  descriptor: LanguageDescriptor,
  provided?: SurfaceSpec,
): SurfaceProblem[] {
  const problems: SurfaceProblem[] = [];
  const known = new Set<string>([
    ...BUILTIN_TYPES,
    ...descriptor.types.keys(),
    ...(provided?.types ?? []).map((t) => t.name),
    ...(user.types ?? []).map((t) => t.name),
  ]);

  const check = (
    kind: "input" | "output",
    declarations: { name: string; type: Type }[],
    reserved: string[],
  ) => {
    const seen = new Set<string>();
    for (const { name, type } of declarations) {
      const where = `${kind} ${name}`;
      if (!IDENTIFIER.test(name)) {
        problems.push({ kind: "invalid_name", where, message: `'${name}' is not a valid name` });
      } else if (seen.has(name)) {
        problems.push({
          kind: "duplicate_name",
          where,
          message: `${kind} '${name}' is declared twice`,
        });
      } else if (reserved.includes(name)) {
        problems.push({
          kind: "reserved_name",
          where,
          message: `${kind} '${name}' is provided by the host and cannot be redeclared`,
        });
      }
      seen.add(name);
      const base = baseName(type);
      if (base === undefined || !known.has(base)) {
        problems.push({
          kind: "unknown_type",
          where,
          message: `type '${typeToString(type)}' is not registered`,
        });
      }
    }
  };
  check(
    "input",
    user.inputs,
    (provided?.inputs ?? []).map((i) => i.name),
  );
  check(
    "output",
    user.outputs,
    (provided?.outputs ?? []).map((o) => o.name),
  );
  return problems;
}

// ---- type picker ----

export interface TypeOption {
  label: string; // typeToString(type): "number", "Bus[]"
  type: Type;
}

/**
 * The types a declaration may pick: every named type the language knows (builtins first,
 * then the rest alphabetically; `null` is not a useful declaration) and the list of each.
 * One array level - nothing has needed more.
 */
export function typeOptions(descriptor: LanguageDescriptor): TypeOption[] {
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
