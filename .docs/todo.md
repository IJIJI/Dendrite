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