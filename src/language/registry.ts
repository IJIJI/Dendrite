
import { ZodType } from 'zod'

//? Definition types
export interface TypeDefinition {
  name: string
  schema: ZodType<unknown>
}
 
export interface OpInput {
  name: string
  type: string
  required?: boolean
  variadic?: boolean
}

// TODO: Should there even be a difference between higher order and standard? Could higher order not be a standard op with a function as its arg? Would enable multi function higher order nodes too..
export interface OpDefinition {
  name: string
  inputs: OpInput[]
  output: string
  category?: string
  /**
   * If true, this op uses HigherOrderNode in the AST rather than OperationNode.
   * The editor renders a body sub-graph input instead of wired inputs.
   */
  higherOrder?: boolean
  /**
   * Scoped variable names available inside the body sub-graph.
   * Declared here so the editor knows what can be wired inside the body.
   * Must match the bindings[] array on the HigherOrderNode at evaluate time.
   * e.g. ['item'] for Filter/Map, ['acc', 'item'] for Reduce
   */
  bodyBindings?: string[]
}

// TODO: Also use default for non-trigger inputs? Usefull for computation before they are set.
export interface InputDefinition {
  name: string
  type: string
  trigger?: boolean   // discrete event. value resets to default after firing
  default?: unknown   // value when inactive (used by Runtime.fireTrigger to reset)
}

/**
 * Output requirement mode:
 * 'optional'  - fine either way, no warning if absent
 * 'desired'   - AnalysisWarning (missing_desired_output) if program doesn't declare it
 * 'required'  - AnalysisError (missing_required_output) if program doesn't declare it
 */
export type OutputMode = 'optional' | 'desired' | 'required'
 
export interface OutputDefinition {
  name: string
  type: string
  mode?: OutputMode   // defaults to 'optional'
}

/**
 * The apply callback passed to higher-order evaluators.
 * Extends the current scope with item bindings and evaluates the body.
 */
export type Apply = (...args: unknown[]) => unknown

/**
 * Unified evaluator definition. covers both standard and higher-order ops.
 *
 * apply is undefined for standard (OperationNode) ops, they should ignore it.
 * apply is always defined for higher-order (HigherOrderNode) ops, they require it.
 */
export interface EvaluatorDefinition {
  op: string
  evaluate: (
    inputs: Record<string, unknown>,
    apply: Apply | undefined,
    hostContext?: unknown,
  ) => unknown
}

//? Language descriptor - Single source of truth for the editor, analyser, evaluator.
export interface LanguageDescriptor {
  types:      ReadonlyMap<string, TypeDefinition>
  ops:        ReadonlyMap<string, OpDefinition>
  inputs:     ReadonlyMap<string, InputDefinition>
  outputs:    ReadonlyMap<string, OutputDefinition>
  evaluators: ReadonlyMap<string, EvaluatorDefinition>
}


//? Language: The registration API
export interface Language {
  descriptor: LanguageDescriptor
  registerType(name: string, schema: ZodType<unknown>): void
  registerOp(def: OpDefinition): void
  registerInput(def: InputDefinition): void
  registerOutput(def: OutputDefinition): void
  registerEvaluator(def: EvaluatorDefinition): void
}

 
export function createLanguage(): Language {
  const types      = new Map<string, TypeDefinition>()
  const ops        = new Map<string, OpDefinition>()
  const inputs     = new Map<string, InputDefinition>()
  const outputs    = new Map<string, OutputDefinition>()
  const evaluators = new Map<string, EvaluatorDefinition>()
 
  const descriptor: LanguageDescriptor = { types, ops, inputs, outputs, evaluators }
 
  return {
    descriptor,
    registerType:      (name, schema) => types.set(name, { name, schema }),
    registerOp:        (def)          => ops.set(def.name, def),
    registerInput:     (def)          => inputs.set(def.name, def),
    registerOutput:    (def)          => outputs.set(def.name, def),
    registerEvaluator: (def)          => evaluators.set(def.op, def),
  }
}

/**
 * Create a new Language pre-populated with all definitions from a parent.
 * The child shares no mutable state with the parent.
 */
export function extendLanguage(parent: Language): Language {
  const child = createLanguage()
  const d = parent.descriptor
  d.types.forEach(v      => child.registerType(v.name, v.schema))
  d.ops.forEach(v        => child.registerOp(v))
  d.inputs.forEach(v     => child.registerInput(v))
  d.outputs.forEach(v    => child.registerOutput(v))
  d.evaluators.forEach(v => child.registerEvaluator(v))
  return child
}