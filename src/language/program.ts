import { type ASTNode, type SourceRef } from './nodes'
import { type LanguageDescriptor } from './registry'

//? Raw EXT Program - Parser output without validation.
export interface RawProgram {
  bindings: Map<string, ASTNode>;
  outputs: Map<string, ASTNode>;
}

// ? Core C Program - output of analyse, input to interpreter.
export interface CoreProgram {
  /** All named bindings: Set x = ... */
  bindings: Map<string, ASTNode>;
 
  /** Named program outputs: return tally: s1 */
  outputs: Map<string, ASTNode>;
 
  /** Bindings reachable from any output - computed at parse time
   * Used to skip unused bindings during eval.
   */
  usedBindings: Set<string>;
 
  /**
   * Topological sort of usedBindings.
   * interp walks this in order - dependencies always before dependents.
   * Computed at analyse time. Cycles produce an AnalysisError.
   */
  evalOrder: string[];
 
  /**
   * Forward dependency map - used for dirty propagation during interp.
   * name -> bindings that directly depend on it.
   * Input node names are valid keys.
   */
  dependents: Map<string, Set<string>>;
 
  /**
   * Per-output contributing inputs
   * outputName -> Set of input node names that transitively contribute to it.
   * e.g. 'tally' → Set(['sourceBusNew', 'sourceBusOld'])
   * Not currently used in the interpretter, but exposed outside the library to be used.
   */
  outputDependencies: Map<string, Set<string>>;
}

//? Compute outputDependencies - used during analysis.
export function computeOutputDependencies(
  raw: RawProgram,
): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>()
  for (const [outputName, outputNode] of raw.outputs) {
    const inputs = new Set<string>()
    collectContributingInputs(outputNode, raw.bindings, inputs, new Set())
    result.set(outputName, inputs)
  }
  return result
}

function collectContributingInputs(
  node: ASTNode,
  bindings: Map<string, ASTNode>,
  inputs: Set<string>,
  visited: Set<string>,
): void {
  switch (node.kind) {
    case 'literal':
      return
 
    case 'array':
      node.items.forEach((n: ASTNode) => collectContributingInputs(n, bindings, inputs, visited))
      return
 
    case 'input':
      inputs.add(node.name)
      return
 
    case 'ref': {
      if (visited.has(node.name)) return
      visited.add(node.name)
      const binding = bindings.get(node.name)
      if (binding) collectContributingInputs(binding, bindings, inputs, visited)
      return
    }
 
    case 'field':
      collectContributingInputs(node.source, bindings, inputs, visited)
      return
 
    case 'operation':
      for (const input of Object.values(node.inputs)) {
        if (Array.isArray(input)) {
          input.forEach((n: ASTNode) => collectContributingInputs(n, bindings, inputs, visited))
        } else {
          collectContributingInputs(input, bindings, inputs, visited)
        }
      }
      return
 
    case 'higher_order':
      for (const input of Object.values(node.inputs)) {
        if (Array.isArray(input)) {
          input.forEach((n: ASTNode) => collectContributingInputs(n, bindings, inputs, visited))
        } else {
          collectContributingInputs(input, bindings, inputs, visited)
        }
      }
      // Also include external references used in the body.
      collectContributingInputs(node.body, bindings, inputs, visited)
      return
  }
}

//? EvalState - persistent across events, one instance per program
 
export interface EvalState {
  /**
   * Resolved values for both bindings and input nodes.
   * Maps names to values.
   * Persists between events - clean nodes retain their values here.
   */
  environment: Map<string, unknown> // TODO: Should this be named cache or something else? Different from per eval cache.
 
  /** Bindings needing recomputation on next interpretProgram call */
  dirty: Set<string>
}

//? Parse Results
// TODO: Duplicate bind? Or warning and ignore?
export type ParseErrorKind =
  | 'syntax_error'
  | 'unexpected_token'
  | 'unexpected_end'

export interface ParseError {
  kind: ParseErrorKind
  message: string
  source?: SourceRef
}

export type ParseWarningKind =
  | 'deprecated_syntax'

export interface ParseWarning {
  kind: ParseWarningKind
  message: string
  source?: SourceRef
} 

export interface ParseSuccess {
  ok: true
  program: RawProgram
  warnings: ParseWarning[]
}

export interface ParseFailure {
  ok: false
  errors: ParseError[]
  warnings: ParseWarning[]
}


export type ParseResult = ParseSuccess | ParseFailure
 
//? Analysis Results
export type AnalysisErrorKind =
  | 'unknown_op'              // Op not registered → hard error
  | 'unknown_input'           // Input node not registered → hard error
  | 'unknown_type'            // Type reference not registered → hard error
  | 'undefined_reference'     // Reference to undefined binding → hard error
  | 'input_type_mismatch'     // op input receives wrong type
  | 'cycle'                   // Cycle in DAG → hard error
  | 'missing_required_output' // Registered required output not returned → hard error

export interface AnalysisError {
  kind: AnalysisErrorKind
  name: string
  message: string
  source?: SourceRef
}
 
export type AnalysisWarningKind =
  | 'unknown_output'          // return foo: x - 'foo' not registered → warning, dropped
  | 'output_type_mismatch'    // return tally: s1 but s1 is not TallyState → warning, dropped
  | 'unused_binding'          // Set x = ... but x never referenced → warning, kept
  | 'missing_desired_output'  // registered desired output not returned → warning

export interface AnalysisWarning {
  kind: AnalysisWarningKind
  name: string
  message: string
  source?: SourceRef
}

export interface AnalysisSuccess {
  ok: true
  program: CoreProgram
  warnings: AnalysisWarning[] // TODO: Also add parse warnings?
}
 
export interface AnalysisFailure {
  ok: false
  errors: AnalysisError[]
  warnings: AnalysisWarning[] // TODO: Also add parse warnings?
}
 
export type AnalysisResult = AnalysisSuccess | AnalysisFailure


//? Evalstate Management
export function createEvalState(): EvalState {
  return { environment: new Map(), dirty: new Set() }
}
 
/** Mark all usedBindings dirty - call once after createEvalState */
export function initializeProgram(
  program: CoreProgram,
  state: EvalState,
): void {
  for (const name of program.usedBindings) {
    state.dirty.add(name)
  }
}
 
/**
 * Update a context input and propagate dirty forward through the DAG.
 * Beacon calls this when ATEM state changes.
 */
export function updateInput(
  name: string,
  value: unknown,
  state: EvalState,
  program: CoreProgram,
): void {
  state.environment.set(name, value)
  markDirty(name, state, program)
}
 
export function markDirty(
  name: string,
  state: EvalState,
  program: CoreProgram,
): void {
  if (state.dirty.has(name)) return
  state.dirty.add(name)
  for (const dep of program.dependents.get(name) ?? []) {
    markDirty(dep, state, program)
  }
}

//? Evaluation
export function evaluate( // TODO Should be named evaluateNode? To work well with evaluateProgram?
  node: ASTNode,
  state: EvalState,
  descriptor: LanguageDescriptor,
  hostContext?: unknown,
): unknown {
  switch (node.kind) {
 
    case 'literal':
      return node.value
 
    case 'array':
      return node.items.map((n: ASTNode) => evaluate(n, state, descriptor, hostContext))
 
    case 'input':
      return state.environment.get(node.name)
 
    case 'ref':
      return state.environment.get(node.name)
 
    case 'field': {
      const src = evaluate(node.source, state, descriptor, hostContext) as Record<string, unknown>
      return src[node.field]
    }
 
    case 'higher_order': {
      const evaluator = descriptor.higherOrderEvaluators.get(node.op)
      if (!evaluator) throw new EvalError('evaluator_not_found', `No higher-order evaluator for op: ${node.op}`)
 
      const resolved: Record<string, unknown> = {}
      for (const [key, input] of Object.entries(node.inputs)) {
        resolved[key] = Array.isArray(input)
          ? input.map((n: ASTNode) => evaluate(n, state, descriptor, hostContext))
          : evaluate(input, state, descriptor, hostContext)
      }
 
      const apply = (...args: unknown[]) => {
        let inner = state
        for (let i = 0; i < node.bindings.length; i++) {
          inner = withBinding(inner, node.bindings[i], args[i])
        }
        return evaluate(node.body, inner, descriptor, hostContext)
      }
 
      return evaluator.evaluate(resolved, apply, hostContext)
    }
 
    case 'operation': {
      const evaluator = descriptor.evaluators.get(node.op)
      if (!evaluator) throw new EvalError('evaluator_not_found', `No evaluator for op: ${node.op}`)
 
      const resolved: Record<string, unknown> = {}
      for (const [key, input] of Object.entries(node.inputs)) {
        resolved[key] = Array.isArray(input)
          ? input.map((n: ASTNode) => evaluate(n, state, descriptor, hostContext))
          : evaluate(input, state, descriptor, hostContext)
      }
 
      return evaluator.evaluate(resolved, hostContext)
    }
  }
}

/**
 * Evaluate all dirty bindings in topological order, return named output values.
 * Clean nodes are skipped - their cached values are used directly.
 */
export function evaluateProgram(
  program: CoreProgram,
  state: EvalState,
  descriptor: LanguageDescriptor,
  hostContext?: unknown,
): Map<string, unknown> {
  for (const name of program.evalOrder) {
    if (!state.dirty.has(name)) continue
    const node = program.bindings.get(name)!
    state.environment.set(name, evaluate(node, state, descriptor, hostContext))
    state.dirty.delete(name)
  }
 
  const results = new Map<string, unknown>()
  for (const [outputName, node] of program.outputs) {
    results.set(outputName, evaluate(node, state, descriptor, hostContext))
  }
  return results
}

//? Helpers
/**
 * Create a derived EvalState with an extra binding for filter/map item scope.
 * Does not mutate the parent state.
 */
function withBinding(state: EvalState, name: string, value: unknown): EvalState {
  const inner = new Map(state.environment)
  inner.set(name, value)
  return { environment: inner, dirty: state.dirty }
}


//? Eval Errors
export type EvalErrorKind =
  | 'evaluator_not_found'   // safety net - analyser bug or descriptor mismatch
  | 'input_not_set'         // input node has no value in environment
  | 'invalid_field_access'  // field doesn't exist on struct value
  | 'host_error'            // host evaluator threw

// TODO: Also add parse and analyse errors?
export class EvalError extends Error {
  constructor(
    public readonly kind: EvalErrorKind,
    message: string,
  ) {
    super(message)
    this.name = 'EvalError'
  }
}
