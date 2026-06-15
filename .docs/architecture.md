# Architecture Overview

## The three-layer execution model

```
nodes.ts     — types only (ASTNode, CNode, SourceRef, LiteralValue, Analysed)
registry.ts  — language definition (descriptor, registration, isCompatible)
program.ts   — evaluation engine (evaluate, evaluateProgram, EvalState)
  ↓
analyser.ts  — RawProgram → CoreProgram  [TO IMPLEMENT]
runner.ts    — run(), createProgramRunner()
runtime.ts   — createRuntime(), ProgramHandle
  ↓
serialise.ts — SavedProgram ↔ RawProgram  [TO IMPLEMENT]
environment.ts — unified entry point      [TO IMPLEMENT]
```

Each file imports only from files above it. No cycles.

---

## RawProgram vs CoreProgram

**RawProgram** (from parse or rete adapter):
- Uses `ASTNode` — unvalidated, no analysis metadata
- `bindings: Map<string, ASTNode>`
- `outputs: Map<string, ASTNode>`
- Equivalent to ExprExt from CPL (Concepts of Programming Languages)

**CoreProgram** (from analyser):
- Uses `CNode` — validated, every node has `dependsOn: ReadonlySet<string>`
- `bindings: Map<string, CNode>`
- `outputs: Map<string, CNode>`
- Equivalent to ExprC from CPL

**Key invariant**: `CRefNode.dependsOn === program.bindings.get(name).dependsOn` — set by the analyser, relied on by the evaluator for cache invalidation without binding lookups.

---

## Pull-based evaluation

The evaluator pulls results from outputs rather than pushing from inputs. When context inputs change, `changedInputs: Set<string>` is passed to `evaluateProgram`. Each node checks `dependsOn ∩ changedInputs`:

```
nodeCache.has(node) AND changedInputs ∩ dependsOn = ∅  →  return cached
otherwise                                              →  recompute + cache
```

`isCached()` iterates `changedInputs` (typically 1-3 items) not `dependsOn` (potentially large) for performance.

### Cache layers

| Cache | Key type | Scope | Used for |
|---|---|---|---|
| `state.inputs` | string (name) | Program | Host-set context inputs and triggers |
| `state.nodeCache` | WeakMap (object) | Program | Named bindings + inline nodes (top level) |
| `state.bodyScope` | WeakMap (object) | Per apply() | Inline nodes inside higher-order body |

Named bindings always use `nodeCache` (shared across apply() iterations). Inline body nodes always use `bodyScope` (fresh per item) to prevent stale values when item binding changes.

---

## Type system

### Type strings
Types are registered strings: `'boolean'`, `'TallyState'`, `'Source[]'`, etc.

### Array types
`registerType('Source', schema)` automatically registers `'Source[]'` with `z.array(schema)` and `default: []`. Never register array types manually.

### Compatibility
`isCompatible(actual, expected, descriptor)` in registry.ts:
- `expected === 'any'` → true
- `actual === 'any' || actual === 'null'` → true  
- `actual === expected` → true
- `actual.endsWith('[]') && expected === 'any[]'` → true (array covariance)
- Future: walk `TypeDefinition.extends` chain for subtyping

### Type defaults
`TypeDefinition.default?: unknown` — fallback value when a node returns null.

Auto-derived primitives:
- `'boolean'` → `false`
- `'number'` → `0`
- `'string'` → `''`
- `'any'` → `null`
- `'T[]'` → `[]` (all array types)

Complex types: must provide explicit default in `registerType(name, schema, { default: value })` or null is the runtime fallback.

### inferOutput
On `EvaluatorDefinition`. Called by analyser to derive concrete output types for generic ops:
- `Filter(list: Source[]) → Source[]` (passthrough element type)
- `Map(list: Source[], body → TallyState) → TallyState[]` (body type + [])
- `Find(list: Source[]) → Source` (element type, not array)
- `If(then: TallyState, else: TallyState) → TallyState` (branch type when matching)

---

## Higher-order nodes

HigherOrderNode has a `body: ASTNode` and `bindings: string[]` (scoped variable names, e.g. `['item']` for Filter/Map, `['acc', 'item']` for Reduce).

During evaluation:
1. Regular inputs are evaluated in outer context
2. `apply(...args)` is constructed: extends `state.inputs` with item bindings, creates fresh `bodyScope: WeakMap`
3. Body is evaluated in the inner context
4. `apply` is passed to the evaluator as the second param (or `undefined` for standard ops)

Item bindings are NOT in `dependsOn` because they are not context inputs. This is why `bodyScope` must be fresh — the normal cache check can't detect item changes.

---

## Error handling

**EvalError** (runtime) — kinds: `evaluator_not_found`, `undefined_reference`, `input_not_set`, `invalid_field_access`, `host_error`. Runtime wraps per-program evaluation in try/catch; EvalErrors go to `onError` handlers, unexpected throws propagate.

**AnalysisError** (compile-time) — kinds: `unknown_op`, `unknown_input`, `unknown_type`, `cycle`, `missing_required_output`, `undefined_reference`, `input_type_mismatch`, `forward_reference`.

**AnalysisWarning** — kinds: `unknown_output`, `output_type_mismatch`, `unused_binding`, `missing_desired_output`.

---

## Environment (planned)

```typescript
interface Environment {
  readonly descriptor: LanguageDescriptor

  // Compilation
  analyse(raw: RawProgram): AnalysisResult
  load(saved: SavedProgram): AnalysisResult   // deserialise + analyse

  // Execution
  run(program: CoreProgram, inputs: Record<string, unknown>): Map<string, unknown>
  createRunner(program: CoreProgram): ProgramRunner
  readonly runtime: Runtime

  // Convenience: load + register in one call
  register(id: string, saved: SavedProgram): RegisterResult
}
```

The wrapper holds descriptor + hostContext so they're not threaded through every call.

---

## Serialise (planned)

SavedProgram is RawProgram with:
- `Map` → plain `Record` (JSON-serialisable)
- `source?: SourceRef` stripped from all nodes (session-scoped, meaningless after session)
- Metadata fields: `id`, `name`, timestamps

```typescript
function serialise(program: RawProgram): SavedProgram
function deserialise(saved: SavedProgram): RawProgram
```

---

## Node editor integration (Retejs)

The rete adapter (not yet implemented) converts a Retejs graph to `RawProgram`:
- Named bindings → nodes with output wires
- HigherOrderNode body → sub-graph within a container node
- Scoped variables (item, acc) → special source nodes inside the body sub-graph that cannot be wired to nodes outside the body
- No `SourceRef` with line numbers — rete nodes use `kind: 'rete'` with `nodeId`
- No lexical order enforcement (no line numbers)

---

## Code editor integration

- Parser produces `RawProgram` with `SourceRef { kind: 'code', line, column, length }` on every node
- Lexical order enforced by analyser (AnalysisError if forward reference detected)
- Node-to-code conversion: topological sort ensures output code is always in valid lexical order
