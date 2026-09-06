# Design Decisions Log

Decisions made during the initial design session. Do not re-debate these — they are settled. Context for why is included.

---

## Language & Pipeline

**No desugar phase.**
Single-use binding inlining (the main desugar candidate) provides negligible benefit for a tree-walking interpreter with WeakMap caching. Bindings are computed at most once per cycle regardless. The pull-based evaluator already handles dead bindings naturally (never touched if not reachable from outputs). If a compiler target for flat code is ever added, desugar can be revisited.

**Store RawProgram, not CoreProgram.**
CoreProgram is a derived artifact. Storing it would cause silent staleness if the descriptor changes (new ops, renamed inputs). Re-analysis on load is fast (in-memory) and surfaces errors correctly.

**Pull-based evaluation, not push-based.**
No dirty propagation, no `dependents` map. `changedInputs: Set<string>` is passed to each evaluation cycle. Nodes check their own `dependsOn` to decide whether to recompute. Simpler, correct, GC-friendly via WeakMap.

---

## Evaluation Engine

**WeakMap for nodeCache, not string-keyed Map.**
Object identity (CNode reference) as the key. No IDs generated, no string key computation. Auto-GC when CoreProgram is unregistered. O(1) lookup.

**bodyScope: WeakMap | undefined on EvalState.**
Lambda params (the body's local scope) are not context inputs — not in `dependsOn`. Without a separate body-scope cache, the normal `dependsOn ∩ changedInputs` check cannot detect a param changing across closure applications. A fresh WeakMap per application prevents stale body-node results; named bindings referenced from the body still use the shared nodeCache. The local scope itself lives in `localBindings` (a small value map, looked up local-first so params shadow globals).

**inputs: Map vs nodeCache: WeakMap split.**
Not "named vs unnamed" — it's "host-managed vs evaluator-computed". Host sets `inputs` (string-keyed, easy for host to use names). Evaluator writes `nodeCache` (object-keyed). No overlap, clear ownership.

**changedInputs is optional in evaluateProgram.**
`undefined` means "all inputs changed" — safe fallback that bypasses caching. Used by `run()` for one-shot evaluation. The Runtime always passes a concrete Set.

---

## Registration

**Higher-order ops are ordinary ops with a function-typed input (no HigherOrderNode, no `apply`).**
*Revised in Phase E.* Originally higher-order ops used a dedicated node kind plus an `apply` body-evaluation param on `EvaluatorDefinition`. Collapsed: the function input arrives as a resolved closure (`FnValue`) and the op calls it directly — `evaluate` is `(inputs)`. The `Apply` type, the `higher_order` node kind, and `bodyBindings` are gone.

**Inputs-only — no `hostContext` channel.**
*Settled when starting Beacon integration.* Ops are pure functions of their declared inputs; the host projects its state into typed context inputs (`updateInput`) rather than reaching into an ambient `hostContext`. Reason: `dependsOn` is computed statically from the AST, so any hidden channel (a `hostContext` arg, or an evaluator peeking at `state.inputs`) is invisible to the incremental cache and goes stale. It was also untyped and unused by core. Dendrite is side-effect-free, so no effect-capability needs such a channel. The param was removed from `evaluate` / `evaluateProgram` / `run` / `createProgramRunner` / `createRuntime` / `EvaluatorDefinition.evaluate`.

**inferOutput + inferInputTypes on EvaluatorDefinition.**
Analysis-time type inference is co-located with `evaluate`. `inferInputTypes(inputTypes)` refines a generic function input's type from already-resolved inputs (e.g. Filter → `{ predicate: (elementOf(list)) -> boolean }`); `inferOutput(inputTypes)` derives the concrete output type. Both fall back to declared types (`OpDefinition.output` / `OpInput.type`) when absent.

---

## Type System

**Structured `Type` union, not strings.**
*Revised in Phase A (C-first).* `Type = name | array | function`. Only **named** types are registered (`descriptor.types`); arrays and functions are **structural** (`Type.array`, `Type.fn`) — there is no auto-`T[]` registration, and `registerType` no longer generates array variants. (Migrated off the old `'T[]'` string convention and its `.endsWith('[]')` hacks.)

**`any` is data-only; functions are never `any`.**
`any` (expected) accepts any data value incl. arrays, but NOT a function; `any`/`null` (actual) flow where data is expected, not into a function slot. `Filter` etc. preserve the array/scalar distinction structurally even when the element type is unknown. The functions-⊄-`any` guard keeps the system total (blocks the Z combinator).

**null literal in LiteralValue.**
`null` is a valid literal — explicit empty/absent values, and the universal fallback when no `TypeDefinition.default` is given.

**Subtyping via `TypeDefinition.extends` — implemented.**
`isCompatible` walks the `extends` chain upward (a subtype is usable where its supertype is expected), plus array covariance and function variance. Always called as a function (never inlined) so it stays the single extension point. (No type *declares* `extends` in core yet — see todo.md for the Beacon precondition.)

**Per-type defaults in TypeDefinition.**
`{ default?: unknown }` in `registerType` config. Primitives: boolean→false, number→0, string→'', any→null. Array/function defaults are derived structurally (a missing array-typed input → `[]`). Complex named types should provide an explicit default. Fallback chain: `InputDefinition.default` → `TypeDefinition.default` → null.

---

## Analyser

**Collect all errors, not fail-fast.**
Produces placeholder CNode on failure and continues. `failedBindings: Set<string>` suppresses cascade errors (dependent bindings silently use placeholder without new errors).

**AnalysisContext as recursive argument.**
Object with mutable shared fields (errors, warnings, analysedBindings, failedBindings) and an immutable-per-scope field (`localBindings`). `localBindings` (lambda params → type) is spread (not mutated) when entering a lambda body. Shared mutable fields work correctly in a DAG — nodes are computed once in topo order. `analyse` itself is a pass pipeline (ref graph → topo sort → bindings → outputs → prune → unused).

**Lexical order: error for code editor, exempt for rete.**
Detected by checking source positions (`SourceRef.kind === 'code'`). If any binding lacks source info, skip the check entirely. Forward references in the analyser are fine — the topological sort handles ordering. Lexical order is a code-editor UX policy, not a semantic requirement.

**isCompatible always called as a function.**
Never inline `actual === expected`. The function is in registry.ts and takes `descriptor` even when unused. This is the single extension point for subtyping.

---

## API Design

**ProgramHandle from register().**
`runtime.register(id, program)` returns a handle with `onOutput`, `onError`, `unregister`. Per-program handler sets stored in ProgramEntry. `unregister()` clears all per-program handlers. Global `runtime.onOutput` remains for dashboards/loggers that observe all programs.

**run() / createProgramRunner() / createRuntime() / createInstance() — four levels.**
Not unified behind one API. The choice between them is contextual and meaningful. Callers know which they need.

**Environment holds the pipeline; only a ProgramEnvironment can analyse.**
`createEnvironment(language)` gives `parse`, `forProgram`, `createRuntime` and `createInstance`. The pipeline itself (`analyse`, `compile`, `load`, `run`, `createRunner`) lives on the `ProgramEnvironment` that `forProgram(global, program)` returns, because a language declares no ports and analysing against one silently drops every output as unknown. That was a real bug before the split, caught while writing the environment tests.

---

## Ports, layers and instances (2026-09)

**A language is vocabulary; ports arrive in layers.**
`Vocabulary` = types, ops, evaluators. `LanguageDescriptor` = that plus inputs and outputs, produced only by `composeLayers`. `registerInput` / `registerOutput` are gone. The motive: a host contract, a per-document surface and a per-capability set of inputs are all "declarations on top of a language", and copying-and-mutating a language per document was the workaround for not having them.

**Order is authority; there is no override.**
Layers compose in order — the language, then global layers, then program layers — and the first declarer keeps a name. A later layer taking it is `shadowed_name`, blamed on the LATER layer, and any problem fails the whole compose so nothing partially applies. A host contract therefore outranks a document, and a user's declaration can never silently shadow it.

**Policy is data, not a role.**
`LayerPolicy { editable, feeds, persisted }` with two presets (`Policy.host`, `Policy.user`) and `Policy.custom`. Core enforces none of it: `setInput` accepts any program-level input so a host can seed its own sensor. It is UI policy, and it is what a remote runtime would enforce server-side.

**At most one persisted layer per instance.**
Makes `snapshot` and `setProgram` unambiguous: the snapshot is that layer's ports plus its inputs' values, and `saved.ports` always targets it. A host persisting more merges them into one.

**The snapshot is silent unless a save would care.**
It emits for the program, the persisted layer's ports, and the values of that layer's inputs — never for a host pushing a value into an input it feeds itself. Without that a capability sensor writing every frame would mark a document dirty forever.

**Stale outputs rather than hidden ones.**
When a program stops compiling the runtime keeps running the last good one. Everything it produces afterwards is published with `stale: true`, including outputs from a global update. What the lights follow is what the UI shows, marked.

**Program-level values have one owner.**
The instance owns them and hands them to the runtime on every register and replace. The entry follows rather than re-deriving, because two components applying "the same rule" independently drift the moment one of them skips a push.

**The parser reads no declarations.**
`$x` is an input because of the sigil. The type it stamps was always overwritten by the analyser, so reading a declaration at parse time was dead data — and after the split the parser has no ports to read.

