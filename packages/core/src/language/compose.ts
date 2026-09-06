import { z } from "zod";

import { validateDescriptor } from "./analyser/analyser";
import { type AnalysisError } from "./analyser/types";
import { isIdentifier } from "./infra/identifier";
import { type PortLayer } from "./infra/ports";
import {
  type InputDefinition,
  type LanguageDescriptor,
  type OutputDefinition,
  type TypeDefinition,
} from "./infra/registry";

//? composeLayers: stack PortLayers onto a language descriptor and produce the descriptor a
// program is analysed against, or the problems that make the stack unusable. Pure. Order is
// authority: layers are walked global first, then program, and a name already taken by the
// language or an earlier layer is a `shadowed_name` problem attributed to the LATER layer.
// Provenance records which layer (and level) declared every type, input and output, so a
// runtime can route values and a UI can point at the offending row.

export interface PortOrigin {
  layerId: string;
  level: "global" | "program"; // TODO: Enum?
}

export interface PortProblem {
  kind:
    | "invalid_name"
    | "duplicate_name"
    | "shadowed_name"
    | "unknown_type"
    | "incompatible_field_override";
  layerId: string;
  /** "input score" | "output result" | "type Bus" */
  where: string;
  message: string;
}

export interface Provenance {
  types: ReadonlyMap<string, PortOrigin>;
  inputs: ReadonlyMap<string, PortOrigin>;
  outputs: ReadonlyMap<string, PortOrigin>;
}

export type ComposeResult =
  | { ok: true; descriptor: LanguageDescriptor; provenance: Provenance }
  | { ok: false; problems: PortProblem[] };

type Kind = "type" | "input" | "output";

// One namespace of the composed descriptor: the language's entries plus what layers placed,
// and for the latter who placed it. Types, inputs and outputs are three separate namespaces.
interface Namespace<T> {
  kind: Kind;
  entries: Map<string, T>;
  owners: Map<string, PortOrigin>;
}

const namespace = <T>(kind: Kind, base: ReadonlyMap<string, T>): Namespace<T> => ({
  kind,
  entries: new Map(base),
  owners: new Map(),
});

/**
 * Compose `global` then `program` layers onto `descriptor` (a language descriptor that has
 * already passed validation, as `createEnvironment` guarantees). Every problem is collected,
 * not just the first.
 */
export function composeLayers(
  descriptor: LanguageDescriptor,
  global: readonly PortLayer[],
  program: readonly PortLayer[],
): ComposeResult {
  const types = namespace<TypeDefinition>("type", descriptor.types);
  const inputs = namespace<InputDefinition>("input", descriptor.inputs);
  const outputs = namespace<OutputDefinition>("output", descriptor.outputs);
  const problems: PortProblem[] = [];
  const seenLayerIds = new Set<string>();

  // Place one declaration into its namespace, or record why it cannot go there.
  const place = <T>(ns: Namespace<T>, at: PortOrigin, name: string, value: T): void => {
    const where = `${ns.kind} ${name}`;
    const problem = (kind: PortProblem["kind"], message: string) =>
      problems.push({ kind, layerId: at.layerId, where, message });
    if (!isIdentifier(name)) {
      problem("invalid_name", `'${name}' is not a valid ${ns.kind} name`);
    } else if (ns.owners.get(name)?.layerId === at.layerId) {
      problem("duplicate_name", `${ns.kind} '${name}' is declared twice in layer '${at.layerId}'`);
    } else if (ns.entries.has(name)) {
      const owner = ns.owners.get(name);
      const by = owner ? `layer '${owner.layerId}'` : "the language";
      problem(
        "shadowed_name",
        `${ns.kind} '${name}' in layer '${at.layerId}' is already declared by ${by}`,
      );
    } else {
      ns.entries.set(name, value);
      ns.owners.set(name, at);
    }
  };

  const walk = (layers: readonly PortLayer[], level: PortOrigin["level"]) => {
    for (const layer of layers) {
      if (seenLayerIds.has(layer.id)) throw new Error(`Duplicate layer id '${layer.id}'`);
      seenLayerIds.add(layer.id);
      const at: PortOrigin = { layerId: layer.id, level };
      for (const t of layer.ports.types ?? [])
        place(types, at, t.name, { ...t, schema: z.unknown() });
      for (const i of layer.ports.inputs) place(inputs, at, i.name, i);
      for (const o of layer.ports.outputs) place(outputs, at, o.name, o);
    }
  };
  walk(global, "global");
  walk(program, "program");

  // Referential integrity and struct-override soundness come from the analyser's own check,
  // attributed to layers through each error's subject.
  const composed: LanguageDescriptor = {
    types: types.entries,
    ops: descriptor.ops,
    inputs: inputs.entries,
    outputs: outputs.entries,
    evaluators: descriptor.evaluators,
  };
  const owners = { type: types.owners, input: inputs.owners, output: outputs.owners };
  for (const error of validateDescriptor(composed)) problems.push(attribute(error, owners));

  return problems.length > 0
    ? { ok: false, problems }
    : {
        ok: true,
        descriptor: composed,
        provenance: { types: types.owners, inputs: inputs.owners, outputs: outputs.owners },
      };
}

// The language part passed validation before any layer applied, so an error that no layer
// owns is a broken precondition, not a port problem.
function attribute(
  error: AnalysisError,
  owners: Record<Kind, ReadonlyMap<string, PortOrigin>>,
): PortProblem {
  const subject = error.subject;
  const origin =
    subject && subject.kind !== "op" ? owners[subject.kind].get(subject.name) : undefined;
  if (
    !subject ||
    !origin ||
    (error.kind !== "unknown_type" && error.kind !== "incompatible_field_override")
  ) {
    throw new Error(`Language descriptor is invalid before any layer applies: ${error.message}`);
  }
  return {
    kind: error.kind,
    layerId: origin.layerId,
    where: `${subject.kind} ${subject.name}`,
    message: error.message,
  };
}
