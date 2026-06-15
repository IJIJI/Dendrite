# Dendrite — Project Context

Dendrite is a declarative dataflow language with a pull-based evaluator, designed to be embedded in host applications. Programs declare named bindings and outputs; when context inputs change, only affected nodes recompute (pull-based with WeakMap caching). The language supports a dual-mode editor: a visual node graph (Retejs) and a code editor.

**Key language properties:**
- **No loops, no functions** — control flow is handled by the evaluator (higher-order ops), not the program author. There are no function definitions or loop constructs.
- **Immutable bindings** — `Set x = expr` creates a constant within one evaluation cycle. Different cycles may produce different values if inputs changed, but within a cycle each binding is evaluated at most once.
- **Dendrite has no dependency on Beacon** — Beacon depends on Dendrite, not the other way around.

Example (code editor syntax, parser not yet implemented):
```
Set scores     = [4, 8, 15, 16, 23]
Set highScores = Filter(scores, item: GreaterThan(item, 10))
Set anyHigh    = Some(scores, item: GreaterThan(item, 10))
Set status     = If(anyHigh, "pass", "fail")
output result  = status
```

---

## Package ecosystem

| Package | Description | Status |
|---|---|---|
| `@dendrite-lang/core` | Core evaluator, type system, analyser — this repo | In development |
| `@dendrite-lang/editor` | Dual-mode editor: VSCode-compatible code editor + Rete block flow editor | Planned |
| `@dendrite-lang/beacon` | Beacon tally system integration — extends `@dendrite-lang/core` | Planned |

During development, Beacon references Dendrite via a `file:` path in its `package.json`. In production it references the published npm package.

---

## Build tooling

- **Build:** `tsup` — outputs CJS (`dist/index.js`), ESM (`dist/index.mjs`), type declarations (`dist/index.d.ts`)
- **Tests:** `vitest`
- **CI/CD:** GitHub Actions — publishes to npm on GitHub release
- **License:** MPL-2.0

---

## Pipeline

```
SavedProgram → deserialise → RawProgram → analyse → CoreProgram → evaluate
                                              ↑
                                    (analyser.ts — to be built)
```

- **No desugar phase** — the pull-based evaluator already handles what desugaring would optimise
- **Store RawProgram**, not CoreProgram — CoreProgram is a derived artifact
- **analyse** is always explicit — not hidden inside runner/runtime

---

## File structure

```
src/
  language/
    nodes.ts       — ASTNode + CNode types, SourceRef, LiteralValue, Analysed
    registry.ts    — LanguageDescriptor, Language, TypeDefinition, OpDefinition,
                     EvaluatorDefinition (with inferOutput), isCompatible, extendLanguage
    program.ts     — RawProgram, CoreProgram, EvalState, evaluate, evaluateProgram,
                     outputDependencies, EvalError, parse/analysis result types
    runner.ts      — run() one-shot, createProgramRunner() stateful single-program
    runtime.ts     — createRuntime(), ProgramHandle (returned by register)
    core.ts        — createCoreLanguage() — logic, comparison, control, list ops
    analyser.ts    — DOES NOT EXIST YET — next thing to implement
    serialise.ts   — DOES NOT EXIST YET — SavedProgram ↔ RawProgram
    environment.ts — DOES NOT EXIST YET — unified entry point wrapping everything
```

---

## Execution hierarchy

Three levels — choose based on context:

| | `run()` | `createProgramRunner()` | `createRuntime()` |
|---|---|---|---|
| State | None | Single program | Multi-program |
| Caching | No | Yes | Yes |
| Subscriptions | No | No | Yes (ProgramHandle) |
| Use case | Tests, one-shot | Custom loops | Production apps |

All accept `CoreProgram`. The runtime returns a `ProgramHandle` from `register()` with `onOutput`, `onError`, `unregister`.

---

## Key architectural decisions

### Evaluation
- **Pull-based**: each CNode has `dependsOn: ReadonlySet<string>` (context input names). On each cycle, `changedInputs: Set<string>` is passed through evaluation. A node recomputes only if `changedInputs ∩ dependsOn` is non-empty AND nodeCache has no entry.
- **EvalState**: `inputs: Map<string, unknown>` (host-managed) + `nodeCache: WeakMap<object, unknown>` (evaluator-computed) + `bodyScope: WeakMap | undefined` (fresh per higher-order apply call)
- **bodyScope exists to prevent stale caching**: item bindings are not in `dependsOn` (not context inputs), so the normal cache check can't detect when they change between apply() iterations
- **Named bindings always use nodeCache** (shared), **inline body nodes use bodyScope** (fresh per item)
- **changedInputs is optional** in evaluateProgram — undefined means "all changed" (safe, no caching)

### Types
- **Array type string convention**: `'boolean[]'` is the array variant of `'boolean'`
- **Auto-registration**: `registerType('T', schema)` automatically registers `'T[]'` with `z.array(schema)` and `default: []`
- **Do NOT manually register array types** — they are always auto-generated
- **extendLanguage skips T[] types** when copying — they regenerate
- **isCompatible** in registry.ts: always call this function, never inline. Handles `any`, `null`, array covariance. `extends?` field on TypeDefinition reserved for future subtyping.
- **Subtyping not implemented yet** — `TypeDefinition.extends?: string` is a placeholder. When added, only `isCompatible` changes.

### Registration
- **Unified EvaluatorDefinition**: single `registerEvaluator` covers both standard ops (`apply = undefined`) and higher-order ops (`apply` is the body evaluation function). TypeScript allows fewer params so standard evaluators can omit `apply`.
- **inferOutput on EvaluatorDefinition**: analysis-time type inference co-located with evaluate. The analyser calls `descriptor.evaluators.get(op)?.inferOutput(inputTypes, bodyOutputType)`. Falls back to `OpDefinition.output` if absent/undefined.
- **No separate registerHigherOrder** — that was removed in favour of unified EvaluatorDefinition

### Language
- **Named bindings** (`Set x = expr`): program-level, computed once per cycle, cached in nodeCache. Visible to all outputs and other bindings.
- **Scoped bindings** (`item`, `acc`, etc.): introduced by HigherOrderNode. Live in inner EvalState.inputs per apply() call. Only visible inside the body.
- **Lexical order**: enforced as analysis ERROR for programs where all bindings have `source.kind === 'code'` (code editor). Not enforced for rete programs (no line numbers). Forward references detected after topological sort.
- **Forward references**: allowed in the analyser (topological sort handles them). Lexical order check is a separate pass.
- **null**: `LiteralValue` includes `null`. `null` is compatible with any expected type in `isCompatible`.
- **Default fallback chain**: `InputDefinition.default` → `TypeDefinition.default` → `null`

### Storage
- **Store RawProgram** (as SavedProgram — serialise.ts, not yet implemented)
- **Re-analyse on load** — CoreProgram is always derived fresh from RawProgram + descriptor
- This means if the descriptor changes, analysis errors surface correctly on load

---

## Type definitions quick reference

```typescript
// Key CNode types (all have dependsOn: ReadonlySet<string>)
CNode = CLiteralNode | CArrayNode | CInputNode | CRefNode 
      | COperationNode | CFieldAccessNode | CHigherOrderNode

// Getting output type from any CNode (for analyser use):
// literal/array/input/ref/field → node.type
// operation/higher_order        → node.output

// EvalState
{ inputs: Map<string, unknown>; nodeCache: WeakMap; bodyScope: WeakMap | undefined }

// EvaluatorDefinition (unified)
{ op: string; evaluate: (inputs, apply | undefined, hostContext?) => unknown; inferOutput?: (inputTypes, bodyOutputType?) => string | undefined }

// AnalysisResult (exists in program.ts as types)
AnalysisSuccess { ok: true; program: CoreProgram; warnings: AnalysisWarning[] }
AnalysisFailure { ok: false; errors: AnalysisError[]; warnings: AnalysisWarning[] }
```

---

## What to implement next

**Priority 1: `src/language/analyser.ts`** — see `.claude/analyser-spec.md` for full implementation spec.

**Priority 2: `src/language/serialise.ts`** — SavedProgram type and RawProgram ↔ SavedProgram conversion. SavedProgram is RawProgram with Maps as plain objects and `source?: SourceRef` stripped (session-scoped, never persisted).

**Priority 3: `src/language/environment.ts`** — unified entry point. See `.claude/architecture.md` for the interface design.

---

## Conventions

- Never inline `isCompatible` — always call the function from registry.ts
- Never store CoreProgram — always store RawProgram
- Never register T[] manually — always auto-generated by registerType
- Evaluators for higher-order ops use `apply!` (non-null assertion) — safe because `apply` is always defined when called from the `higher_order` switch case
- `_apply` prefix for standard evaluators that take hostContext as third param (to skip the apply param cleanly)
- `bodyScope ?? nodeCache` pattern for inline node caching — always bodyScope when inside a higher-order body
