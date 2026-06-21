//? Eval Errors
// TODO: Should input not set be found before, or be handled in code?
export type EvalErrorKind =
  | "evaluator_not_found" // safety net - analyser bug or descriptor mismatch
  | "undefined_reference" // reference to a binding that doesn't exist in bindings or inputs
  | "input_not_set" // input node has no value in environment
  | "invalid_field_access" // field doesn't exist on struct value
  | "host_error" // host evaluator threw
  | "error_node_reached" // error node survived pruning — analyser or pruning bug
  | "unsupported_node"; // node kind the evaluator can't handle in this build

// TODO: Also add parse and analyse errors?
export class EvalError extends Error {
  constructor(
    public readonly kind: EvalErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "EvalError";
  }
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
  inputs: Map<string, unknown>;
  nodeCache: WeakMap<object, unknown>;
  bodyScope: WeakMap<object, unknown> | undefined;
}
