# Dendrite — Deferred Work

Things deliberately postponed. Each entry notes why it was deferred and what implementing it would require, so a future session can pick it up with full context.

---

## IMPORTANT — Document the core language (two levels)

**What:** Real documentation of the language itself, in two layers that link to each other.

1. **The chain, in plain terms.** One page a newcomer reads end to end: source text becomes
   tokens, tokens become a raw program, the analyser turns that into a core program with
   types resolved and dead outputs dropped, port layers compose into the descriptor it is
   checked against, and the evaluator walks the result on demand with a per-node cache. Say
   what each stage is allowed to decide and what it must leave alone. One worked example
   carried through every stage, the same program from text to output values.
2. **In depth, per stage.** Lexer and the identifier rule; the Pratt parser kernel and how a
   grammar registers into it; the analyser passes (reference graph, topological order,
   poisoning, output validation) and every error and warning kind with an example that
   triggers it; the type system (structured Type, extends chains, array covariance, function
   variance, the functions-are-never-any totality guard); ports, layers, policies and
   composition order; the runtime levels (run, runner, runtime, instance) and what each is
   for; persistence and the two version axes.

**Why deferred:** Everything written so far is either a design record (`.docs/decisions.md`,
`analyser-spec.md`) or an architecture map for people already inside the code. There is no
document that teaches the language to someone who has not read it. The ports refactor changed
the shape of the chain, so writing this before that work settled would have meant rewriting it.

**What it requires:**
- A stable pipeline. The ports/instance refactor (plan: ports, layers, program instances) has
  to land first, including the descriptor split, or half the prose ages out immediately.
- Decide the home: `packages/core/src/readme.md` is a file layout, not a tutorial. This
  probably wants `.docs/language/` with one file per stage plus the overview, or a docs site
  (see *Web documentation site*).
- Every code sample compiled by a test, so examples cannot rot. The examples folder already
  does this and should be the source of the worked example.
- The ops reference (`.docs/ops-reference.md`) becomes the appendix rather than being retyped.

**Driving need:** onboarding anyone, including the author after a break, and any external user
of `@dendrite-lang/core`. This is the gap between "the code is good" and "the language exists
for other people". Ranked important rather than deferred-indefinitely: it should be written
while the refactor is fresh, not years later.

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

**→ Core prerequisite planned in [ports-plan.md](ports-plan.md)** (settled 2026-09-06): inputs and
outputs leave `Language` for layered `Ports` (host / capability / document, shared on the runtime,
local on a `ProgramInstance`); the editor session becomes an adapter over the instance.

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

## Core — the stdlib in segments a host can pick

**What:** `createStdlib()` is all or nothing. A host should be able to take the segments it
wants - logic, comparison, control, array, arithmetic, list - and leave the rest, so a
lighthouse that never needs list ops does not carry them, and the docs can say "your host
has these".

**Why deferred:** no host exists yet that wants less than everything; the segment names are
already the ops' `category`, so the split is mostly mechanical when it comes.

**What it requires:** one builder per segment (`createLogic()`, … each an `extendLanguage`
step over the base) with `createStdlib()` composing all of them; operators registered with
the segment that owns their op; a test that the composition equals today's stdlib; the docs'
per-segment pages (already one per `category`) gain "how to include only this".

**Driving need:** Beacon choosing its vocabulary; the docs' promise that a host picks parts.

---

## Docs — content notes from the first look at the empty site

Collected 2026-09-09 when the scaffold went up, for the content pass:

- **The chain wants a block diagram first**, prose second. The brand sheet
  (`brand/brand-sheet.html`) has a block style to reuse; inline SVG in the MDX, themed
  through the `--sl-*` tokens so it flips with the site.
- **Learn is a path, not a reference:** getting started (playground, no install) → writing
  programs with the base operators → how the language works → the full stdlib. The sidebar
  is already in that order; the content must read that way too, each page ending in "next".
- **Two readers.** Learn + stdlib are for someone writing programs; Host developers is for
  someone embedding the language, and it owns Installation (every package, every option)
  and the packages. Say this on the splash and at the top of each section's first page.
- **stdlib** is printed as code, one page per segment (generated), the index explaining the
  conventions (variadic inputs, `any`, function-typed inputs) and, once core has it, how a
  host picks segments.
- **A glossary** only once terms accumulate across pages; not as a stub.
- **Code samples in the site's own colours:** highlight Dendrite through the editor's
  `styledRanges` (the same lexer the canvas uses) rendered to spans at build time, rather
  than a second grammar for Shiki. Landed with the ops reference.

---

## Editor — an example layout: slimmed down, read-only, shows the answer

**What:** A third layout beside `DefaultLayout` and the embed's compact one, for a documented
example: the program and what it produces, nothing else - no editing, no declarations, no
diagnostics, no bar. The PHP manual's "example + output" as a live block.

**Why deferred:** the docs site's islands (docs plan, step 3) render examples through the full
editor, and the reference page renders their output as text derived at build time. Both are
fine to start with; a purpose-built read-only block is a design question, not plumbing.

**The design is to be decided.** Open: whether inputs show at all (a read-only Inputs pane
with the seeded values, or nothing); whether outputs sit beside or under the code; whether the
code is a canvas (CodeMirror, read-only) or plain highlighted text through `styledRanges`;
how it relates to the compact/embed layout (a preset of it, or a fourth layout); and how
"open in playground" looks when there is no bar.

**What it requires:** the layout component; `readOnly` on the canvas (CodeMirror
`EditorState.readOnly`); a `Live` variant in `apps/docs`; possibly `styledRanges` → static
spans for the no-canvas option.

**Driving need:** the language docs, once their examples want to be live without inviting
edits on every page.

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

## Editor — a field-wise widget for struct inputs

**What:** Render an input whose type is a struct as one control per field, instead of the raw JSON
box it gets today.

**Why deferred:** `controlFor` (`packages/editor/src/input-widgets.ts`) follows the `extends` chain to
a primitive and falls back to `json` for everything else, so arrays, functions, opaque types and
structs all land in the same textarea. That was fine while structs came only from a host. Once a
port layer can declare its own struct — which it can, as of the ports work — a user will routinely
declare one and then have to hand-edit JSON to give it a value.

**What it requires:** `WidgetSpec` gains a nested shape (field name → its own `Control`, recursing
for nested structs) derived from `TypeDefinition.fields`; the pane renders a labelled group and
writes back a whole object; a decision on what to show for a field the value is missing (fall back
to `defaultValueFor` per field). Arrays of structs are a second, larger step — leave them on JSON.

**Driving need — not yet.** Phase 3 shipped a picker over the types the language already
REGISTERS; declaring a type in a layer is not in the UI (see the entry below), so a user still
cannot make a struct that would need this widget. The trigger is type authoring, or a host whose
layer declares a struct the user must fill.

---

## Editor — refactor the icons to the WebKontrol style

**What:** Rework `packages/editor/src/react/icons.tsx` into WebKontrol's arrangement
(`WebKontrol/app/ui/src/components/icons/Icons.tsx`): an `icon(viewBox, children, fill?)` factory
producing one component per glyph, collected in a named `Icons` object, each taking
`{ size = 20, className, style }`. Dendrite instead has a `glyphs` record and one `Icon({ name })`
that renders every glyph on a fixed 24 grid at stroke 1.75, sized from CSS (`.dendrite-icon`).

**Why deferred:** it is a shape change, not a fix — the current set works and is themed. Doing it
alongside the port panes would have mixed a refactor into a feature.

**The tension to settle first, because the styles disagree on purpose:**
- **Sizing.** WebKontrol takes a `size` prop; Dendrite sizes from the stylesheet, so a host
  retheming the editor moves icons with everything else and no caller has to know a number. Decide
  whether `size` becomes an override on top of the CSS default, or replaces it.
- **Per-icon viewBox and stroke.** WebKontrol varies both per glyph (13/16 boxes, stroke 1.2/1.3).
  Dendrite pins one grid, `strokeWidth 1.75`, and `square` caps with `miter` joins deliberately, so
  the set shares the wordmark's corners. A per-icon factory makes that drift trivial — if the style
  moves, the brand note in the file header has to move with it, or state that the corner rule still
  binds every glyph.
- **Fill.** WebKontrol's `fill` flag has no consumer here yet; every Dendrite glyph is a stroke.

**What it requires:** the factory and the `Icons` object, the eleven existing glyphs ported, the
`IconName` union either dropped (keys become the API) or kept for `TopBarAction.icon`, which is
data and needs a *name*, not a component — so the top bar likely keeps a lookup either way. Then
the call sites: `TopBar`, `PortFields`, and `.dendrite-icon` in `style.css`.

**Driving need:** consistency across the author's own UIs, and per-icon components read better at
the call site than `<Icon name="trash" />`.

---

## Editor — the declaration fields the port panes do not expose

**What:** Phase 3's rows carry a name and a type and nothing else. `InputDefinition.trigger` and
`.default`, `OutputDefinition.mode`, and `Ports.types` — declaring a struct or a newtype on the
layer — have no UI.

**Why deferred:** none has a named consumer, which is this plan's standing rule for a config
surface. `trigger` and `mode` are host-contract concepts (Beacon declares them in code, where they
belong); `default` is derived from the type, and the value widget already sets the value.

**What it requires:** for `mode`, one more `<select>` in `PortDeclaration` and an
`updateOutput(…, { mode })`. For `trigger`, a checkbox plus a decision about what a user-fed
trigger even means in an editor (a "fire" button next to the value?). For types, a third section in
the pane and `addType` / `updateType` / `removeType` in `ports-edit.ts` — plus the field editor a
struct needs, which is the same shape as the struct-input widget above. Note that a persisted layer
refuses a `schema`, so a user-declared type carries shape only and validates through `extends`.

**Driving need:** the type one is the real one — it unblocks the struct-input widget and is the
natural next thing a user reaches for after "add an input". `mode` follows a user who wants to be
told when they delete an output the rest of their program relied on.

---

## The editor as a control surface over a runtime it does not own — steps 1 and 4 DONE

**What:** `createEditor` built its own environment, runtime and instance. That was right for the
playground and wrong for every other host. The editor should mount something the host already
runs, and that runtime should be able to live in the browser (playground) or behind an API
(Beacon), without the editor knowing which.

**Landed 2026-09-08** (five commits; design record in `editor-core-plan.md`, result in
`architecture.md` "Linking"):

- **Step 1.** `createEditor` takes a `Connection` — `ownStack` / `joinRuntime(language, runtime,
  …)` / `attach(language, instance)` — and `dispose` releases only what the connection made.
  The host passes a `Language`, not an environment: the editor builds its own from it.
- **Step 4, ahead of a real API,** because the wire's shape is fixed by `ProgramInstance`, not by
  Beacon: `@dendrite-lang/link`. `serveInstance` / `connectInstance`; a `Channel` the host
  implements over its own pipe; MessagePort and WebSocket adapters. `setLayer` reports refusals
  as `ports` diagnostics marked `refused` (the one interface change, landed first). The replica
  recomposes `ports` from the layers with its own language, echoes values (and the persisted
  layer's into the snapshot), drops pushes stamped before its latest command, adopts a `state`
  push's clock on reconnect, marks outputs stale on disconnect, refuses locally what a local
  instance refuses. `hello` carries a protocol version and a vocabulary fingerprint; a mismatch
  is refused with the difference named. The server enforces `LayerPolicy` and strips schemas.
- The envelope carries an optional `revision`, decided now (step 3's precondition).

**Still open from the "feel local" list** — small, in order of value:
- **Analyse locally.** Diagnostics mirror the server's today (one truth, one round trip). The
  replica has the layers and the language; running `forProgram(...).load(program)` on each edit
  is pure. Decide whether local and server diagnostics merge or local simply wins.
- **Show connection state.** `RemoteInstance.status` (`connected` / `disconnected` / `rejected`)
  exists; nothing in the UI reads it. The `stale` tag on the outputs is the visible signal. A
  TopBar indicator is ~20 lines.
- **Two writers.** The canvas never reads the program back from the instance: after a reconnect
  `state` (or any `setProgram` from elsewhere) text and program can differ until the next
  keystroke, when the text wins. That is what `revision` is for; detection is step 3.

**Remaining, at the end of the backlog:**

2. **Apply / Save / Revert as three verbs.** With a live instance an edit has already changed the
   running program, so "save" means persist, not apply. The clean arrangement needs no core
   change: the editor edits a SECOND instance on the SAME runtime (same layers, different id),
   so it sees the same live global values, and Apply pushes its snapshot into the live one.
   The editor gains a `dirty` observable and a way to mark the current state saved. The
   playground keeps autosave by ignoring both.
   - **Dirty is a CONTENT comparison against the last saved document, never a history position.**
     Undo one edit, type another, and the undo depth matches again while the content differs.
   - Saving must NOT clear the undo stack: undo walks back past a save point.
   - Undo stays per-edit and text-only. An input value dirties the document without entering the
     stack; adding or removing a port gets its own affordance (a revert toast now, version
     history later) rather than a second competing stack.
3. **Version history.** Almost entirely host work: a snapshot is already a self-contained memento
   (program + its ports + input values) and restoring one is `setProgram`. What it needs is a
   store, an identity and a timestamp, which the architecture already assigns to the host's
   envelope. **Decide the envelope's `revision` field NOW rather than later** - two people editing
   one program is a conflict a client cannot detect without one, and retrofitting a revision into
   stored documents is unpleasant.
4. ~~The transport~~ — done, see above. What it still lacks is the "feel local" list above; one
   rule from it stands as a decision for step 2: **block Apply while disconnected; allow editing
   and saving.** Queuing edits and firing them thirty seconds later is dangerous during a show,
   which is also why the WebSocket adapter drops a send while the socket is not open.

**Driving need:** Beacon. Core runs the lights whether or not anyone has an editor open; the editor
is a peripheral that attaches to a running program, edits a draft of it, and applies.

---

## Value validation at the boundary (and enums)

**What:** Nothing in core ever checks that a value a host pushes matches the type it was
declared with. `updateInput("user", "oops")` succeeds, and the program fails later at a field
access, or quietly computes nonsense. `TypeDefinition.schema` is the slot for the check and
nothing calls it.

**Why deferred:** it needs a decision about enums first (below), and the ports work had to settle
what a type even is before the check could be designed once for both levels.

**What it requires:**
- One place that validates when a value arrives — `instance.setInput`, `runtime.updateInputs`,
  and the entry's seeding. Cost matters: a live show pushes values at frame rate, so decide
  whether validation is always on, opt-in per layer, or development-only.
- **Walk the `extends` chain and apply every ancestor's schema, not just the most derived one.**
  Static compatibility already walks that chain to let a `Derived` flow where a `Base` is
  expected; validation has to honour the same claim. It also means a host writing
  `Grade extends Score extends number` never repeats the parent's rules.
- A failure needs a channel. A new `ProgramDiagnostic` stage is the natural home, since the
  panes already render those and a bad value is not an `EvalError`.
- **Enums want a serialisable form, not a schema.** A list of allowed values on the type
  travels inside a document, drives a dropdown in the Inputs pane, and generates its own check.
  That is the one thing zod cannot do: converting a schema to JSON keeps enums and bounds but
  drops a `.refine` predicate *silently* (verified against zod 4.4.3), so an "even number" saved
  and reloaded would accept odd ones. Hence the split settled 2026-09-07: a type may
  carry a zod schema wherever its declaration is CODE (the language, or a capability layer the
  host rebuilds each boot). The exception is the layer an instance persists, which is saved as
  JSON; a type there carries shape only and inherits validation through `extends`.

**Driving need:** a host pushing a struct that does not match its declaration is currently
invisible until something downstream misbehaves.

---

## Ports refactor — the small things it left

Two knowing trades, kept deliberately. (The other four items in this entry were swept on
2026-09-07: the input node stopped carrying a type it could not know, `schema` became optional
so a type definition is the same shape wherever it is declared, a program id colliding with a
global layer id now says so, and the three CRLF documents were normalised to LF.)

**`setLayer` composes twice.** Once to decide whether the change is blocked, once inside the
recompile that follows. Compose is cheap and layer edits are not per-keystroke, so this trades a
little work for a simpler control flow. Revisit only if a profile says so.

**`watch` has no caller.** It arrived when the editor was extracted from the playground, for a
vanilla pane module that never existed. Kept because it is exactly what a framework-free host
needs, but it is untested by use.

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

## Playground — user-settable inputs and outputs — DONE

**Delivered 2026-09-07** as [editor-plan.md](editor-plan.md) Phase 3, on layers rather than the
`SurfaceSpec` sketched below: the document's own `Policy.user` layer is what the panes edit, the
gate is that layer's `editable` rather than a `surface.userInputs` flag, and `composeLayers` — not
the editor — judges every change. Declarations travel in share URLs as predicted, through
`SavedProgram.ports`. What is still missing is listed under "the declaration fields the port panes
do not expose". The original requirements are kept below for the record.

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
- **Enumerated types (a named set of allowed values).** A port layer can declare a struct or a
  newtype, but there is no way to say "one of these three strings", which is the natural source of a
  dropdown in the Inputs pane and the most likely thing a user will reach for after structs. Two
  routes: a string-literal union, which falls out of the union work above and needs a literal arm in
  the `Type` union; or a `values?: readonly unknown[]` field on `TypeDefinition`, checked by the
  analyser against literals and used by the editor to pick a select control. The second is far
  smaller and covers the UI need, but it is a second, weaker notion of a type — settle that fork
  before building either. Ties to the union entry above and to the struct-widget entry.

### Doc fixes

- _(Done)_ The `.docs/` set (CLAUDE.md, architecture.md, analyser-spec.md, decisions.md,
  ops-reference.md) and `packages/core/src/readme.md` were brought current with the structured-`Type`, first-class
  function, parser/grammar-split, and `createStdlib`/`parseSource` reality.