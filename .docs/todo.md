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

Two helpers sat at module level in `stdlib/index.ts`; on 2026-09-23 they became `Convert` in
`infra/convert.ts` (it started in `stdlib/`, and moved when the evaluator needed it), and `toList` (a value as a list, the
list ops' guard) still sits at module level and belongs with the list category. Four EMPTY files
already sit in `stdlib/` (`collections.ts`, `logic.ts`, `math.ts`, `types.ts`), scaffolding from
before the split was deferred: fill them or delete them here, not before.

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
