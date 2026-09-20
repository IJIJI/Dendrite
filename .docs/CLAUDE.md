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
| `@dendrite-lang/core` | Evaluator, type system, parser, analyser — this repo | **On npm at 0.2.0** (2026-09-20). In development. Inputs/outputs LEFT `Language` for layered `Ports` + `ProgramInstance` (delivered 2026-09-07; see `architecture.md` and `decisions.md`) |
| `@dendrite-lang/editor` | Dual-mode editor: code editor + Rete block-flow editor | **On npm at 0.2.0** (2026-09-20). In development — headless core + React blocks (`./react`: `<Editor>`, canvas, panes, top bar, actions, a static `Source`) and three layout presets on one `LayoutConfig` (Minimal · Compact · Full, 2026-09-10); mounts over a `Connection` (own stack, a host's runtime, or an attached instance) since 2026-09-08; Rete to come (`editor-plan.md`) |
| `@dendrite-lang/link` | A `ProgramInstance` across a channel: `serveInstance` on the host, `connectInstance` for a replica; MessagePort and WebSocket adapters | **On npm at 0.2.0** (2026-09-20). Landed 2026-09-08 (`architecture.md` "Linking", `packages/link/README.md`) |
| `@dendrite-lang/beacon` | Beacon tally integration — extends `@dendrite-lang/core` | Planned |
| `apps/playground` | The playground: a React host of the editor, fully client-side | Deployed at `ijiji.github.io/Dendrite/playground/` |
| `apps/docs` | The documentation site: Astro + Starlight, the stdlib reference generated from the descriptor, live examples as editor islands | Built 2026-09-09, content to come (`docs-plan.md`); deployed at the root `ijiji.github.io/Dendrite/` |

---

## Work tracking

Three files in `.docs/`, and every deferred item goes in one of them **the moment it is
deferred**: a `TODO` left in code, an option offered and not taken, a "later" in an answer, a
decision postponed, a follow-up a fix turns up. Nothing is kept only in a conversation.

- **`todo.md`** - the near future: what is being worked on, and what comes straight after.
- **`backlog.md`** - postponed to some later point in time, each entry with why and what it
  would take. Code `TODO` comments are listed in its "Code-TODO roundup".
- **`done.md`** - finished entries, kept for reasoning nothing else records.

A finished todo moves to `done.md`; a backlog item picked up next moves to `todo.md`. When a
`TODO` comment is answered, delete the comment along with closing its entry.

---

## Working in this repo

How changes are made here, for anyone - a person or a model - picking the project up.

**Plan first.** Propose a plan and get explicit approval before any non-trivial change.

**Review before committing.** Bug, design and code-smell passes over the diff until a pass finds
nothing, in [refactoring.guru](https://refactoring.guru)'s vocabulary: name the smell, and the
pattern if one fixes it, and say so when something is deliberately *not* a smell. KISS counts as
much as patterns. The main guard is **Speculative Generality**: no flag, option or abstraction
without a named consumer.

**Gates**, all at the root, each judged by its **exit code**: `yarn typecheck`, `yarn lint`,
`yarn format:check`, `yarn test`, and `yarn workspace dendrite-docs build` when the docs changed.
Do not judge a gate by searching its output: `astro check` colours it, so a search for `error ts`
matches nothing while the command exits 1.

**Commits are the maintainer's.** Hand over one table per commit - the files as rows, with what
changed in each - plus the exact `git add` and a one-line message, then stop until it is
committed. Never stack new work on uncommitted changes. PRs are the maintainer's too: say when a
point is a good one to open a PR, but do not write its title or body, or open it, unless asked.

**Branches.** Work happens on `dev`; `main` is the default branch and the only one the Pages
deploy runs from. `dev` has a GitHub ruleset forbidding merge commits, so never `git merge` into
it, not even a fast-forward onto `main`. PRs land on `main` with a merge commit, so `main` holds
nothing `dev` lacks and `dev` needs no updating after a merge. If a merge commit does reach `dev`,
drop it with `git rebase --onto origin/dev <merge-sha> dev`.

**Workspaces.** Bins are per workspace: every package declares its own `typescript`, `tsup` and
`vitest`, because a root-only devDependency is invisible to `yarn workspace <name> run`. One
package's tests alone: `yarn workspace @dendrite-lang/editor run test`.

**Docs prose uses no dash where an em dash would go** (an aside, an introduction, a trailing
thought): a comma, a colon or parentheses instead, rewritten by hand, which is most places. A
dash that reads naturally may stay. Code and tables are exempt.

---

## Build tooling

- **Build:** `tsup` (CJS + ESM + d.ts). **Tests:** `vitest`. **License:** MPL-2.0.
- **Releasing:** a GitHub release starts `.github/workflows/publish.yml`, which **stages** every
  public package version npm lacks, through trusted publishing (no token); a maintainer approves
  each with 2FA. The runbook is "Every later release" in `release-plan.md`.
- **Yarn 4 workspaces** (`nodeLinker: node-modules`; one root lockfile): `packages/core`,
  `packages/editor`, `apps/*`. Prefix tooling commands with `yarn` (`yarn tsc`, `yarn vitest run`,
  `yarn tsx …`); root `yarn typecheck` / `test` / `build` fan out over every workspace,
  `yarn lint` / `format` run once from the root. See `editor-plan.md` for the layout rationale.

---

## Pipeline

```
source ──lex──▶ tokens ──parse──▶ RawProgram ──analyse──▶ CoreProgram ──evaluate──▶ Map<string, unknown>
                                                  ▲
         vocabulary + port layers ──compose──▶ LanguageDescriptor
```

The docs draw the same five steps (lex, parse, compose, analyse, evaluate), with **desugar** as a
substep of parse and **prune** as a substep of analyse (`apps/docs/src/components/Chain.astro`).

- **`parseSource(source, language)`** — lex + parse → RawProgram (no analysis).
- **Desugar happens inside parsing, not as a pass:** a symbol (`>=`) becomes its op call(s) as
  the parser reads. There is no separate desugar phase over the tree.
- **Compose** (`composeLayers`) builds the descriptor from the vocabulary and the port layers; it
  never reads the program. *Every diagnostic* and `DiagnosticDoc.stage` call it `"ports"`.
- **`analyse`** is always explicit — not hidden inside runner/runtime. **Prune** is its last
  passes (`pruneBindings`, `warnUnusedBindings`), so a CoreProgram is already pruned.
- **Store RawProgram**, not CoreProgram — re-analyse on load so descriptor changes surface errors.

---

## File structure

```
packages/core/src/language/
  infra/      types.ts (Type union + constructors), nodes.ts (ASTNode/CNode, node constructors),
              registry.ts (Vocabulary + LanguageDescriptor, isCompatible, FnValue),
              ports.ts (Ports, PortLayer, Policy), identifier.ts, observable.ts,
              program.ts (Raw/CoreProgram), serialise.ts (SavedProgram + its ports)
  parser/     lexer.ts, parser.ts (Pratt kernel), grammar.ts (registration API),
              core-grammar.ts (installCoreGrammar), precedence.ts (BP ladder), types.ts
  analyser/   analyser.ts (analyse: pass pipeline), types.ts
  evaluator/  evaluator.ts (evaluate, EvalContext, memoise), types.ts (EvalState, EvalError)
  runtime/    runner.ts (run, createProgramRunner), runtime.ts (createRuntime, ProgramHandle),
              entry.ts (one program state), seed.ts (defaultValueFor), instance.ts (createInstance)
  stdlib/     index.ts (createStdlib — types, ops, operators)
  language.ts Language assembly: createLanguage / extendLanguage / parseSource
  compose.ts  composeLayers: vocabulary + port layers -> the descriptor a program is checked against
  environment.ts createEnvironment / forProgram: the pipeline, bound to a composed descriptor
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
- A **`Language` = `{ descriptor: Vocabulary, grammar }`** with one unified register API
  (type/op/evaluator → descriptor; nud/led/statement/infix/prefix → grammar). A language declares
  no inputs and no outputs: those arrive as **port layers** and compose into the
  `LanguageDescriptor` a program is checked against (`language/compose.ts`).
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
- **Store the authoring form** (`SavedProgram` in `infra/serialise.ts`: `code` source | reserved
  `rete` graph blob | `ast` records). `env.load` always re-analyses — descriptor drift surfaces on load.

---

## Conventions

- Never inline `isCompatible` — always call it from registry.ts (single subtyping extension point).
- Never store CoreProgram — always store RawProgram.
- Arrays/functions are structural — never "register" them.
- `bodyScope ?? nodeCache` for inline-node caching (bodyScope when inside a lambda body).
- Raw `ASTNode`s carry no inferred `type` — the analyser produces typed `CNode`s.
