# Analyser

`packages/core/src/language/analyser/analyser.ts` — `analyse(program: RawProgram, descriptor): AnalysisResult`.
Transforms a RawProgram (`ASTNode`) into a CoreProgram (`CNode`, every node carrying `dependsOn`),
collecting all errors/warnings rather than failing fast.

> This was originally a pre-implementation spec; the analyser is now built. This file reflects the
> current implementation — read the code for exact details.

## Pass pipeline

`analyse` orchestrates named passes (each a small helper):

1. **`buildReferenceGraph`** — one iteration over bindings: binding names, per-binding source ref +
   declaration index (for the lexical-order check), the reference graph (binding → bindings it
   references, via `collectRefs`), and `enforceCodeOrder` (false if any binding lacks a code source).
2. **`topoSort`** — DFS topological sort with cycle detection. Each cycle member gets a
   `binding_cycle` error and is marked failed; the rest are returned in dependency order.
3. **`computeReachability`** — per-output set of transitively-referenced bindings (for poison
   propagation and pruning).
4. **`analyseBindings`** — `analyseNode` each binding in topo order. A binding that emits a new error
   is added to `failedBindings`; cascade suppression in the `ref` case stops dependents
   double-reporting. (Error-count-delta is reliable *because* of the topo order.)
5. **`validateOutputs`** — drop outputs depending on a poisoned binding, analyse the rest, type-check
   known outputs against the descriptor, and report descriptor outputs the program omits. `ok` is
   false **only** when a required output is lost.
6. **`pruneBindings`** — keep only bindings reachable from a *surviving* output.
7. **`warnUnusedBindings`** — warn on bindings no output references.

## `analyseNode(node, ctx)` → `CNode`

Switches on `node.kind`, returning a typed `CNode` (or a `CErrorNode` placeholder on failure):

- **literal** — derive `Type` from the value.
- **input** — look up `descriptor.inputs`; `dependsOn = {name}`; unknown → `unknown_program_input`.
- **ref** — **local-first**: a lambda param in `ctx.localBindings` shadows a global binding. Global
  refs carry the binding's `dependsOn` and resolved type; lexical-order check (code editor only) via
  declaration index; unknown → `undeclared_binding_reference`.
- **array** — analyse items; infer the element type (homogeneous → `T`, else `any`).
- **field** — analyse the struct; warn on field access on a primitive.
- **operation** — resolve the op; `validateInputs` (positional/variadic mapping, type checks,
  contextual typing of inline-lambda params from an `inferInputTypes`-refined expected type); output
  from the evaluator's `inferOutput` else `OpDefinition.output`.
- **lambda** — bind params into `localBindings` (untyped → `any`), analyse the body, infer
  `Type.fn(params, bodyReturn)`, check the optional `returnType`. `dependsOn = body.dependsOn`.
- **app** — callee must be function-typed; `resolveAppArgs` aligns positional + named args to params;
  each arg type-checked against its param; output = the function's `returns`.

`AnalysisContext` carries the descriptor, `analysedBindings`, `failedBindings`, `localBindings`
(immutable per scope — spread when entering a lambda body), declaration index / source refs, and the
shared `errors`/`warnings` arrays.

## Error / warning kinds

**`language/diagnostics.ts` is the list**, and it is checked two ways: a `satisfies` over every
kind union (parse, analyse, ports, evaluate, load) means a new kind does not compile until it is
documented there, and `diagnostics.test.ts` runs each entry's sample to prove it still provokes
what the entry claims. The docs site prints the same registry.

Three things it records that are not obvious from the unions in `analyser/types.ts`:

- `unknown_type`, `incompatible_field_override`, `missing_evaluator` and `orphan_evaluator` are
  declared as analysis errors but only ever come from `validateDescriptor`, which runs inside
  `composeLayers`. The first two reach a host as ports problems; the other two make `attribute`
  THROW, because a language whose ops have no evaluators is broken before any program exists.
- `unknown_op` and `lambda_return_type_mismatch` cannot be provoked from source. In code an
  unknown call is `undeclared_binding_reference`, and there is no syntax for a lambda return
  annotation - both need an `ast`-form program or a host grammar.
- `deprecated_syntax` is emitted by nothing.

`getOutputType(node)` returns a node's output `Type` (the array case wraps the element type:
`Type.array(node.type)`).
