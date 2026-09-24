import { Convert } from "../infra/convert";
import { valueFits } from "../infra/fits";
import { CNode, type COperationNode } from "../infra/nodes";
import { type Type } from "../infra/types";
import { CoreProgram } from "../infra/program";
import { type FnValue, type OpInput, Vocabulary } from "../infra/registry";
import { EvalState, EvalError } from "./types";

// Shared empty local scope for evaluating global bindings. Scope maps are never
// mutated in place (each scope is a fresh `new Map(parent)`), so sharing is safe.
const EMPTY_LOCAL_SCOPE: Map<string, unknown> = new Map();

//? Empty evalstate initialisation
export function createEvalState(): EvalState {
  return {
    inputs: new Map(),
    nodeCache: new WeakMap(),
    bodyScope: undefined,
    localBindings: new Map(),
  };
}

//? Input management: The host facing inputs, string-typed.
// TODO: Maybe an evalstate object? Or some other centralised way to manage evalstates that can be easily used by the run types?
export function updateInput(name: string, value: unknown, state: EvalState): void {
  state.inputs.set(name, value);
}

//? EvalContext: the invariants of a single evaluation traversal (the program, the
//  descriptor, and the changed-input set). Bundled so the recursion threads just
//  (node, ctx, state) - only `node` and `state` vary as we descend.
interface EvalContext {
  program: CoreProgram;
  // Only the evaluators are read here; a full descriptor satisfies this too.
  descriptor: Vocabulary;
  changedInputs: Set<string> | undefined;
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

//? memoise: the shared cache dance for inline nodes (array/field/app/operation).
//  Body nodes cache in bodyScope (scoped, fresh per application); top-level inline
//  nodes cache in nodeCache. A valid cache hit short-circuits compute().
function memoise(node: CNode, ctx: EvalContext, state: EvalState, compute: () => unknown): unknown {
  const cache = state.bodyScope ?? state.nodeCache;
  if (isCached(node, cache, node.dependsOn, ctx.changedInputs)) return cache.get(node);
  const result = compute();
  cache.set(node, result);
  return result;
}

//? Evaluate (public entry). Bundles the traversal invariants into an EvalContext and
//  delegates to evalNode. Kept as an explicit positional signature for direct callers.
export function evaluate(
  node: CNode,
  program: CoreProgram,
  state: EvalState,
  changedInputs: Set<string> | undefined,
  descriptor: Vocabulary,
): unknown {
  return evalNode(node, { program, descriptor, changedInputs }, state);
}

//? evalNode
//  Pull-based: each node checks its own dependsOn against changedInputs. (isCached)
//  If a valid cache exists, it is used, else it is re-evaluated and cached.
//
//  Ops look up their evaluator from descriptor.evaluators. Higher-order ops are
//  ordinary ops with a function-typed input: the lambda evaluates to a closure that
//  arrives as a normal resolved input value, which the op evaluator calls directly.
function evalNode(node: CNode, ctx: EvalContext, state: EvalState): unknown {
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
      // Local-first: a lambda param / scoped var shadows a same-named global binding.
      if (state.localBindings.has(node.name)) return state.localBindings.get(node.name);

      const binding = ctx.program.bindings.get(node.name);
      if (!binding) {
        const val = state.inputs.get(node.name);
        if (val !== undefined) return val;
        throw new EvalError(
          "undefined_reference",
          `Reference '${node.name}' not found in bindings or scope - possible analyser bug`,
        );
      }
      if (isCached(binding, state.nodeCache, node.dependsOn, ctx.changedInputs)) {
        return state.nodeCache.get(binding);
      }
      // A global binding is lexically in the global scope: evaluate it WITHOUT the
      // caller's local scope (and outside any body scope), so a scoped var never
      // shadows a name used inside the binding. At the top level `state` already is
      // the global scope, so reuse it.
      const globalState: EvalState =
        state.localBindings.size === 0 && state.bodyScope === undefined
          ? state
          : {
              inputs: state.inputs,
              nodeCache: state.nodeCache,
              bodyScope: undefined,
              localBindings: EMPTY_LOCAL_SCOPE,
            };
      const result = evalNode(binding, ctx, globalState);
      // Don't cache closures: they capture `changedInputs`, so re-create them each
      // pass to stay correct under incremental re-evaluation. (Cheap to rebuild.)
      if (typeof result !== "function") state.nodeCache.set(binding, result);
      return result;
    }

    case "array":
      return memoise(node, ctx, state, () => node.items.map((n) => evalNode(n, ctx, state)));

    case "field":
      return memoise(node, ctx, state, () => {
        const src = evalNode(node.struct, ctx, state);
        // A field of nothing is nothing: `Find(...).name` with no match is null, not a throw,
        // the way a null reads as "" in a string op and as [] in a list op. A struct that IS
        // there but lacks the field is still an error: that value came from a host and does
        // not match its declared type.
        if (src === null || src === undefined) return null;
        const record = src as Record<string, unknown>;
        if (typeof record !== "object" || !(node.field in record)) {
          throw new EvalError(
            "invalid_field_access",
            `Field '${node.field}' does not exist on value`,
          );
        }
        return record[node.field];
      });

    case "lambda": {
      // A lambda evaluates to a closure capturing its definition-site local scope.
      // Applying it extends that scope with the args (lexical capture). The captured
      // scope map is never mutated, so the closure sees exactly what was in scope when
      // it was defined, including enclosing lambda params (nesting/currying).
      const captured = state;
      const closure: FnValue = (...args) => {
        const innerLocal = new Map(captured.localBindings);
        node.params.forEach((p, i) => innerLocal.set(p.name, args[i]));
        const innerState: EvalState = {
          inputs: captured.inputs,
          nodeCache: captured.nodeCache,
          bodyScope: new WeakMap(),
          localBindings: innerLocal,
        };
        return evalNode(node.body, ctx, innerState);
      };
      return closure;
    }

    case "cast":
      // The value when it fits the target, else null: a safe cast never throws, and a null is
      // what the language already gives for "no value", so Default and IsSet handle it.
      return memoise(node, ctx, state, () => {
        const value = evalNode(node.value, ctx, state);
        return valueFits(value, node.type, ctx.descriptor) ? value : null;
      });

    case "app":
      return memoise(node, ctx, state, () => {
        const callee = evalNode(node.callee, ctx, state);
        if (typeof callee !== "function") {
          throw new EvalError(
            "not_a_function",
            "Application callee did not evaluate to a function — analyser bug",
          );
        }
        // args are already resolved to param order by the analyser. Call-by-value, L→R.
        const args = node.args.map((a) => evalNode(a, ctx, state));
        return (callee as FnValue)(...args);
      });

    case "operation":
      return memoise(node, ctx, state, () => {
        const evaluator = ctx.descriptor.evaluators.get(node.op);
        if (!evaluator) {
          throw new EvalError("evaluator_not_found", `No evaluator for op: '${node.op}'`);
        }
        const resolved = resolveInputs(node, ctx, state);
        try {
          return evaluator.evaluate(resolved);
        } catch (e) {
          if (e instanceof EvalError) throw e;
          throw new EvalError("host_error", `Evaluator '${node.op}' threw: ${e}`);
        }
      });
  }
}

// Evaluate an op node's inputs into the record its evaluator receives. An input declared
// `convert` is converted leaf by leaf first, so the op sees the type it declared; one whose
// runtime shape is wrong (an `any` holding a number where a list was declared) passes through
// unchanged, and the op's own guard handles it, as it did before the flag existed.
function resolveInputs(
  node: COperationNode,
  ctx: EvalContext,
  state: EvalState,
): Record<string, unknown> {
  const declared = new Map(ctx.descriptor.ops.get(node.op)?.inputs.map((i) => [i.name, i]));
  const resolved: Record<string, unknown> = {};
  for (const [key, input] of Object.entries(node.inputs)) {
    const value = Array.isArray(input)
      ? input.map((n) => evalNode(n, ctx, state))
      : evalNode(input, ctx, state);
    const def: OpInput | undefined = declared.get(key);
    resolved[key] = def?.convert ? convertTo(value, def.type) : value;
  }
  return resolved;
}

function convertTo(value: unknown, type: Type): unknown {
  if (type.kind === "array") {
    return Array.isArray(value) ? value.map((item) => convertTo(item, type.element)) : value;
  }
  if (type.kind !== "name") return value;
  switch (type.name) {
    case "string":
      return Convert.toString(value);
    case "number":
      return Convert.toNumber(value);
    case "boolean":
      return Convert.toBool(value);
    default:
      return value;
  }
}

//? evaluateProgram
export function evaluateProgram(
  program: CoreProgram,
  state: EvalState,
  descriptor: Vocabulary,
  changedInputs?: Set<string>,
): Map<string, unknown> {
  const ctx: EvalContext = { program, descriptor, changedInputs };
  const results = new Map<string, unknown>();
  for (const [name, node] of program.outputs) {
    results.set(name, evalNode(node, ctx, state));
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
