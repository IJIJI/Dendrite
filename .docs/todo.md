# Dendrite — Deferred Work

Things deliberately postponed. Each entry notes why it was deferred and what implementing it would require, so a future session can pick it up with full context.

---

## Explicit conversion ops

**What:** Type-conversion ops in the core language — `ToBool`, `ToNumber`, `ToString`, and any others that prove useful.

**Why deferred:** Implicit coercion (e.g. number→boolean) was rejected because it undermines the soundness model and would require inserting conversion nodes (a desugar-like rewrite Dendrite deliberately lacks). Explicit conversion ops are the sound alternative — the program author writes the conversion where they want it, it is visible in the program, and the type checker stays honest.

**What it requires:**
- Register ops in `index.ts` (core):
  - `ToBool(value: any) → boolean` — evaluator maps `0`/`''`/`null`/`false` → false, else true. Decide the exact truthiness rule explicitly rather than relying on JS `Boolean()`.
  - `ToNumber(value: any) → number` — evaluator maps `false`→0, `true`→1, numeric strings→number, else error or default 0 (decide).
  - `ToString(value: any) → string` — evaluator stringifies.
- No analyser changes needed — these are ordinary ops with fixed output types.
- Tests for each conversion's evaluator behaviour and the edge cases (null, empty string, non-numeric string).

**Driving need:** none yet. Add when a real program needs to bridge two types and the author would otherwise want implicit coercion.

---

## Struct field typing — DONE

Implemented: `TypeDefinition.fields?: Record<string, Type>` (field name → type, structured); `registerType`
config + `extendLanguage` copy it; the analyser's `field` case resolves the struct type, infers a known
field's type (recursing for nested struct fields → multilevel) and errors on an unknown one
(`unknown_field`). Types without `fields` keep the permissive fallback (`any`; primitive → warning).
`fields` duplicates the Zod schema deliberately — explicit is debuggable and version-stable (no Zod
introspection). Verified end-to-end against the Beacon `Bus` struct (typed `bus.state`/`bus.sources`,
zero `implicit_any_cast` warnings, `bus.staet` typo caught). Inheritance is wired too: field lookup
follows the `extends` chain (inherited fields resolve; most-derived override wins), and
`validateDescriptor` checks each override is compatible with the parent's field
(`incompatible_field_override`) so a declared `Derived extends Base` is sound.

**Still deferred — struct *literals* (constructing a struct in-language).** Reading host structs is
done; *producing* one (`{ a: …, b: … }` in a program) is separate and larger — it wants a structural
record arm in the `Type` union + structural compatibility, and raises the nominal-vs-structural fork.
No consumer yet (Beacon structs arrive from the host as inputs). Trigger: something must return a
struct in-language (e.g. multi-field lambda return).

---

## Subtyping — Beacon-side representation (precondition before declaring extends)

**What:** Actually declare subtype relationships like `TallyState extends number` in the Beacon package.

**Why deferred:** The `extends` machinery is wired into core's `isCompatible` (chain walk + array covariance), but no type declares `extends` yet, and Beacon code is intentionally not modified.

**CRITICAL precondition:** declaring `TallyState extends number` is only **sound if the runtime values are actually numeric**. Currently `TallyState = 'program' | 'preview' | 'idle'` — these are strings. If `extends: 'number'` is declared while values stay strings:
- `isCompatible('TallyState', 'number')` returns true (analyser permits a TallyState into `GreaterThan` etc.)
- but at runtime `GreaterThan('program', 'preview')` compares STRINGS, not priorities — silently wrong.

**Two ways to make it sound (pick one before declaring extends):**
1. **Numeric representation:** change TallyState runtime values to ordinals (`idle=0, preview=1, program=2`). Comparison ops then work correctly. Requires updating the schema, `highestTallyState`, and any code that compares against the string literals.
2. **Ordinal mapping in comparison ops:** keep strings, but the Beacon comparison ops map enum→ordinal before comparing. More localised but means TallyState isn't *really* a number, just comparable — which is closer to the coercion we rejected, so option 1 is cleaner.

**What it requires:**
- Decide representation (option 1 recommended).
- Declare `extends` in `@dendrite-lang/beacon`'s `registerType` calls.
- Tests confirming TallyState flows into numeric ops AND that the comparisons produce priority-correct results at runtime.

**Driving need:** comparing tally states by priority numerically, or any place a TallyState should be usable as a number.

---

## Op-declared context-input dependencies (ambient inputs for node types)

**What:** Let an op *definition* read a context input ambiently — without the program wiring it at
every call site — while keeping the incremental cache sound.

**Why deferred:** Not needed for the watched-sources MVP (ops take explicit inputs; once the prelude
exists, a helper lambda can close over `$inputs`). Becomes worthwhile for host-specific ops (e.g.
Beacon's `TallyCheck`) that depend on an ambient input (the tally map) intrinsically.

**The soundness constraint:** `dependsOn` is computed statically from the AST (`collectRefs` over
`InputNode`s). A prelude lambda using `$tallyMap` is AST-visible → sound. An op's TS evaluator is
opaque → any input it reads must be **declared** so the analyser can fold it into the node's
`dependsOn`. This is the disciplined, declared successor to the removed `hostContext` (declared =
visible = sound) — *not* a reversal of inputs-only.

**Recommended shape — auto-wired op input:**
- `OpInput.defaultInput?: string` — the name of a context input.
- Analyser `validateInputs`: a missing input with `defaultInput` set → synthesize an
  `InputNode(defaultInput)` as the argument (instead of the type-default placeholder). It then flows
  through normal analysis — type-checked against the op input's type, contributes the input name to
  `dependsOn`, and arrives in the evaluator's `inputs` under the op-input name. Overridable (a program
  may still wire it explicitly). No evaluator-signature change; `extendLanguage` already copies ops.

**Alternative shape (strictly-ambient):** `OpDefinition.reads?: string[]` + a second evaluator arg
`evaluate(inputs, reads)`; the analyser folds `reads` into `dependsOn`. Use only for ambient inputs
that genuinely aren't arguments and must not be overridable — costs a re-introduced second channel.

**Driving need:** Beacon ops combining a per-call argument with intrinsic host state (tally map, source
registry). Until then, explicit op inputs + prelude wrappers cover it.

---

## Code-TODO roundup (2026-09 repo sweep)

Small tracked items promoted from inline `// TODO`s. Each names its source location.

- **Missing-input defaults for structural types** ([analyser.ts](../packages/core/src/language/analyser/analyser.ts) `validateInputs`):
  the type-default placeholder only consults the registry for NAMED types — a missing array-typed
  input gets a `null` literal (typed `T[]`), so `Length(null)` throws at runtime. Should derive `[]`
  structurally for arrays; decide behaviour for function-typed inputs (probably an error).
- **Output-mode semantics review** (analyser `validateOutputs`): should a program with a missing/
  failed REQUIRED output still produce the partial CoreProgram it does today (ok:false + program)?
  And should `desired`/`optional` get more feedback on poisoned deps? One coherent decision pass.
- **Lexical order for rete programs** (analyser `buildReferenceGraph`): today any non-code source
  disables the forward-reference check. Should the rete adapter emit declaration order so all
  editors get the same rule?
- **collectRefs lambda shadow tests** (analyser `collectRefs`): the param-stripping recursion works,
  but edge coverage is thin (nested shadowing, param shadowing a binding used elsewhere in the same
  expression).
- **Variadic input types in inferOutput** ([registry.ts](../packages/core/src/language/infra/registry.ts)
  `EvaluatorDefinition`): variadic inputs are excluded from `inputTypes` entirely — should they be
  passed as the element type, the array type, or stay excluded? Decide + document.
- **Eval error surface review** ([evaluator/types.ts](../packages/core/src/language/evaluator/types.ts)):
  `input_not_set` only fires at eval; runner/runtime seed defaults so it mostly can't happen — decide
  whether bare `evaluate`/`run` should pre-check inputs against the descriptor instead.
- **Result-logging helpers** (from src/readme.md): small utilities to pretty-print outputs /
  diagnostics like the examples hand-roll.

---

## Editor era — build out `@dendrite-lang/editor`

**→ Planned in [editor-plan.md](editor-plan.md)** (settled 2026-09-04: monorepo, node-modules
linker, ONE package with a `/react` subpath, headless core + React UI, config presets instead of
deployment tiers). Phases 0–4 there cover extraction through the docs embed.

**What:** The dual-mode editor package: a code editor (grown from the playground's framework-free
`lang/` modules) + the Rete node editor, with graph↔code awareness.

**Pulls in (tracked separately, land here):** the rete adapter (graph ↔ RawProgram) + the
`SavedProgram` `rete`-form loader; true source-span ranges; non-gated parsing (error nodes) for
editor-grade diagnostics; the lexical-order-for-rete decision. The React decision is **made**
(React; Rete v2 has a React render plugin).

**Driving need:** visual authoring for Beacon; the playground's input/output UI work is a stepping
stone.

---

## Brand canvas — bring the Claude Design source to tokens 1.1

**What:** `brand/brand-sheet.html` was patched to tokens 1.1 by script on 2026-09-05 (palette
dark-4 card, contrast rows for the syntax colours, status-tag text, every code sample, the
syntax cards, the version line). The `Dendrite Brand.dc.html` canvas it was exported from (in
Downloads, not in git) still holds 1.0, so the next export would regress the sheet.

**Why deferred:** the canvas is edited in Claude Design, not in this repo.

**What it requires:** apply `brand/dendrite-tokens.css` 1.1 to the canvas (sections 4, 5, 6, 8,
12 and 20), re-export, re-copy into `brand/` keeping the README's licence line, and diff the
export against the patched sheet before replacing it.

---

## Brand — try cooler background colours

**What:** The surfaces are warm greys from the brand ramp (ground `#f3f2f2` … dark-0 `#141312`,
all near hue 50-60 at low chroma). Try a cooler cast (hue ~250-270, same lightness steps) for the
editor surfaces, light and dark, and decide whether the brand ramp itself moves with them.

**Why deferred:** a hue shift is a brand-wide decision, and tokens 1.1 were just synced across
the tokens file, the README and the sheet; it deserves its own round with rendered candidates.

**What it requires:** candidate ramps in OKLCH (keep the L steps, add a little chroma at a cool
hue), rendered through the surfaces lab (`editor-surfaces.html` from the scratchpad, built on the
real stylesheet) next to the current warm set; re-check borders, wells and the status soft fills
against the new ground; then update `--dendrite-*` in `packages/editor/style.css`, the
`--dn-ground*` / `--dn-dark*` tokens, the README and the sheet together.

**Driving need:** the warm greys read muddy on the dark canvas.

---

## Editor — tune the highlight colours

**What:** The editor's highlight colours were chosen by formula, not by eye: the active line
(6 % ink veil), selection (`--dendrite-accent-soft`: iris-200 / a derived iris-900), selection
and search matches (15 % accent tint, warning-soft), matching bracket (accent-soft) and the lint
hover range. Tune them in the playground and settle them.

**Why deferred:** they are usable; the palette and surfaces came first.

**What it requires:** trial values via DevTools on the variables and the constants in
`packages/editor/src/cm.ts`, then mirror the result in `brand/dendrite-tokens.css`
(`--dn-selection`, `--dn-editor-active-line`).

---

## Editor — pane resizing

**What:** Drag handles between the canvas and the side column (and between stacked panes), so a
host or user can trade code width for pane width.

**Why deferred:** `Row` / `Column` were built so splitters can be layered on without changing
their API (`packages/editor/src/react/Layout.tsx`); nothing needs them yet.

**What it requires:** a `Splitter` element (or a `resizable` prop on `Row` / `Column`) with
pointer-event dragging, min sizes, an ARIA `separator` with arrow-key resizing, the resulting size
written to a variable such as `--dendrite-side-width`, and a decision on persistence (host
`onChange`-style, or browser storage like the theme).

**Driving need:** wide programs on narrow screens; Beacon embedding the editor beside its own UI.

---

## Editor — style the search and go-to-line panels

**What:** Brand the CodeMirror panels the keymap already opens: search / replace (`Ctrl+F`,
`.cm-panel.cm-search`) and go-to-line (`Ctrl+Alt+G`, `.cm-panel.cm-gotoLine`), plus the lint
hover tooltip.

**Why deferred:** `dendriteTheme` (`packages/editor/src/cm.ts`) only recolours their surfaces,
buttons and fields; the layout (inline labels, checkboxes, spacing, close button) is still
CodeMirror's default.

**What it requires:** `EditorView.theme` rules for the panel layout (4px grid spacing, Archivo
labels, accent checkboxes, a proper close button), or, if the default markup resists styling, a
custom panel via `search({ createPanel })` from `@codemirror/search` (then a direct dependency).

**Driving need:** `Ctrl+F` is used constantly; today it is the one unbranded surface.

---

## Language service (editor intelligence) — the big one

**What:** A **transport-free, DOM-free** query API over `Language` + a document position:
diagnostics, completions, hover types, signature help, go-to-definition, rename. One module, many
clients — the web editor calls it directly (in-process or in a worker); a VS Code extension wraps it
in LSP; a future CLI can lint with it.

**Why it's the big one:** it is the bulk of "usable by developers", it is the *only* piece a VS Code
extension actually needs from this repo (activation + a TextMate grammar are small), and it is the
first module that must answer questions *about* a program rather than run it.

**Prerequisites (already tracked above):**
- **True source-span ranges** (Parser → review findings) — position→node lookup needs real
  start/end spans, not a representative token.
- **Non-gated parsing via error nodes** (Parser → deferred, option B) — completions must work in a
  syntactically broken document, which today produces no program at all.

Both are shared with the web editor, so neither is duplicated cost.

**Shape:**
- `createLanguageService(language)` → `{ diagnostics(doc), completionsAt(doc, offset),
  hoverAt(doc, offset), signatureAt(doc, offset), definitionAt(doc, offset), rename(doc, offset, name) }`.
- Answers come from data that already exists: `descriptor.ops` (name, inputs, output type,
  `category`) for op completions, `grammar` for operator/keyword completions, the analysed
  `CoreProgram` for binding/ref/type answers, `SourceRef` for definitions.
- Incremental reuse: the analyser already runs per keystroke in the playground; the service should
  cache the last good `CoreProgram` so a broken edit still answers from the previous tree.
- **No `vscode-languageserver` dependency in this module** — the LSP adapter lives in the extension.

**Driving need:** developer-grade editing in `@dendrite-lang/editor`; a VS Code extension for `.den`
files (including this repo's own `examples/*.den`).

---

## Multi-document / workspace editing

**What:** More than one program open at once — a document list, tabs, and cross-document concerns
(name collisions, "which document is this ref from").

**Why deferred:** Not needed at first. Beacon's MVP is one logic field per editor mount, and the
playground is a single-document scratchpad by design.

**Decide now, build later — document identity.** Even single-document hosts need to know *which*
document they are saving. Add an optional `id` (and host `meta`) to the document envelope when the
`DocumentStore` seam lands, because the store keys on it; retrofitting an id into already-shared
payload URLs is the expensive version of this.

**Also pulls in:** the prelude (shared helper bindings across documents) becomes much more valuable
once several documents exist.

---

## Web documentation site

**What:** Public docs for the language: guide (syntax, types, lambdas, operators), op/stdlib
reference (generatable from the descriptor — `category`, inputs, output types are all registered
data), embedding guide (Environment/runtime API), and an embedded playground for live examples.

**Notes:** Framework choice interacts with the playground-React decision below (a React-based docs
stack like Docusaurus favors React-ifying the playground for embedding; Astro/Starlight or
VitePress change that calculus). Deploys next to the playground on GitHub Pages.

**Embedded live examples:** first via an **iframe embed mode** on the playground — a payload URL
plus an `embed` flag that hides the chrome (framework-agnostic, tiny once document-payload URLs
exist). Component-level embedding is the React-switch alternative.

---

## Playground — React switch — DONE

The playground is a React host (`apps/playground/src/App.tsx`) of `@dendrite-lang/editor/react`
(editor-plan Phase 2, landed 2026-09-05); the vanilla shell is deleted. Deciding factor: Beacon is
React, and the chrome (panes, type pickers, top bar) is exactly the stateful list/form UI where a
vanilla shell hurts.

---

## Playground — share links — DONE (document model)

Implemented beyond the original sketch: the session state is a self-contained **document**
(`{source, surface, values}` with the surface as JSON-safe data), the URL fragment live-holds the
deflate+base64url payload (Share = copy URL), preset ids (`#tally`) are one-shot entry links that
convert to payload URLs, and preset loads push history entries (Back restores the previous
document). See `apps/playground/src/lang/{surface,document,permalink}.ts`.

---

## Playground — user-settable inputs and outputs

**→ Scheduled as [editor-plan.md](editor-plan.md) Phase 3** (built in React against the Phase 1
models, gated by `surface.userInputs`). Kept here for the requirements.

**What:** UI to declare/edit the language surface (inputs and outputs: name, type, default) from
the playground itself. **The data structure already exists** — documents carry a `SurfaceSpec`
(`apps/playground/src/lang/surface.ts`); this feature is "edit `document.surface` → rebuild language →
recompile", machinery the boot/dispose lifecycle already supports. Declarations travel in share
URLs automatically.

**Still needs:** a type picker (named/array types over the registered set), add/remove/edit rows
for inputs+outputs, and validation UX for dangling type references (createEnvironment fail-fast →
boot_failed rendering exists). A concrete step toward the editor era — the same UI generalises to
the Rete side's port configuration.

---

## Playground — its own lint setup (it left the root's coverage)

**→ Absorbed by [editor-plan.md](editor-plan.md) Phase 0:** the workspace conversion (one lockfile,
node-modules linker) lets the root ESLint config cover every package again, so the playground
needs no setup of its own. The requirements below become moot once Phase 0 lands.

**What:** ESLint *inside* the playground project — own `eslint.config.mjs`, own devDeps, own `lint`
script — plus a `yarn lint` step in `playground-check.yml`.

**Why it came up:** CI now treats the playground as the standalone project it already is (own
lockfile, own node_modules linker, own workflow, own repo later), so the root ESLint config ignores
`playground/**`. Linting it from the root would type-resolve its sources against dependencies the
core project never installs — green locally, fragile in CI. The trade left the playground unlinted.

**What it requires:** `eslint` + `typescript-eslint` in `playground/package.json`, a config mirroring
the root's rules (`no-unused-vars` with `^_`, `no-explicit-any` warn, `projectService`), a
`"lint": "eslint ."` script, and one more step in the playground workflow.

---

## Prelude / global helper bindings (shared across programs)

**What:** A prelude — one or more `.den` files of (lambda) bindings — parsed + analysed once and made
available to every program in an environment/runtime, so users (and Beacon) factor out repetitive
logic without re-declaring it per program.

**Why deferred:** Post-MVP. The watched-sources MVP needs no shared helpers, and Beacon's own helpers
can ship as ops first. The prelude is specifically what lets *users* author global helpers in Dendrite.

**What it requires:**
- Parse (`parseSource`) + analyse a prelude once into named (analysed) bindings — mostly lambdas.
  Attach to the environment / runtime, e.g. `createEnvironment(language, { prelude })`.
- Ref resolution gains a third scope: `localBindings` (lambda params) → program `analysedBindings` →
  **prelude** (ambient base). The prelude can't see program bindings; program names shadow prelude
  names (decide: silent vs a `shadowed_binding` warning).
- Analyse the prelude in its own context (language + earlier prelude bindings only); reuse the result
  across all programs (it doesn't change).
- Evaluator: prelude bindings live in a shared base scope, evaluated once and cached. A prelude lambda
  referencing an input contributes that input to dependents' `dependsOn` (sound — the `$input` ref is
  AST-visible).
- Builds on the existing scope machinery (`localBindings` / `analysedBindings`); no architectural
  upheaval.

**Driving need:** Beacon ships a base prelude (`isLive`, `tallyColor`, …); users add their own `.den`
globals. The TallyState→color map settles here as inputs + a `tallyColor` helper.

---

## Other planned files (not yet implemented)

These are architecturally specified but unbuilt. Listed here for completeness; see architecture.md and CLAUDE.md for design.

- **`serialise.ts` (DONE)** — `SavedProgram` is a tagged union of AUTHORING forms (`code` source
  text | `rete` opaque graph blob, reserved for the editor package | `ast` plain-record RawProgram),
  because the authoring artifact is canonical and the AST is lossy (comments, formatting, operator
  desugar). SourceRefs are kept verbatim; core owns the format `version` + `migrate()` seam; hosts
  wrap their own envelope. See `packages/core/src/language/infra/serialise.ts`.
  **Follow-up:** when a second format version lands, shape `migrate()` as a stepwise chain (one
  entry per retired version, never edited again) like the editor's `applyMigrations` in
  `packages/editor/src/document.ts` — or move that helper into core and share it.
- **`environment.ts` (DONE)** — `createEnvironment` with `parse`/`analyse`/`compile`/`load`/`run`/
  `createRunner`/`createRuntime`. `load(saved)` dispatches on form and always re-analyses
  (`LoadResult` = `CompileResult` + a `stage:"load"` arm). A `register(id, saved)` convenience was
  deliberately omitted — Environment stays a stateless facade; hosts own their runtime. Still
  future: the shared prelude (see below).
- **Parser (DONE)** — `source → RawProgram` via `parseSource` (lex + parse) with `SourceRef { kind: 'code', … }`. A full `compile` (parse + analyse) belongs on the future `environment.ts`.
- **Rete adapter** — `rete graph ↔ RawProgram` with `SourceRef { kind: 'rete', nodeId }`. Lives in
  `@dendrite-lang/editor`. Also implements the loader for `SavedProgram`'s reserved `rete` form
  (until then `env.load` fails it with `unsupported_form`).

---

## Parser & Lexer — DONE

The entire parser/lexer worklist is implemented and green: lexer, expression core, `let`/`output`
statements, calls, arrows + higher-order (since collapsed into ordinary ops with function-typed
inputs), and the **grammar-registration API with operators**. The grammar lives in the parser layer
(kernel `parser.ts` + `grammar.ts` registration API + `core-grammar.ts` + `precedence.ts`); operators
are stdlib-registered sugar over ops; the lexer's operator vocabulary is single-sourced from
`grammar.operatorTokens` (no lexer↔parser desync). Source→RawProgram is `parseSource` (formerly
`compile`).

### Review findings — remaining

- **True source-span ranges.** Compound / operator nodes currently carry a single *representative*
  token's `source` (operator nodes now get the operator token's ref). A real start→end span is
  deferred: nothing consumes it yet (no code editor), Rete highlights whole nodes (`nodeId`, no
  sub-range), and the `SourceRef` shape would need an absolute offset or end position. When the code
  editor lands, decide the highlight model — representative token vs full range vs whole line. (See
  the `SourceRef` note in `infra/nodes.ts`.)
- **Core-grammar consistency test.** A cheap test that every structural punct the lexer can emit has
  a parser handler (and vice versa), catching drift. (Quality; optional.)
- **Lexer `\r` edge.** `advance` only increments `line` on `\n`; a lone `\r` (classic-Mac line
  ending) would not. Non-issue for `\n` / `\r\n`; normalize only if it ever matters.

### Deferred

- **Full TS-style non-gated parsing (option B), via a raw error node.** Today parsing gates the
  pipeline: any parse error → `ParseFailure` (no program) → analyser does not run, so only real
  parse errors surface (option A). TS/Roslyn/rustc instead always produce a tree (with explicit
  error nodes) and run the checker on it, showing syntax + semantic errors together. The clean
  design — two tiers:
  - **Binding identity unparseable** (`let = …`, no name) → `ok: false`, program fails. Still sync
    to the next `let`/`output` and collect other statements' diagnostics.
  - **Binding identified, value errors** → replace the RHS with a raw `ErrorNode`; the analyser
    maps it to the existing `CErrorNode`, poisons the binding, and cascade-drops dependents — with
    no bogus `null`-type errors, because an error node is unambiguously "broken," and refs to the
    binding still resolve (no spurious `undeclared`).

  **Requires:** add `ErrorNode { kind: "error"; source? }` to the raw `ASTNode` union (reverses the
  minimal-AST decision — justified: error nodes are load-bearing for recovery, as in TS/Roslyn); a
  `case "error"` in `analyseNode` (return `CErrorNode` + poison) and in `collectRefs` (no refs);
  parser emits `ErrorNode` for a poisoned binding's value. This is the correct, bounded form of B
  (no general missing-node recovery needed). **Do it with the language-server work, not before** —
  editor-grade all-errors-at-once isn't needed until then, and it touches the analyser.

### Lambdas — deferred sub-features

(Decided during lambda design; the core lambda/app work comes first.)

- **Recursion / `letrec`.** Deliberately not allowed initially. Note: full first-class functions
  admit recursion via self-application (Y-combinator), but a **strongly-typed system with no
  recursive types makes self-application untypable** → programs stay total (strong normalisation),
  *provided* function-position values are never `any`. Adding explicit `letrec` later is what would
  break totality — at which point a fuel/step limit (to avoid hanging the reactive eval cycle) must
  be decided.
- **Relax functions-⊄-`any` + better recursion guards.** The functions-⊄-`any` rule is the
  totality guard for v1 — it cleanly blocks the Z combinator (`(number, any) => number` can't
  swallow a function), but it's blunt, not fully principled. When deliberate recursion (`letrec`)
  is added, revisit: allow functions under `any` again, guarded instead by a runtime fuel/step
  limit and/or proper recursion detection. Ties to the recursion/`letrec` item above.
- **Lambda param-type inference from body usage.** Collect the expected type at each use site of a
  param (each op input slot is typed) and meet them into the most specific common type; conflicting
  uses → type error. Local constraint collection, not full Hindley-Milner. Lower priority because
  higher-order ops already supply param types (`inferInputTypes` + contextual typing) and explicit
  annotations cover standalone lambdas; this only closes the standalone-unannotated gap.
- **Optional / default params.** `(x?: number)` declined for now (no use case yet — higher-order
  ops are fixed-arity). Deferred for lack of need, *not* difficulty. Three escalating options:
  1. **Unset default (preferred).** Trailing-only optional params; an absent arg binds to an
     `unset`/`null` sentinel, queried with the existing `IsSet` and handled with `Default(x, …)`.
     Cleanest — no nullability unions, leans entirely on stdlib ops you already have.
  2. **Null default.** Same idea, absent → `null` (compatible with every type via `isCompatible`).
  3. **Default values** `(x: number = 0)` — richer but must evaluate the default expression.
  In all cases the only real cost is the arity-rule surface (trailing-only enforcement).
- **Multi-field lambda return.** "Several named outputs from a lambda" = returning a **struct**
  (`return { a: …, b: … }`). Needs struct literals + struct types (see *Static field typing for
  FieldAccessNode*). Until then, a lambda returns one value. Keep `return` (lambda, single value)
  and `output` (program, multiple) as distinct constructs — do not overload.

### Type system — deferred

- **Heterogeneous array typing (generics + unions).** Array literals now infer a *homogeneous*
  element type — all items the same → `T[]`, else `any[]` (the analyser's `array` case). Two larger
  follow-ups for non-homogeneous cases:
  - **Generic type parameters** (`T extends number` → use `T` and `T[]` so an op forces its array and
    function inputs to share an element type). A *targeted* form already exists for ops via
    `inferInputTypes` / `inferOutput` (Filter/Map thread the element type); user-facing generic
    *parameters* are a separate, larger feature.
  - **Union element types** (`[1, "a"]` → `(number | string)[]`) depend on the union-types work below.
  Both deferred — homogeneous inference covers the common case; revisit when heterogeneous collections
  or generic ops become a real need.
- **Explicit nullability via union types.** Today `null` is compatible with every type (a bottom
  type), giving *implicit* nullability + an `implicit_any_cast` warning when it flows into a concrete
  type. The sound alternative is strict-null + unions (`T | null`): a new `{ kind: "union"; members }`
  `Type` variant; `isCompatible` distribution (`A` ⊆ `B|C` iff A⊆B or A⊆C; `A|B` ⊆ `C` iff both);
  normalization (flatten nested, dedup, `any`-absorption); `typeToString` (`A | B`); `typesEqual` as
  set equality; and inference that produces unions (`If` differing branches → `T | U`, `Find` →
  `T | null`). Nodes that might-or-might-not output then type as `T | null`, narrowed via
  `Default`/`IsSet`. Significant — touches the whole type system. Deferred; nice for soundness.

### Doc fixes

- _(Done)_ The `.docs/` set (CLAUDE.md, architecture.md, analyser-spec.md, decisions.md,
  ops-reference.md) and `packages/core/src/readme.md` were brought current with the structured-`Type`, first-class
  function, parser/grammar-split, and `createStdlib`/`parseSource` reality.