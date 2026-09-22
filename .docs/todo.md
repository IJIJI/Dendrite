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

## Language — types and text: the plan for 0.4.0

**The plan is `types-and-text-plan.md`**, approved 2026-09-22 after four review passes and two
independent reviews. Six features in ten milestones, about 21 commits: `null` that does not throw,
a binding annotation with a check of every type name, `valueFits`, the safe cast `as`, the
`convert` flag with a `Convert` namespace, and templates. Then two renames and the 0.4.0 release.
The reasoning behind the cast decisions is the entry below, kept as it was written; what the plan
decided AFTER it was written:

- **A list op reads every value that is not a list as `[]`**, not only `null`
  (`Array.isArray`). The entry below says "`null`"; the user widened it (2026-09-22) so no list op
  throws, and `Join` already had that guard. The cost: `Length("abc")` through `any` was 3 by
  accident and becomes 0, which is why "strings as lists" is a todo below.
- **A field read on `null` gives `null`** (N.2). `Find(...).name` with no match threw in a
  well-typed program, and `If` cannot guard it (backlog).
- **A type name in a program must exist.** `(n: nubmer) => n` compiled. `unknown_type` becomes
  the program error, as the pair of `unknown_op`; the port problem is renamed `unknown_port_type`.
- **The `convert` flag stays**, on `Join` only, as the foundation for a converting lambda
  parameter. `Join` alone would be served by `any[]`; the user chose the foundation on purpose.
- **A template is `` `n = {count}` ``**: backticks, holes in `{…}` (`${…}` reads as an input),
  and it desugars to a plain `Join([...])`, which converts, so a hole needs no `ToString` and
  the analyser inserts no node. The template entry from the backlog is folded in here.
- **Cut:** a return type on a lambda (backlog), and `[]` as the failed cast of a list (never).

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

## Release after 0.4.0 — in this order

Kept here, not in the backlog, because each has a timeframe: the release after the types plan.

1. **Boundary validation** (the entry below, moved from the backlog 2026-09-22): it reuses
   `valueFits` from the plan. **Open question for it:** does a missing struct field fit? The cast
   says no (V.1), and a read of a missing field throws (N.2). To relax both later is not a
   breaking change; to tighten them would be.
2. **`++`**, plain sugar over `Join` (the entry below, moved from the backlog). Deferred out of
   the plan 2026-09-21: once `Join` converts its parts, `"n = " ++ 1` needs no decision, so the
   operator is a few lines with nothing left to discuss.
3. **A converting lambda parameter, `(t~: string) => …`**: the `convert` flag's second consumer,
   and the reason it was kept. The mark `~` on a parameter means what it means on an op input.
   Needs the flag on `LambdaParam` and the same evaluator step at application.
4. **An optional lambda parameter.** Raised beside the converting one (2026-09-21). Decide after
   0.4.0 whether it stays here or moves to the backlog: it has no consumer yet, only symmetry
   with `required: false` on an op input.

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

- **The other boundary: a value that crosses an `any`.** An `implicit_any_cast` is a warning,
  and nothing checks the value at runtime either: with `$whatever: any` holding 5,
  `Length($whatever)` is `5.length`, so an output declared `number` holds `undefined` and no
  error is raised (found 2026-09-19; *Types in practice* now says so). A check where an `any`
  meets a concrete input, with a runtime error as the channel, would close it; it is the same
  cost question as above, per op call rather than per pushed value.

**Shared machinery (2026-09-21):** the safe cast in `todo.md` (`$rows as number[]`) needs the same
thing this does, a runtime test of a value against a `Type`. It is built there first, as one
`valueFits(value, type, descriptor)`, and this entry REUSES it rather than writing a second.

**Driving need:** a host pushing a struct that does not match its declaration is currently
invisible until something downstream misbehaves.

---

## Language — `++`, sugar over `Join`

**What:** `"Hello, " ++ name`. Text is built with `Join` today, and
`Join(["Bus ", ToString(n), " is live"])` is correct and clumsy.

**When:** the release after 0.4.0 (the list above). Moved from the backlog 2026-09-22, where it
was "an operator for joining strings (`+` or `++`)"; the `+` half stays there.

**Decided 2026-09-21:** `++`, and it waits for one thing only. The entry used to wait on the
implicit-casting question, because `"n = " ++ 1` either stringifies the number or is refused.
That question is closed (`done.md`): `Join` converts its parts through the `convert` flag
(`types-and-text-plan.md`, milestone K), so a `Join` built from `++` converts the same way, with
nothing wrapped and no node inserted. What is left is a few lines: `registerInfix("++", BP.ADD, …)`
building `Join` over a two-item list. The lexer already sorts operators longest-first, so `++`
beats `+` the way `>=` beats `>`. It is not in the plan because the plan is large enough, and the
operator adds nothing a template does not already say.

---

## Language — strings as lists, in some places

**When:** after the types plan (`types-and-text-plan.md`), the user's instruction 2026-09-22.
Moved from the backlog, where it was "strings and arrays, interchangeable"; the wanted direction
and the four open edges below are unchanged.

**What milestone N.1 of the plan does to it:** `Length("abc")` and `Includes("abc", "a")` WORKED
through `any`, by accident (`"abc".length`, `"abc".includes`). N.1 makes every list op read a
value that is not a list as `[]`, so both give the empty-list answer instead. The accident ends
and this entry is where the deliberate version is decided: `Includes("abc", "a")` is the first
case to settle, and the `Includes`-versus-`Contains` edge below already says why it is not
obvious.


**Why this exists:** until 2026-09-20 a Dendrite program could not build a string at all:
`Concat` is arrays only and `Add` is numbers only. `Join` closed that gap (see `done.md`). What is
recorded here is what the user wants beyond it: text and lists working as one thing.

**The compatibility wanted** (the user, 2026-09-20): strings and arrays work interchangeably,
**with nothing to declare**: no union written in a signature, no `sequence` supertype. A string
is handled as an array of one-letter strings. As a rule, that is one line in `isCompatible`
(`infra/registry.ts`, the single extension point for subtyping):

> a `string` is compatible with `T[]` when a `string` is compatible with `T`

So `string` fits `string[]`, and through array covariance `any[]`. The runtime value stays a real
string, and a string still prints as `string`: no `char[]` anywhere. It is one direction only: an
array of strings is not a string. What it buys with no new op: `Length`, `Includes`, `Filter`,
`Map`, `Reduce`, `Find`, `Some` and `Every` over text, and string building from the `Concat` that
already exists, whose `inferOutput` can say "every input was a string, so is the result" while
its evaluator joins instead of collecting.

**DISCUSS FURTHER before building.** This is the wanted direction, not a settled design. Four
edges are open, and each changes what a program means:

- **`Includes("abc", "bc")`.** As an array, a string contains *elements*, so this is `false` and
  only `"b"` is `true`. Surprising enough that substrings want their own op, which is why the
  string ops use the name `Contains` and leave `Includes` to arrays.
- **What `Map` gives back.** `Map("abc", Upper)` is an array of one-letter strings, not `"ABC"`,
  unless the op joins. `inferOutput` can decide per op, but every op has to be decided.
- **Where the string becomes an array.** A host that declared an input `any[]` and receives a
  string holds a JS string, not an array. Either every array evaluator handles both, or the
  evaluator coerces with `[...s]` in ONE place, when a declared array input receives a string.
  The second keeps every existing op untouched, and is the leaning.
- **Unicode.** Iterate by code point (`[...s]`), never by UTF-16 unit, or `"é"` and every emoji
  split in half. Grapheme clusters are a third step and want `Intl.Segmenter`.

One cost to say out loud: it makes `string` quietly polymorphic. A program can pass text where a
list is expected and never be told, which is the opposite of the explicitness the language chose
for `any`. That is the price of "nothing to declare", and it is why this sits beside the
implicit-casting question above.

**Ruled out: a string REPRESENTED as an array of chars.** Every string type would print as
`char[]` (arrays are structural), `char` would be a primitive with no literal to write it, the
host boundary would hold one thing while claiming another, and "char" invites the Unicode mistake
above.

**The alternatives, all costlier**, kept for the discussion:

| Route | How `Length` accepts both | Cost |
| --- | --- | --- |
| Union types | `Length(value: string \| any[])` | The general answer and the biggest: a `union` kind, `isCompatible` distribution, `typeToString`, inference |
| A `sequence` supertype | `Length(value: sequence)` | One `isCompatible` rule plus `inferOutput` per op, but a new concept to declare, which is what the user does not want |
| `char extends string` | `Split(s) -> char[]`, `Join(char[]) -> string` | Array ops over text only where asked for; the length-1 invariant needs boundary validation |
| Two op families | `Length` and `TextLength` | No type work, and a reference that reads twice as long |

**Driving need:** Beacon: a tally label is text built from values.

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
