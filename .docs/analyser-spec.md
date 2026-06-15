# Analyser Implementation Spec

`src/language/analyser.ts` — transforms `RawProgram → AnalysisResult` (defined in program.ts).

The analyser is the most critical unimplemented piece. Without it, CorePrograms can only be hand-built by hand.

---

## Imports needed

```typescript
import { ASTNode, CNode, COpInputType, SourceRef, LiteralValue, HigherOrderNode } from './nodes'
import { LanguageDescriptor, isCompatible } from './registry'
import { RawProgram, CoreProgram, AnalysisResult, AnalysisSuccess, AnalysisFailure, AnalysisError, AnalysisErrorKind, AnalysisWarning, AnalysisWarningKind } from './program'
```

---

## AnalysisContext

Passed recursively through all analysis functions. Most fields are mutable shared references (mutations propagate upward). `boundNames` is the exception — it is an immutable snapshot that gets spread when entering a higher-order body scope.

```typescript
interface AnalysisContext {
  descriptor:       LanguageDescriptor           // immutable, shared
  analysedBindings: Map<string, CNode>           // mutable, shared — grows as bindings complete
  failedBindings:   Set<string>                  // mutable, shared — cascade suppression
  boundNames:       ReadonlyMap<string, string>  // immutable snapshot per scope: name → type
  errors:           AnalysisError[]              // mutable, shared — accumulates
  warnings:         AnalysisWarning[]            // mutable, shared — accumulates
}
```

`boundNames` maps scoped variable names to their inferred types (e.g. `{ item: 'Source' }`).
Initialised as an empty Map at the top level. New entries are added per higher-order body scope via `inferBodyBindings` (see higher_order case below).

---

## Main function

```typescript
export function analyse(program: RawProgram, descriptor: LanguageDescriptor): AnalysisResult
```

---

## Multi-pass structure

### Pass 1 — Collect binding names, detect duplicates
Iterate `program.bindings.keys()`. If a name appears more than once (shouldn't happen with Map, but validate input), emit `AnalysisError('duplicate_binding')`.

### Pass 2 — Build binding reference graph
For each binding, scan its ASTNode recursively for `RefNode`s. Build a `Map<string, Set<string>>` where `graph.get(a)` = names that binding `a` directly references.

Only look for `RefNode`s that reference OTHER BINDINGS (not context inputs). A `RefNode` resolves to a binding if `program.bindings.has(node.name)`.

```typescript
function collectRefs(node: ASTNode, bindings: Set<string>): Set<string> {
  // Recursively find all RefNode names that exist in bindings
  // Skip RefNodes to context inputs (they're not in program.bindings)
}
```

### Pass 3 — Topological sort + cycle detection
Standard DFS-based topological sort. Maintain:
- `state: Map<string, 'unvisited' | 'visiting' | 'visited'>`
- `order: string[]` (reverse post-order = correct evaluation order)

If `state.get(name) === 'visiting'` when visiting, there is a cycle. Emit `AnalysisError('cycle', name, ...)` for ALL names in the current DFS stack that form the cycle. Do NOT add cycled bindings to the evaluation order. Mark them all as failed.

After topo sort, also compute the **reachable set** — bindings transitively referenced from any output. Used for unused binding detection.

### Pass 4 — Validate + compute dependsOn, in topological order
Create the AnalysisContext with empty maps/sets. For each binding name in `order`:
- Call `analyseNode(rawNode, ctx)` → `CNode`
- Store result in `ctx.analysedBindings.set(name, cnode)`
- If errors were added for this binding, add name to `ctx.failedBindings`

### Pass 5 — Validate outputs
For each `[name, rawNode]` in `program.outputs`:
- Analyse the raw node → CNode
- Check `descriptor.outputs.get(name)` — if absent → `AnalysisWarning('unknown_output')`
- If present: validate `isCompatible(getOutputType(cnode), def.type, ctx.descriptor)`
  - Type mismatch → `AnalysisError('program_output_type_mismatch')` regardless of output mode.
    `isCompatible` already handles extended/subtype compatibility, so a false result means genuine incompatibility.
- Build `CoreProgram.outputs: Map<string, CNode>`

For each `[name, def]` in `descriptor.outputs`:
- `mode: 'required'` and name not in `program.outputs` → `AnalysisError('missing_required_output')`
- `mode: 'desired'` and name not in `program.outputs` → `AnalysisWarning('missing_desired_output')`

### Pass 6 — Unused bindings
Any binding in `program.bindings` NOT in the reachable set → `AnalysisWarning('unused_binding')`.

### Return
```typescript
if (ctx.errors.length > 0) {
  return { ok: false, errors: ctx.errors, warnings: ctx.warnings }
}
return { ok: true, program: { bindings: ctx.analysedBindings, outputs: outputMap }, warnings: ctx.warnings }
```

---

## analyseNode(node, ctx) → CNode

The core recursive function. Switch on `node.kind`. Returns a `CNode` in all cases — even on error, return a safe placeholder to allow continued analysis.

**Placeholder on error:**
```typescript
const placeholder: CLiteralNode = {
  kind: 'literal', type: 'any', value: null, dependsOn: new Set()
}
```

### case 'literal'
Derive type from value:
```typescript
const type = node.value === null    ? 'null'
           : typeof node.value === 'string'  ? 'string'
           : typeof node.value === 'number'  ? 'number'
           : typeof node.value === 'boolean' ? 'boolean'
           : 'any'
return { ...node, type, dependsOn: new Set() } as CLiteralNode
```

### case 'input'
Look up `descriptor.inputs.get(node.name)`:
- Not found → `AnalysisError('unknown_input')`, return placeholder
- Found: `node.type` on a raw `InputNode` is the type the parser/rete adapter declared for this context input. Validate `isCompatible(node.type, def.type, ctx.descriptor)` — if not, the raw program's declared type conflicts with the descriptor's registered type for that input. This is a parser/adapter bug, not a user error — emit `AnalysisWarning('unknown_output')` is wrong here; use a dedicated path (TBD) or just trust `def.type` and override. For now: use `def.type` as the authoritative type and return `CInputNode` with `type: def.type, dependsOn: new Set([node.name])`.

### case 'ref'
Three cases in order:

1. **Named binding** — `ctx.analysedBindings.has(node.name)`:
   - If in `ctx.failedBindings` — silently return placeholder (cascade suppression, no new error)
   - Get the CNode. `dependsOn` = binding's CNode.dependsOn. Type = `getOutputType(binding)`.
   - Return `CRefNode { ...node, type: bindingType, dependsOn: binding.dependsOn }`

2. **Scoped binding** — `ctx.boundNames.has(node.name)`:
   - `const type = ctx.boundNames.get(node.name) ?? 'any'`
   - Return `CRefNode { ...node, type, dependsOn: new Set() }` (scoped vars are not context inputs)

3. **Unknown** → `AnalysisError('undefined_reference')`, return placeholder

**Lexical order check** (only when source positions are available):
After resolving a named binding, if `node.source?.kind === 'code'` and the binding's declaration source is available — check that the binding's source line < node.source.line. If not, emit `AnalysisError('forward_reference')` (add this to AnalysisErrorKind). Note: this requires storing the binding's source position — capture it during Pass 1 into a `Map<string, SourceRef>`.

### case 'array'
Analyse each item. Union all items' dependsOn. Validate each item type against `node.type` (the declared element type) using `isCompatible`.
```typescript
const cItems = node.items.map(item => analyseNode(item, ctx))
const dependsOn = union(...cItems.map(n => n.dependsOn))
// type: trust node.type, validate items
return { ...node, items: cItems, dependsOn } as CArrayNode
```

### case 'field'
Analyse `node.struct`. Check that the struct type is not a primitive (warn if so — field access on string/boolean/number is likely wrong). Don't validate field name — that's runtime.
```typescript
const struct = analyseNode(node.struct, ctx)
const structType = getOutputType(struct)
if (['string', 'number', 'boolean'].includes(structType)) {
  ctx.warnings.push({ kind: 'output_type_mismatch', ... })
}
return { ...node, struct, dependsOn: struct.dependsOn } as CFieldAccessNode
```

### case 'operation'
1. Look up `descriptor.ops.get(node.op)` — not found → `AnalysisError('unknown_op')`
2. Check `opDef.higherOrder !== true` — if it IS higher_order, wrong node kind → `AnalysisError('unknown_op')` with message "op requires higher_order node"
3. Validate and analyse inputs (see Input Validation section)
4. Compute `dependsOn`: union of all input CNode's dependsOn
5. Call `inferOutput` if present on the evaluator definition
6. Return `COperationNode` with inferred or static output type

### case 'higher_order'
1. Look up op — must have `opDef.higherOrder === true`
2. Validate and analyse regular inputs
3. **Body scope**: infer scoped binding types, build body context:
   ```typescript
   const evaluator = descriptor.evaluators.get(node.op)
   const inferredBindings = evaluator?.inferBodyBindings?.(inputTypesRecord) ?? {}
   const bodyNames = new Map([...ctx.boundNames, ...Object.entries(inferredBindings)])
   const bodyCtx = { ...ctx, boundNames: bodyNames }
   ```
   `inputTypesRecord` is the same `Record<inputName, getOutputType(inputCNode)>` computed in step 8.
   Any binding not covered by `inferBodyBindings` defaults to `'any'` via the `?? 'any'` fallback in the ref case.
4. Analyse body: `const body = analyseNode(node.body, bodyCtx)`
5. Body dependsOn excludes scoped bindings (already handled — boundNames refs get empty dependsOn)
6. Compute node dependsOn: union of regular input dependsOn + body.dependsOn
7. Get body output type: `getOutputType(body)`
8. Get input types for inferOutput: `Record<inputName, getOutputType(inputCNode)>` for non-variadic; element type string for variadic
9. Call `evaluator.inferOutput(inputTypes, bodyOutputType)` if present
10. Return `CHigherOrderNode` with output = inferred ?? opDef.output

---

## Input validation (shared for operation and higher_order)

For each `OpInput` in `opDef.inputs`:
- Find corresponding entry in `node.inputs`
- If required and missing → `AnalysisError('unknown_type')` (or add 'missing_input' kind)
- If `opInput.variadic`:
  - `node.inputs[name]` should be `ASTNode[]`
  - Analyse each → `CNode[]`
  - Validate each element type: `isCompatible(getOutputType(cnodeElement), opInput.type, ctx.descriptor)`
  - Emit `AnalysisError('op_input_type_mismatch')` per element on mismatch
- If not variadic:
  - `node.inputs[name]` should be a single `ASTNode`
  - Analyse it → `CNode`
  - Validate: `isCompatible(getOutputType(cnode), opInput.type, ctx.descriptor)`
  - Emit `AnalysisError('op_input_type_mismatch')` on mismatch

Check for extra inputs not in op definition → `AnalysisWarning('unknown_output')` (or add 'unknown_input_key' kind).

---

## getOutputType helper

```typescript
function getOutputType(node: CNode): string {
  switch (node.kind) {
    case 'literal':      return node.type
    case 'array':        return `${node.type}[]`   // array items are type T, so array is T[]
    case 'input':        return node.type
    case 'ref':          return node.type
    case 'operation':    return node.output
    case 'field':        return node.type
    case 'higher_order': return node.output
  }
}
```

Wait — `CArrayNode.type` is the ELEMENT type, not the array type. So `getOutputType` for array should return `${node.type}[]`. Verify this is consistent with how ArrayNode.type is set.

---

## union helper

```typescript
function union(...sets: ReadonlySet<string>[]): ReadonlySet<string> {
  const result = new Set<string>()
  for (const set of sets) for (const item of set) result.add(item)
  return result
}
```

---

## Error and warning kinds

`AnalysisErrorKind` (hard errors — prevent CoreProgram from being produced):
```typescript
'unknown_op' | 'unknown_program_input' | 'unknown_type' | 'binding_cycle' |
'missing_required_program_output' | 'undeclared_binding_reference' | 'forward_reference' |
'op_input_type_mismatch' | 'program_output_type_mismatch'
```

- `unknown_op` — op name in the program is not in `descriptor.ops`
- `unknown_program_input` — `InputNode.name` not in `descriptor.inputs`
- `unknown_type` — a type string used in a node is not in `descriptor.types`
- `binding_cycle` — cycle detected in the binding dependency graph
- `undeclared_binding_reference` — `RefNode` points to a binding that was never declared
- `forward_reference` — code editor only. Binding used before its `Set name = ...` declaration line. Not enforced for rete programs (no source positions).
- `op_input_type_mismatch` — an op's **node input port** receives a value of an incompatible type. `isCompatible` returning false means the types genuinely conflict; the evaluator will fail at runtime.
- `program_output_type_mismatch` — a **program output** (e.g. `tally`) is mapped to an incompatible type. Applies regardless of output mode.

`AnalysisWarningKind` (non-fatal — CoreProgram is still produced):
```typescript
'unknown_program_output' | 'unused_binding' | 'missing_desired_program_output'
```

- `unknown_program_output` — program declares an output name not in `descriptor.outputs`; it is dropped
- `unused_binding` — a named binding is never referenced by any output or other binding
- `missing_desired_program_output` — descriptor marks an output as `'desired'` but the program omits it

---

## Cascade suppression

When `analyseNode` is called for a RefNode to a failed binding:
- `ctx.failedBindings.has(node.name)` → return placeholder WITHOUT adding a new error
- This prevents "binding 'b' failed" being reported when the real cause is "binding 'a' failed"

When an operation/higher_order node has an input that returned a placeholder, the node itself may also produce invalid results. Whether to propagate to `failedBindings` is a judgment call — for now, only bindings explicitly errored (the one with the undefined_reference, cycle, etc.) go into failedBindings. Downstream type mismatches are warnings, not failures.

---

## Lexical order enforcement detail

During Pass 1, also collect `bindingSourceRefs: Map<string, SourceRef>` — the source position of each binding's DECLARATION (not the expression, but the `Set name = ...` statement start).

If all entries have `kind: 'code'` source refs, enforce lexical order.

During RefNode analysis in Pass 4:
- If `node.source?.kind === 'code'` AND `bindingSourceRefs.get(node.name)?.kind === 'code'`
- If `bindingSourceRefs.get(node.name)!.line > node.source.line` → forward reference
- Emit `AnalysisError('forward_reference', node.name, ...)`

If ANY binding lacks source info, skip the entire lexical order check (node editor programs).

---

## Example flow

For this program:
```
Set sources = BusSources(sourceBusNew)
Set onLive  = ListIncludes(sources, "atem:cam1")
output tally = onLive
```

Pass 2 graph: `{ sources: Set(), onLive: Set(['sources']) }`
Pass 3 topo order: `['sources', 'onLive']`
Reachable from outputs: `{ sources, onLive }`

Pass 4:
- Analyse `sources` binding:
  - `BusSources` op: OperationNode, `busId: InputNode('sourceBusNew')`
  - `InputNode('sourceBusNew')` → `dependsOn: Set(['sourceBusNew'])`
  - `COperationNode('BusSources')` → `dependsOn: Set(['sourceBusNew'])`, `output: 'Source[]'`
  - Store in analysedBindings

- Analyse `onLive` binding:
  - `ListIncludes`: inputs `list: RefNode('sources')`, `sourceId: LiteralNode("atem:cam1")`
  - `RefNode('sources')` → analysedBindings lookup → `dependsOn: Set(['sourceBusNew'])`, `type: 'Source[]'`
  - `LiteralNode("atem:cam1")` → `dependsOn: Set()`, `type: 'string'`
  - `COperationNode('ListIncludes')` → `dependsOn: Set(['sourceBusNew'])`, `output: 'boolean'`

Pass 5:
- `tally` output → analyse `RefNode('onLive')` → `type: 'boolean'`
- `descriptor.outputs.get('tally').type === 'TallyState'` — type mismatch!
- `mode: 'required'` → `AnalysisError('output_type_mismatch')` ... (or AnalysisWarning depending on final decision)

This example illustrates that `onLive` should probably be `TallyCheck(source)` not `ListIncludes` — the example exposes a type error correctly.
