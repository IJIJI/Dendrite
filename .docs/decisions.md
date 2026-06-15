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
Item bindings in higher-order bodies are not context inputs — they're not in `dependsOn`. Without a separate body-scope cache, the normal `dependsOn ∩ changedInputs` check cannot detect item changes across apply() calls. Fresh WeakMap per apply() call prevents stale body node results. Named bindings referenced from the body still use the shared nodeCache correctly.

**inputs: Map vs nodeCache: WeakMap split.**
Not "named vs unnamed" — it's "host-managed vs evaluator-computed". Host sets `inputs` (string-keyed, easy for host to use names). Evaluator writes `nodeCache` (object-keyed). No overlap, clear ownership.

**changedInputs is optional in evaluateProgram.**
`undefined` means "all inputs changed" — safe fallback that bypasses caching. Used by `run()` for one-shot evaluation. The Runtime always passes a concrete Set.

---

## Registration

**Unified EvaluatorDefinition (no separate registerHigherOrder).**
`apply: Apply | undefined` — standard ops receive `undefined` (ignored), higher-order ops receive the constructed body evaluation function. Mutual exclusivity check removed. Single map, single method. TypeScript allows functions with fewer params to satisfy the type.

**inferOutput on EvaluatorDefinition, not OpDefinition.**
Co-locates runtime behaviour (evaluate) with analysis-time type inference (inferOutput) in one registration call. The analyser reads `descriptor.evaluators.get(op)?.inferOutput`. `OpDefinition.output` is the static fallback when inferOutput is absent or returns undefined.

---

## Type System

**Array types via string suffix ('TallyState[]').**
`registerType('T', schema)` auto-registers `'T[]'` with `z.array(schema)` and `default: []`. extendLanguage skips T[] types when copying (they regenerate). Never manually register array types.

**'any' matches everything including arrays. 'any[]' matches any array but not scalars.**
`Filter` outputs `'any[]'` not `'any'` — preserves the structural distinction (array vs scalar) even when element type is unknown. `'any'` as actual type is compatible with any expected type (unknown output can flow anywhere).

**null literal added to LiteralValue.**
`null` is a valid literal in the language. Used for explicit empty/absent values in programs, and as the universal fallback when no TypeDefinition.default is specified.

**TypeDefinition.extends? reserved for subtyping.**
Not implemented yet. Will be added when ops that need "any string type" (but not any type) become necessary. `isCompatible` is always called as a function (never inlined) so subtyping is a one-function change when needed.

**Per-type defaults in TypeDefinition.**
`{ default?: unknown }` in registerType config. Auto-derived: boolean→false, number→0, string→'', any→null, T[]→[]. Complex types should provide an explicit default. Fallback chain: InputDefinition.default → TypeDefinition.default → null.

---

## Analyser

**Collect all errors, not fail-fast.**
Produces placeholder CNode on failure and continues. `failedBindings: Set<string>` suppresses cascade errors (dependent bindings silently use placeholder without new errors).

**AnalysisContext as recursive argument.**
Object with mutable shared fields (errors, warnings, analysedBindings, failedBindings) and one immutable field (boundNames). `boundNames` is spread (not mutated) when entering higher-order body scope. Shared mutable fields work correctly in a DAG — nodes are computed once in topo order.

**Lexical order: error for code editor, exempt for rete.**
Detected by checking source positions (`SourceRef.kind === 'code'`). If any binding lacks source info, skip the check entirely. Forward references in the analyser are fine — the topological sort handles ordering. Lexical order is a code-editor UX policy, not a semantic requirement.

**isCompatible always called as a function.**
Never inline `actual === expected`. The function is in registry.ts and takes `descriptor` even when unused. This is the single extension point for subtyping.

---

## API Design

**ProgramHandle from register().**
`runtime.register(id, program)` returns a handle with `onOutput`, `onError`, `unregister`. Per-program handler sets stored in ProgramEntry. `unregister()` clears all per-program handlers. Global `runtime.onOutput` remains for dashboards/loggers that observe all programs.

**run() / createProgramRunner() / createRuntime() — three levels.**
Not unified behind one API. The choice between them is contextual and meaningful. Callers know which they need.

**Environment wrapper (planned, not built).**
Will hold descriptor + hostContext to avoid threading them through every call. Will expose analyse, load, run, createRunner, runtime, and a convenience register(id, saved) that combines load + runtime.register. Not built yet because analyser (which it wraps) doesn't exist yet.

