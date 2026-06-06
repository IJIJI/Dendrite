import { CNode, type ASTNode, type SourceRef } from './nodes'
import { type LanguageDescriptor } from './registry'

//? Raw EXT Program - Parser output without validation. Nothing is computed with this.
export interface RawProgram {
  bindings: Map<string, ASTNode>
  outputs: Map<string, ASTNode>
}

// ? Core C Program - output of analyse, input to interpreter.
export interface CoreProgram {
  bindings: Map<string, CNode>
  outputs: Map<string, CNode>
}

//? EvalState - persistent across input changes, one instance per program
// TODO: Check var naming
// TODO: Check if there is a need for a split for scoped caching.
// inputs:    values set by the host - context inputs and triggers.
//            Keyed by name (host works with names, not CNode references).
//
// nodeCache: values computed by evaluate - named bindings and inline nodes.
//            Keyed by CNode object reference (WeakMap uses object identity).
//            WeakMap allows GC when CoreProgram is unregistered.
//
// bodyScope: fresh per apply() call inside a HigherOrderNode body.
//            Inline body nodes are cached here, not in nodeCache, to prevent
//            stale results across items (item binding is not tracked in dependsOn
//            since it is not a context input).
//            Named bindings referenced from the body still use nodeCache.
//            undefined at the top level (outside any body scope).

export interface EvalState {
  inputs: Map<string, unknown>
  nodeCache: WeakMap<object, unknown>
  bodyScope: WeakMap<object, unknown> | undefined
}
 
export function createEvalState(): EvalState {
  return {
    inputs: new Map(),
    nodeCache: new WeakMap(),
    bodyScope: undefined,
  }
}

//? Parse Results: text/graph -> RawProgram + diagnostics warnings and errors.
export type ParseErrorKind =
  | 'syntax_error'
  | 'unexpected_token'
  | 'unexpected_end'
  | 'duplicate_binding'   // Set x = ... declared twice in the same program

export interface ParseError {
  kind: ParseErrorKind
  message: string
  source?: SourceRef
}

export type ParseWarningKind =
  | 'deprecated_syntax'   // valid but outdated syntax. Parser still succeeds.

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
  | 'cycle'                   // Cycle in DAG → hard error
  | 'missing_required_output' // Registered required output not returned → hard error
  | 'undefined_reference'     // Reference to undefined binding → hard error
  | 'input_type_mismatch'     // op input receives wrong type

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


//? Input management: The host facing inputs, string-typed.
export function updateInput(name: string, value: unknown, state: EvalState): void {
  state.inputs.set(name, value)
}

//? isCached
//  Checks if a node's value depends on changed inputs. If it does, the cached value is invalid.
//  If it doesn't, it checks the cache and returns depending on that.
 
function isCached(
  node: object,
  cache: WeakMap<object, unknown>,
  dependsOn: ReadonlySet<string>,
  changedInputs: Set<string> | undefined,
): boolean {
  if (!cache.has(node)) return false
  if (!changedInputs) return false   // undefined = all inputs changed, nothing is cached
  for (const d of changedInputs) {
    if (dependsOn.has(d)) return false
  }
  return true
}


//? Evaluate
//  Pull-based: each node checks its own dependsOn against changedInputs. (isCached)
//  If a valid cache exists, it is used, else it is re-evaluated and cached.
//
//  Both operation and higher_order cases look up from descriptor.evaluators.
//  operation  passes apply = undefined  (evaluator ignores it)
//  higher_order constructs apply and passes it  (evaluator uses it)
 
// TODO: Program is only used for bindings. Should this be handled differently?
export function evaluate(
  node: CNode,
  program: CoreProgram,
  state: EvalState,
  changedInputs: Set<string> | undefined,
  descriptor: LanguageDescriptor,
  hostContext?: unknown,
): unknown {
  switch (node.kind) {
 
    case 'literal':
      return node.value
 
    case 'input': {
      const value = state.inputs.get(node.name)
      if (value === undefined) {
        // TODO: Should this use a default input not set value instead of throwing?
        throw new EvalError('input_not_set', `Input '${node.name}' has no value - host must call updateInput before evaluating`)
      }
      return value
    }
 
    case 'ref': {
      const binding = program.bindings.get(node.name)
      if (!binding) {
        const val = state.inputs.get(node.name)
        if (val !== undefined) return val
        // TODO: Should this use a default reference not set value instead of throwing?
        throw new EvalError('undefined_reference', `Reference '${node.name}' not found in bindings or scope - possible analyser bug`)
      }
      if (isCached(binding, state.nodeCache, node.dependsOn, changedInputs)) {
        return state.nodeCache.get(binding)
      }
      const result = evaluate(binding, program, state, changedInputs, descriptor, hostContext)
      state.nodeCache.set(binding, result)
      return result
    }
 
    case 'array': {
      const cache = state.bodyScope ?? state.nodeCache
      if (isCached(node, cache, node.dependsOn, changedInputs)) return cache.get(node)
      const result = node.items.map(n => evaluate(n, program, state, changedInputs, descriptor, hostContext))
      cache.set(node, result)
      return result
    }
 
    case 'field': {
      const cache = state.bodyScope ?? state.nodeCache
      if (isCached(node, cache, node.dependsOn, changedInputs)) return cache.get(node)
      const src = evaluate(node.struct, program, state, changedInputs, descriptor, hostContext)
      if (src === null || src === undefined) {
        // TODO: Should this use a default struct not set value instead of throwing?
        throw new EvalError('invalid_field_access', `Cannot access field '${node.field}' on null/undefined`)
      }
      const record = src as Record<string, unknown>
      if (!(node.field in record)) {
        // TODO: Should this use a default field not set value instead of throwing?
        throw new EvalError('invalid_field_access', `Field '${node.field}' does not exist on value`)
      }
      const result = record[node.field]
      cache.set(node, result)
      return result
    }
 
    case 'higher_order': {
      if (isCached(node, state.nodeCache, node.dependsOn, changedInputs)) {
        return state.nodeCache.get(node)
      }
      const evaluator = descriptor.evaluators.get(node.op)
      if (!evaluator) {
        // TODO: Check if this is or can be caught on analysis to prevent evaluation errors.
        throw new EvalError('evaluator_not_found', `No evaluator for op: '${node.op}'`)
      }
      const resolved: Record<string, unknown> = {}
      for (const [key, input] of Object.entries(node.inputs)) {
        resolved[key] = Array.isArray(input)
          ? input.map(n => evaluate(n, program, state, changedInputs, descriptor, hostContext))
          : evaluate(input, program, state, changedInputs, descriptor, hostContext)
      }
      const apply = (...args: unknown[]) => {
        const innerInputs = new Map(state.inputs)
        node.bindings.forEach((b, i) => innerInputs.set(b, args[i]))
        const innerState: EvalState = {
          inputs: innerInputs,
          nodeCache: state.nodeCache,
          bodyScope: new WeakMap(),
        }
        return evaluate(node.body, program, innerState, changedInputs, descriptor, hostContext)
      }
      try {
        const result = evaluator.evaluate(resolved, apply, hostContext)
        state.nodeCache.set(node, result)
        return result
      } catch (e) {
        if (e instanceof EvalError) throw e
        throw new EvalError('host_error', `Evaluator '${node.op}' threw: ${e}`)
      }
    }
 
    case 'operation': {
      const cache = state.bodyScope ?? state.nodeCache
      if (isCached(node, cache, node.dependsOn, changedInputs)) return cache.get(node)
      const evaluator = descriptor.evaluators.get(node.op)
      if (!evaluator) {
        throw new EvalError('evaluator_not_found', `No evaluator for op: '${node.op}'`)
      }
      const resolved: Record<string, unknown> = {}
      for (const [key, input] of Object.entries(node.inputs)) {
        resolved[key] = Array.isArray(input)
          ? input.map(n => evaluate(n, program, state, changedInputs, descriptor, hostContext))
          : evaluate(input, program, state, changedInputs, descriptor, hostContext)
      }
      try {
        // apply is undefined for standard ops - evaluator should ignore it
        const result = evaluator.evaluate(resolved, undefined, hostContext)
        cache.set(node, result)
        return result
      } catch (e) {
        if (e instanceof EvalError) throw e
        throw new EvalError('host_error', `Evaluator '${node.op}' threw: ${e}`)
      }
    }
  }
}

//? evaluateProgram
export function evaluateProgram(
  program: CoreProgram,
  state: EvalState,
  descriptor: LanguageDescriptor,
  changedInputs?: Set<string>,
  hostContext?: unknown,
): Map<string, unknown> {
  const results = new Map<string, unknown>()
  for (const [name, node] of program.outputs) {
    results.set(name, evaluate(node, program, state, changedInputs, descriptor, hostContext))
  }
  return results
}

//? outputDependencies - derive which context inputs each output depends on.
//
//  Each output is a CNode, this derives their dependencies from them.
//  Helper function to ease that computation. 
export function outputDependencies(
  program: CoreProgram,
): Map<string, ReadonlySet<string>> {
  const result = new Map<string, ReadonlySet<string>>()
  for (const [name, node] of program.outputs) {
    result.set(name, node.dependsOn)
  }
  return result
}
 

//? Eval Errors
// TODO: Should input not set be found before, or be handled in code?
export type EvalErrorKind =
  | 'evaluator_not_found'   // safety net - analyser bug or descriptor mismatch
  | 'undefined_reference'   // reference to a binding that doesn't exist in bindings or inputs
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
