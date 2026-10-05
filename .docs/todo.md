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

## After the 0.5.0 release

0.5.0 took the first three of the four items listed here after 0.4.0: boundary validation,
`++`, and a converting lambda parameter (`done.md`). One is left, and it has a timeframe, which
is why it is here and not in the backlog.

**An optional lambda parameter, `(sep?: string) => …`.** Raised beside the converting one
(2026-09-21). The maintainer's decision 2026-10-02: after the 0.5.0 release, with its
decisions deferred until then. It has no consumer yet, only symmetry with `required: false` on
an op input, so "move it to the backlog" is still an answer when it comes up.

- **Why it is bigger than the converting parameter (measured 2026-10-02):** that one needed
  no change to `Type`. This one does: a caller often knows a function only by its type, and
  the call check counts the parameters in that type, so "may be left out" has to live in the
  function type. About eight places read a function type's parameter list (`isCompatible`,
  `typesEqual`, `typeToString`, the call check, contextual typing, the docs' printer). `?` is
  no token today, so it also needs the lexer, the parameter list and the type annotation
  `(string, number?) -> string`. Estimate: a plan, then three commits.
- **Four decisions, not taken:** (1) does `(a, b?) -> r` fit where `(a) -> r` is expected,
  which changes function subtyping; (2) must an optional parameter come last; (3) what the
  body reads for an absent argument, `null` or a written default; (4) whether `(t~?: string)`
  is refused, as an op input refuses `convert` with optional.

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
