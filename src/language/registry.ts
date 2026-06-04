
import { ZodType } from 'zod'

export interface TypeDefinition {
  name: string;
  schema: ZodType<unknown>;
}

//? Definition types - the shape of what gets registered
export interface OpInput {
  name: string;
  type: string;       // registered type name
  required?: boolean;
  variadic?: boolean;  // if true, input expects ASTNode[] (multiple connections in editor)
}

export interface OpDefinition {
  name: string;
  inputs: OpInput[];
  output: string;     // registered type name
  category?: string   // editor grouping hint
}

export interface InputDefinition {
  name: string;
  type: string;       // registered type name
  trigger?: boolean;   // discrete event - value resets to default after firing
  default?: unknown;   // value when inactive
}

/**
 * Output requirement mode:
 * 'optional'  - fine either way, no warning if absent
 * 'desired'   - AnalysisWarning (missing_desired_output) if program doesn't declare it
 * 'required'  - AnalysisError (missing_required_output) if program doesn't declare it
 */
export type OutputMode = 'optional' | 'desired' | 'required'

export interface OutputDefinition {
  name: string;
  type: string;       // registered type name
  required?: OutputMode;   // defaults to 'optional'
}

export interface EvaluatorDefinition {
  op: string;
  // inputs: resolved values keyed by input name.
  //   single inputs -> unknown
  //   variadic inputs -> unknown[]
  // hostContext: opaque - cast to host type in host evaluators
  evaluate: (inputs: Record<string, unknown>, hostContext?: unknown) => unknown;
}

/**
 * Higher-order evaluator - for ops that need to evaluate sub-expressions
 * in a new environment (Filter, Map, Find, Reduce, etc.).
 *
 * Receives pre-resolved inputs (same as EvaluatorDefinition) plus a
 * pre-built apply() function. apply() handles environment extension and
 * body interpretation. Evaluators never see interpreter internals.
 *
 */
export interface HigherOrderEvaluatorDefinition {
  op: string
  evaluate: (
    inputs: Record<string, unknown>,
    apply: (...args: unknown[]) => unknown,
    hostContext?: unknown,
  ) => unknown
}

//? Language descriptor - Single source of truth for the language shape. 
export interface LanguageDescriptor {
  types: Map<string, TypeDefinition>;
  ops: Map<string, OpDefinition>;
  inputs: Map<string, InputDefinition>;
  outputs: Map<string, OutputDefinition>;
  evaluators: Map<string, EvaluatorDefinition>;
  higherOrderEvaluators: Map<string, HigherOrderEvaluatorDefinition>;
}


//? Language - The registration API
export interface Language {
  descriptor: LanguageDescriptor;
  registerType(name: string, schema: ZodType<unknown>): void;
  registerOp(def: OpDefinition): void;
  registerInput(def: InputDefinition): void;
  registerOutput(def: OutputDefinition): void;
  registerEvaluator(def: EvaluatorDefinition): void;
  registerHigherOrder(def: HigherOrderEvaluatorDefinition): void;
}

 
function createDescriptor(): LanguageDescriptor {
  return {
    types: new Map(),
    ops: new Map(),
    inputs: new Map(),
    outputs: new Map(),
    evaluators: new Map(),
    higherOrderEvaluators: new Map(),
  }
}

export function createLanguage(): Language {
  const descriptor = createDescriptor()
  return {
    descriptor,
    registerType: (name, schema) =>
      descriptor.types.set(name, { name, schema }),
    registerOp: (def) =>
      descriptor.ops.set(def.name, def),
    registerInput: (def) =>
      descriptor.inputs.set(def.name, def),
    registerOutput: (def) =>
      descriptor.outputs.set(def.name, def),
    registerEvaluator: (def) =>
      descriptor.evaluators.set(def.op, def),
    registerHigherOrder: (def) =>
      descriptor.higherOrderEvaluators.set(def.op, def),
  }
}

/**
 * Extend a language - child inherits all parent registrations.
 * Beacon calls this with the core language.
 * New registrations on child do not affect parent.
 */
export function extendLanguage(parent: Language): Language {
  const child = createLanguage();
  const d = parent.descriptor;
  d.types.forEach((v, k) => child.descriptor.types.set(k, v));
  d.ops.forEach((v, k) => child.descriptor.ops.set(k, v));
  d.inputs.forEach((v, k) => child.descriptor.inputs.set(k, v));
  d.outputs.forEach((v, k) => child.descriptor.outputs.set(k, v));
  d.evaluators.forEach((v, k) => child.descriptor.evaluators.set(k, v));
  d.higherOrderEvaluators.forEach((v, k) => child.descriptor.higherOrderEvaluators.set(k, v));
  return child;
}