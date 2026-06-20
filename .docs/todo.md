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

## Static field typing for FieldAccessNode

**What:** Validate at analysis time that a field accessed via `FieldAccessNode` actually exists on the struct type, and infer the field's type from the struct type rather than trusting the node's declared `type`.

**Why deferred:** Requires field→type metadata on `TypeDefinition` that does not exist yet. Extracting it from the Zod schema is fragile (Zod-version-dependent). The explicit alternative is cheap per-type but is work across every struct type. No present need — current behaviour (trust declared type, warn on primitive struct, defer field existence to runtime) is adequate.

**Theoretical basis:** CPL tuple projection — `e[n]` requires `n` to be a static integer literal precisely so the checker can return the n-th element's type statically. Field access is the named equivalent: with a known struct type and known field, the field's type is statically determined.

**What it requires:**
- Add to `TypeDefinition` in `registry.ts`:
  ```typescript
  fields?: Record<string, string>   // field name → type name
  ```
- `registerType` config object gains `fields`. Example:
  ```typescript
  lang.registerType('Source', SourceSchema, {
    fields: { id: 'string', name: 'string' }
  })
  lang.registerType('SourceBus', SourceBusSchema, {
    fields: { me: 'string', program: 'Source', preview: 'Source' }
  })
  ```
- `extendLanguage` must copy `fields` alongside `default` and `extends`.
- Analyser `'field'` case becomes:
  - Resolve struct type via `getOutputType(struct)`.
  - If that type has a `fields` map:
    - Field present → infer field type from the map; set `CFieldAccessNode.type` to it.
    - Field absent → **error**, poison the binding (`unknown_field` — new AnalysisErrorKind). This is sound: accessing a non-existent field is a type error.
  - If the type has no `fields` map → current fallback behaviour (trust declared type, warn on primitive).
- Redundancy note: `fields` duplicates information already in the Zod schema. Accepted tradeoff — explicit is debuggable and version-stable. Do not attempt Zod introspection.

**Driving need:** would catch field-name typos (`source.naem`) at analysis time and make `FieldAccessNode` fully sound. Worth doing once struct-heavy programs appear.

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

## Other planned files (not yet implemented)

These are architecturally specified but unbuilt. Listed here for completeness; see architecture.md and CLAUDE.md for design.

- **`serialise.ts`** — `SavedProgram` type and `RawProgram ↔ SavedProgram` conversion. Maps → plain objects, strip `source?: SourceRef` (session-scoped, never persisted). Needed before any database persistence.
- **`environment.ts`** — unified wrapper holding `descriptor` + `hostContext`, exposing `analyse`, `load` (deserialise+analyse), `run`, `createRunner`, `runtime`, and a convenience `register(id, saved)`. Build after the analyser is working, since it wraps the analyser.
- **Parser** — `source string → RawProgram` with `SourceRef { kind: 'code', ... }`. Enables `parse` and `compile` (parse+analyse) on environment.
- **Rete adapter** — `rete graph ↔ RawProgram` with `SourceRef { kind: 'rete', nodeId }`. Lives in `@dendrite-lang/editor`.

---

## Parser & Lexer — build worklist

Active near-term work for `parser/lexer.ts` + `parser/parser.ts`. Lexer (slice 0) and the
expression core (slice 1) are done and green; the rest is sequenced below.

### Decided changes to apply

- **`parseDelimited` → `Parser` method.** It is reusable list-parsing machinery (arrays now,
  call-args and arrow-params later), so it belongs with `peek/advance/expect/parseExpr`, not as a
  free function.
- **Input syntax = sigil `$name`.** Lexer: tokenise `$`. Parser: a `$` nud → `InputNode` (type
  from `descriptor.inputs`; unknown name still emits the node and lets the analyser's existing
  `unknown_program_input` fire). Side effect: the `ident` nud becomes trivial — a bare identifier
  is now ALWAYS a `RefNode`, and the input-vs-ref collision problem disappears.
- **Recovery = error-count delta (recommended) — OR throw-to-boundary (open).** Keep the
  `placeholder` as inert sub-expression filler; the statement loop snapshots `errors.length`,
  parses, and drops the binding if the count grew — mirroring `analyse()`
  (analyser.ts:471). Throw-to-boundary is the alternative if statement-only granularity + no
  placeholder is preferred over consistency + sub-expression recovery. **Confirm before slice 2.**
- **Name the inline nud/led handlers** (`nudIdent`, `ledField`, …) once slice 3 adds bulk, for
  greppability (avoids the analyser's Long-Function / Switch-Statement smell).

### Slice roadmap

- **Slice 2 — statements + program.** `let`/`output` statement layer → `parseProgram` →
  `RawProgram`; `duplicate_binding` detection; `sync()` to the next `let`/`output` on error; drop
  poisoned bindings (no terminator — keyword anchors). First end-to-end lex→parse→analyse run.
- **Slice 3a — calls (DONE).** Call-led → `OperationNode`; positional-then-named args (variadic
  input soaks remaining positionals); descriptor-driven arg→input mapping. Callee must be a ref to
  a registered op (generalized-callee seam kept for lambdas). Higher-order ops error for now.
- **Slice 3b — arrows + higher-order (next).** Body syntax decided: **arrow** `item => …`
  (`(acc, item) => …` for Reduce). Requires adding `=>` as **core lexer syntax** (it's lambda
  syntax, not a stdlib operator — a minimal core multi-char set, always recognized). Inline arrow
  in a higher-order call → `HigherOrderNode` (arrow params → `bindings`, body → `body`). The arrow
  is parsed by ONE shared routine so it generalizes to first-class lambdas later.
- **Lambda reuse (future, with the lambda work).** Same `=>` syntax for standalone lambdas
  (`let pred = item => …`), and allow passing a lambda *ref* into a higher-order op when its
  param count matches the op's `bodyBindings`. Needs `LambdaNode` (the option-B error-node /
  minimal-AST reversal) + analyser param-count checking. The shared arrow routine + generalized
  call-led are the hooks.
- **Slice 4 — grammar registration API.** `registerNud`/`registerLed` + `prefix`/`infixLeft`/
  `infixRight` + `registerStatement` on `Language`; operators desugar to ops; **move core grammar
  into the descriptor** so lexer + parser + core are single-sourced (the can't-desync fix, done
  incrementally here rather than early). `infixRight` passes `bp - 1` (right-associativity —
  needed for lambda currying `a => b => c` and `**`).

### Review findings (simplify / expandability)

- **Compound-node source spans.** Array / grouping / field-access nodes currently take a single
  token's `source`, not the full start→end span. Compute the real span for correct editor
  highlighting. (Quality; affects tooling, not correctness.)
- **Literal nuds are near-duplicate.** `number/string/boolean/null` differ only by a value
  conversion; an optional `literalNud(convert)` factory removes the repetition. (Minor DRY.)
- **Formalize binding-power tiers.** Document the `BP` levels before operators land in slice 4 so
  stdlib operators slot in consistently.
- **Core-grammar consistency test.** Until slice 4 single-sources it, add a cheap test that every
  structural punct the lexer can emit has a parser handler (and vice versa), catching drift.
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
- **Lambda param-type inference from body usage.** Hindley-Milner-style constraint solving to
  deduce a param's type from how it's used (e.g. `x` flows into `Add` ⇒ `x: number`). Deferred —
  explicit optional annotations cover the strong-typing need for now; default to `any` otherwise.
- **Multi-field lambda return.** "Several named outputs from a lambda" = returning a **struct**
  (`return { a: …, b: … }`). Needs struct literals + struct types (see *Static field typing for
  FieldAccessNode*). Until then, a lambda returns one value. Keep `return` (lambda, single value)
  and `output` (program, multiple) as distinct constructs — do not overload.

### Doc fixes

- **Stale syntax in docs.** CLAUDE.md and analyser-spec use `Set name = …` (now `let`) and the
  CLAUDE.md file-structure block predates the `infra/` / `parser/` split. Refresh once syntax is
  settled.