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

- **`serialise.ts`** — `SavedProgram` type and `RawProgram ↔ SavedProgram` conversion. Maps → plain objects, strip `source?: SourceRef` (session-scoped, never persisted). Needed before any database persistence.
- **`environment.ts`** — unified wrapper holding the `descriptor` (and, later, a shared prelude — see below), exposing `analyse`, `load` (deserialise+analyse), `run`, `createRunner`, `runtime`, and a convenience `register(id, saved)`. Build after the analyser is working, since it wraps the analyser.
- **Parser (DONE)** — `source → RawProgram` via `parseSource` (lex + parse) with `SourceRef { kind: 'code', … }`. A full `compile` (parse + analyse) belongs on the future `environment.ts`.
- **Rete adapter** — `rete graph ↔ RawProgram` with `SourceRef { kind: 'rete', nodeId }`. Lives in `@dendrite-lang/editor`.

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
  ops-reference.md) and `src/readme.md` were brought current with the structured-`Type`, first-class
  function, parser/grammar-split, and `createStdlib`/`parseSource` reality.