import { CNode } from "../infra/nodes";
import { CoreProgram } from "../infra/program";
import { LanguageDescriptor } from "../infra/registry";
import { EvalState, EvalError } from "./types";

//? Empty evalstate initialisation
export function createEvalState(): EvalState {
  return {
    inputs: new Map(),
    nodeCache: new WeakMap(),
    bodyScope: undefined,
  };
}

//? Input management: The host facing inputs, string-typed.
// TODO: Maybe an evalstate object? Or some other centralised way to manage evalstates that can be easily used by the run types?
export function updateInput(name: string, value: unknown, state: EvalState): void {
  state.inputs.set(name, value);
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
  if (!cache.has(node)) return false;
  if (!changedInputs) return false; // undefined = all inputs changed, nothing is cached
  for (const d of changedInputs) {
    if (dependsOn.has(d)) return false;
  }
  return true;
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
    case "error":
      throw new EvalError(
        "error_node_reached",
        "Error node reached the evaluator — analyser or pruning bug",
      );

    case "literal":
      return node.value;

    case "input": {
      const value = state.inputs.get(node.name);
      if (value === undefined) {
        throw new EvalError(
          "input_not_set",
          `Input '${node.name}' has no value - host must call updateInput before evaluating`,
        );
      }
      return value;
    }

    case "ref": {
      const binding = program.bindings.get(node.name);
      if (!binding) {
        const val = state.inputs.get(node.name);
        if (val !== undefined) return val;
        throw new EvalError(
          "undefined_reference",
          `Reference '${node.name}' not found in bindings or scope - possible analyser bug`,
        );
      }
      if (isCached(binding, state.nodeCache, node.dependsOn, changedInputs)) {
        return state.nodeCache.get(binding);
      }
      const result = evaluate(binding, program, state, changedInputs, descriptor, hostContext);
      state.nodeCache.set(binding, result);
      return result;
    }

    case "array": {
      const cache = state.bodyScope ?? state.nodeCache;
      if (isCached(node, cache, node.dependsOn, changedInputs)) return cache.get(node);
      const result = node.items.map((n) =>
        evaluate(n, program, state, changedInputs, descriptor, hostContext),
      );
      cache.set(node, result);
      return result;
    }

    case "field": {
      const cache = state.bodyScope ?? state.nodeCache;
      if (isCached(node, cache, node.dependsOn, changedInputs)) return cache.get(node);
      const src = evaluate(node.struct, program, state, changedInputs, descriptor, hostContext);
      if (src === null || src === undefined) {
        throw new EvalError(
          "invalid_field_access",
          `Cannot access field '${node.field}' on null/undefined`,
        );
      }
      const record = src as Record<string, unknown>;
      if (!(node.field in record)) {
        throw new EvalError(
          "invalid_field_access",
          `Field '${node.field}' does not exist on value`,
        );
      }
      const result = record[node.field];
      cache.set(node, result);
      return result;
    }

    case "higher_order": {
      const cache = state.bodyScope ?? state.nodeCache;
      if (isCached(node, cache, node.dependsOn, changedInputs)) {
        return cache.get(node);
      }
      const evaluator = descriptor.evaluators.get(node.op);
      if (!evaluator) {
        throw new EvalError("evaluator_not_found", `No evaluator for op: '${node.op}'`);
      }
      const resolved: Record<string, unknown> = {};
      for (const [key, input] of Object.entries(node.inputs)) {
        resolved[key] = Array.isArray(input)
          ? input.map((n) => evaluate(n, program, state, changedInputs, descriptor, hostContext))
          : evaluate(input, program, state, changedInputs, descriptor, hostContext);
      }
      const apply = (...args: unknown[]) => {
        const innerInputs = new Map(state.inputs);
        node.bindings.forEach((b, i) => innerInputs.set(b, args[i]));
        const innerState: EvalState = {
          inputs: innerInputs,
          nodeCache: state.nodeCache,
          bodyScope: new WeakMap(),
        };
        return evaluate(node.body, program, innerState, changedInputs, descriptor, hostContext);
      };
      try {
        const result = evaluator.evaluate(resolved, apply, hostContext);
        cache.set(node, result);
        return result;
      } catch (e) {
        if (e instanceof EvalError) throw e;
        throw new EvalError("host_error", `Evaluator '${node.op}' threw: ${e}`);
      }
    }

    case "lambda":
      // Lambda values become callable closures in C2 (application). With no AppNode
      // or function-typed op input yet, a lambda cannot reach the evaluator on its own.
      throw new EvalError(
        "unsupported_node",
        "Lambda evaluation requires application — implemented in Phase C2",
      );

    case "operation": {
      const cache = state.bodyScope ?? state.nodeCache;
      if (isCached(node, cache, node.dependsOn, changedInputs)) return cache.get(node);
      const evaluator = descriptor.evaluators.get(node.op);
      if (!evaluator) {
        throw new EvalError("evaluator_not_found", `No evaluator for op: '${node.op}'`);
      }
      const resolved: Record<string, unknown> = {};
      for (const [key, input] of Object.entries(node.inputs)) {
        resolved[key] = Array.isArray(input)
          ? input.map((n) => evaluate(n, program, state, changedInputs, descriptor, hostContext))
          : evaluate(input, program, state, changedInputs, descriptor, hostContext);
      }
      try {
        // apply is undefined for standard ops - evaluator should ignore it
        const result = evaluator.evaluate(resolved, undefined, hostContext);
        cache.set(node, result);
        return result;
      } catch (e) {
        if (e instanceof EvalError) throw e;
        throw new EvalError("host_error", `Evaluator '${node.op}' threw: ${e}`);
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
  const results = new Map<string, unknown>();
  for (const [name, node] of program.outputs) {
    results.set(name, evaluate(node, program, state, changedInputs, descriptor, hostContext));
  }
  return results;
}

//? outputDependencies - derive which context inputs each output depends on.
//
//  Each output is a CNode, this derives their dependencies from them.
//  Helper function to ease that computation.
export function outputDependencies(program: CoreProgram): Map<string, ReadonlySet<string>> {
  const result = new Map<string, ReadonlySet<string>>();
  for (const [name, node] of program.outputs) {
    result.set(name, node.dependsOn);
  }
  return result;
}
