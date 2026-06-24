# Dendrite — Project Context

Dendrite is a declarative dataflow language with a pull-based evaluator, designed to be embedded in host applications. Programs declare named bindings and outputs; when context inputs change, only affected nodes recompute (pull-based with WeakMap caching). It targets a dual-mode editor: a visual node graph (Retejs) and a code editor.

**Key language properties:**
- **First-class functions** — lambdas (`=>`), application, and real lexical closures. Higher-order list ops (`Filter`, `Map`, `Reduce`, …) are ordinary ops with a function-typed input, not a special node kind. There are no loop constructs; iteration is expressed via these ops.
- **Declarative, no side effects / no sequencing** — no `;`, no mutation, no `box`. A program is a set of `let` bindings + `output`s; multiline = bindings, not statements.
- **Immutable bindings** — `let x = expr` is a constant within one evaluation cycle (evaluated at most once); different cycles may differ if inputs changed.
- **Strongly normalising (v1)** — recursion is blocked (self-reference → `binding_cycle`; self-application is untypable, and functions are never `any`).
- **Dendrite has no dependency on Beacon** — Beacon depends on Dendrite, not the other way around.

Example (code-editor syntax):
```
let scores     = [4, 8, 15, 16, 23]
let highScores = Filter(scores, item => item > 10)
let anyHigh    = Some(scores, item => item > 10)
let status     = If(anyHigh, "pass", "fail")
output result  = status
```

---

## Package ecosystem

| Package | Description | Status |
|---|---|---|
| `@dendrite-lang/core` | Evaluator, type system, parser, analyser — this repo | In development |
| `@dendrite-lang/editor` | Dual-mode editor: code editor + Rete block-flow editor | Planned |
| `@dendrite-lang/beacon` | Beacon tally integration — extends `@dendrite-lang/core` | Planned |

---

## Build tooling

- **Build:** `tsup` (CJS + ESM + d.ts). **Tests:** `vitest`. **License:** MPL-2.0.
- **Yarn PnP** — prefix tooling commands with `yarn` (`yarn tsc`, `yarn vitest run`, `yarn tsx …`).

---

## Pipeline

```
source ──parseSource──▶ RawProgram ──analyse──▶ CoreProgram ──evaluate──▶ Map<string, unknown>
```

- **`parseSource(source, language)`** — lex + parse → RawProgram (no analysis).
- **`analyse`** is always explicit — not hidden inside runner/runtime.
- **No desugar phase** — the pull-based evaluator handles what desugaring would optimise.
- **Store RawProgram**, not CoreProgram — re-analyse on load so descriptor changes surface errors.

---

## File structure

```
src/language/
  infra/      types.ts (Type union + constructors), nodes.ts (ASTNode/CNode, node constructors),
              registry.ts (LanguageDescriptor, isCompatible, FnValue), program.ts (Raw/CoreProgram)
  parser/     lexer.ts, parser.ts (Pratt kernel), grammar.ts (registration API),
              core-grammar.ts (installCoreGrammar), precedence.ts (BP ladder), types.ts
  analyser/   analyser.ts (analyse: pass pipeline), types.ts
  evaluator/  evaluator.ts (evaluate, EvalContext, memoise), types.ts (EvalState, EvalError)
  runtime/    runner.ts (run, createProgramRunner), runtime.ts (createRuntime, ProgramHandle)
  stdlib/     index.ts (createStdlib — types, ops, operators)
  language.ts Language assembly: createLanguage / extendLanguage / parseSource
```

See `architecture.md` for the layering DAG and full design.

---

## Key architectural decisions

### Type system
- **Structured `Type`** (`{kind:"name"|"array"|"function"}`) — no type strings. Only named types are
  registered; **arrays and functions are structural** (`Type.array` / `Type.fn`), no auto-`T[]`.
- **`isCompatible`** (registry.ts, always call it): `any`/`null` data rules + **functions-⊄-`any`**
  guard; array covariance; function contravariant-params/covariant-return; `extends` chain (subtyping
  is implemented).

### Evaluation
- **Pull-based** — each CNode has `dependsOn`; recompute iff `changedInputs ∩ dependsOn ≠ ∅` and no
  cache hit. `EvalContext` bundles traversal invariants; `memoise()` is the shared cache helper.
- **`EvalState`**: `inputs` (host, string-keyed) + `nodeCache` (WeakMap) + `bodyScope` (WeakMap,
  fresh per closure application) + `localBindings` (lambda params, **local-first** so they shadow
  globals).
- **changedInputs optional** — `undefined` = "all changed" (no caching), used by `run()`.

### Functions
- **Lambda → `Type.fn`**, application via `resolveAppArgs`; **closures capture `localBindings`**.
- **Higher-order ops = ordinary ops with a function-typed input.** `EvaluatorDefinition` has
  `inferInputTypes` (refine the function input's element type from resolved inputs) and `inferOutput`
  (concrete output type). No `apply`, no `HigherOrderNode`.

### Registration / Language
- A **`Language` = `{ descriptor, grammar }`** with one unified register API
  (type/op/input/output/evaluator → descriptor; nud/led/statement/infix/prefix → grammar).
- `createLanguage()` = empty base (core grammar only); `createStdlib()` = batteries (types + ops +
  operators); `extendLanguage`/`extendStdlib` compose. Operators are sugar over ops (`registerInfix`/
  `registerPrefix`), desugaring to op nodes; the lexer's operator vocab is single-sourced from
  `grammar.operatorTokens`.

### Analyser
- `analyse` is a **pass pipeline**: `buildReferenceGraph` → `topoSort` (cycle detection) →
  `computeReachability` → `analyseBindings` (topo order) → `validateOutputs` → `pruneBindings` →
  `warnUnusedBindings`. Collect-all-errors (no fail-fast); `failedBindings` suppresses cascades.
- **`localBindings`** (in `AnalysisContext`) is the local scope (lambda params), spread when entering
  a lambda body. Lexical-order check is code-editor-only (skipped for rete / missing source).

### Storage
- **Store RawProgram** (as `SavedProgram` — `serialise.ts`, not yet built). Re-analyse on load.

---

## Conventions

- Never inline `isCompatible` — always call it from registry.ts (single subtyping extension point).
- Never store CoreProgram — always store RawProgram.
- Arrays/functions are structural — never "register" them.
- `bodyScope ?? nodeCache` for inline-node caching (bodyScope when inside a lambda body).
- Raw `ASTNode`s carry no inferred `type` — the analyser produces typed `CNode`s.
