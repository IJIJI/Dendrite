# Dendrite — Todo

The near future: what is being worked on now, and what comes straight after. Anything for
some later point in time is in `backlog.md`; finished work, kept for its reasoning, is in
`done.md`.

---

## Core — the stdlib, configurable per category, maybe per op

**When:** straight after the conversion and string ops (the plan of 2026-09-20). Moved here from
the backlog, where it was "the stdlib in segments a host can pick", and widened.

**What changed since it was written:** it now owns a smell as well as a feature. `createStdlib()`
(`packages/core/src/language/stdlib/index.ts`) is one 600-line function in three bands: every
`registerOp` by category, every `registerEvaluator` far below, then the symbols. It is a **Long
Method**, and adding an op is two edits a screen apart. The conversion and string ops were added
in that same style ON PURPOSE (2026-09-20), so this restructure meets one shape, not two.

**Widened to:** a host picks categories, and **possibly single ops** ("maybe even per method",
the user). Decide whether per-op selection has a named consumer before building it: per category
has one (Beacon choosing its vocabulary), per op does not yet.

**What adding two categories taught it (2026-09-20):** a new category is **Shotgun Surgery**,
six edits in five files: an op block in `createStdlib`, an evaluator block a screen below it, a
`describe` in `evaluator.test.ts`, a docs page (three lines, generated from the descriptor), a
**hand-written row** in `apps/docs/src/content/docs/stdlib/index.md`, and a changelog line. The
row is the avoidable one: that table could be generated from the descriptor the way the pages
are, and then a category is complete the moment its ops are registered. Do that here.

Two helpers now sit at module level in `stdlib/index.ts` and belong to their categories when the
file splits: `DECIMAL` (what `ToNumber` accepts as text) and `toText` (a value as text, shared by
`ToString` and every string op, so they stay together or share a module).

**The original entry:**

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

## Language — binding annotations and a safe cast (`as`), together

**Decided 2026-09-21**, from the discussion the `implicit_any_cast` change set up: that change
made the language louder about `any` and left the author no way to answer back. Needs its own
plan before any code (two pieces of syntax, a node kind, a runtime validator).

**Two features, one piece of work, and they mean different things:**

| You write | It means | Runtime check | Warns when the source is `any`? |
| --- | --- | --- | --- |
| `let rows: number[] = $rows` | "I expect this to BE a `number[]`" | none | **yes**: the checker cannot verify the expectation |
| `let rows = $rows as number[]` | "MAKE it a `number[]`, or `null`" | yes | no: it is checked, so nothing is left to warn about |

- **`as` is a SAFE cast: it gives `null` when the value does not fit** (the user's choice). C#'s
  `as`, Kotlin's `as?`. `Default($rows as number[], [])` is the fallback. It is the answer already
  given for `ToNumber("abc")`, for the same reasons: never throw, `null` means "no value", and
  `Default` is the remedy the docs teach. Rejected: unchecked, as in TypeScript (the evaluator
  acts on a lie: `Length` of a number is `undefined`, which *Types in practice* admits), and
  checked-and-failing (one bad host value takes an output down, and it needs a new failure
  channel).
- **A failed cast is `null` for EVERY type, a list included**, not `[]` (the user asked,
  2026-09-21). `[]` would make "the host sent garbage" identical to "the host sent an empty
  list", with nothing downstream able to tell, which is the argument that made `ToNumber("abc")`
  `null` rather than `0`; and it would have to be per type (`as number` failing to `0`), the rule
  already turned down. Scala agrees read closely: `Nil` is a VALUE, the empty list, and absence
  is `None`; a failed match gives `None`.
- **But the list ops must stop throwing on `null`, in this same plan.** Measured 2026-09-21:
  `Length(null)`, `Average(null)`, `Includes(null, 1)` and `Filter(null, …)` all THROW a
  TypeError (wrapped as `host_error`), while `Join(null)` is `""` and an unset `number[]` input
  already seeds to `[]` (`runtime/seed.ts`). The throwing is an accident (`null.length`), not a
  decision: the house rule is "never throw, return a neutral value". So **a list op reads `null`
  as an empty list**, as a string op reads it as `""`. Then `Average($rows as number[])` over
  garbage is `0` rather than a crash, and `IsSet($rows as number[])` is still `false` for whoever
  wants to know. `Nil`'s ergonomics without the information loss. One shared guard, not six
  copies (the string ops' `toText` is the precedent).
- **The warning STAYS on an annotation.** The user asked whether it should, once a cast exists.
  An annotation is a static claim with no runtime check, so one that silenced the warning would
  be the unchecked cast arriving through the back door. Instead the annotation's warning points at
  its own fix (*use `as number[]` to check it*), so the author always has an answer. "Set a
  stricter type without a warning" is `let rows = $rows as number[]`, and it is sound.
- **Done together** (the user's call): they share the type parser (`parseType` in
  `core-grammar.ts`, which lambda parameters already use), the highlighter (`let x: number` is
  coloured today by the "after `:`" rule; only "after `as`" is new in `typePositions`), one Learn
  section, and the warning's wording.
- **The empty list needs neither**: `let none: number[] = []` is quiet, since an empty literal is
  recognised. That closes the ceiling the `implicit_any_cast` change named.

**What it requires:**
- **`valueFits(value, type, descriptor)`**, the runtime validator, and the real cost. Primitives
  by `typeof` (or the zod `schema` every registered type already carries and nothing calls),
  lists recursively, named struct types through their fields and their `extends` chain, `any`
  always. A FUNCTION type cannot be checked at runtime, so `as` to one is an analyser error.
  "Value validation at the boundary" (backlog) reuses it.
- **A new node kind**, not a desugaring: a type is not a value an op can receive, so `as` cannot
  become an op call. That touches `infra/nodes.ts`, the analyser, the evaluator, the `ast` saved
  form, and `AST_NODE_KINDS`.
- **`as` in the grammar.** It is an identifier token, like `let`; check how the Pratt kernel keys
  a led before assuming it can be one. It binds tighter than comparison, looser than a call.
- **`binding_type_mismatch`**, a new diagnostic, documented in the registry with an example.
- **Also in scope: a lambda's RETURN cannot be annotated in source.** Its parameters can
  (`(n: number) => …`), and the AST has `returnType`, but the parser has no syntax for it. Found
  2026-09-21 while reading the grammar.
- The editor's `typePositions`, docs (*Types in practice*, *The type system*), and the changelog.

**Then, in this order** (backlog): boundary validation on `valueFits`; and "do we want implicit
casting?" with "strings and arrays, interchangeable", which are easier to answer once a program
can state and check a type.

**The original annotation entry, moved here from the backlog:**


**What:** `let total: number = $price * $quantity`. A lambda parameter can carry a type today
(`(n: number) => n * 2`), a binding cannot: its type is always inferred. The docs met the gap
twice on 2026-09-18 - a lambda bound on its own has nothing to infer its parameter from, and
the only fix was to annotate the lambda, not the binding.

**Why deferred:** the analyser infers every binding's type already, so an annotation is a check
rather than a necessity. It earns its place as documentation a reader can trust, and as the
thing that stops an `any` spreading.

**What it requires:** the `let` statement in core-grammar.ts takes an optional `: Type` after
the name (the same type parser lambda parameters use); `RawProgram` keeps it beside the node;
the analyser checks the inferred type against it with `isCompatible` and reports a new
`binding_type_mismatch`, which the diagnostics registry then documents. A rete program would
carry it as node metadata.

**Driving need:** any program that reads an `any` input and wants to stop the `any` there. Since
2026-09-21 there is a concrete case with no other remedy: `let none = []` types as `any[]`, and
`Average(none)` now warns (the `implicit_any_cast` check sees inside a list). An empty LITERAL is
recognised and stays quiet, but a name bound to one reaches the check as its type alone.
`let none: number[] = []` is the fix. Weighed together with the casting discussion in `todo.md`.

---

## Docs — review the rest of the site after Learn

**What:** the user is reading the docs page by page and sending observations. Learn comes first
(its observations were the samples step, now in `done.md`); **then** How it works, Host
developers and the stdlib reference, the same way. The site-wide passes (the colouring, the
dashes, the chain) already landed with the samples step, so these pages start from them.

**When:** next, alongside the inline TypeScript colouring: the user reads, and the
observations collect here until there is a section's worth to plan.

---

## Docs — show what every fence produces (candidate, not decided)

**What:** run each ```den fence at build time in `remark-den.ts` and show what it produces
beneath it (its output values, or the diagnostic it raises), the way the ops reference and
*Every diagnostic* already do. Proposed 2026-09-17 as "the step to add more editors"; left out
of the samples step because it was never decided.

**Open question:** do it, or send it to the backlog. Deferred until the site review is done
(2026-09-20): the observations on How it works, Host and the stdlib reference will show whether
the static fences there want their values, and the pages that most needed it (the ops reference,
*Every diagnostic*, the Learn samples) already show theirs.
