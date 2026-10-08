# Dendrite — Todo

The near future: what is being worked on now, and what comes straight after. Anything for
some later point in time is in `backlog.md`; finished work, kept for its reasoning, is in
`done.md`.

---

## The 0.6.0 group

The stdlib release, grouped on 2026-10-05. The rows are in the order of the work. "Decided" is
the maintainer's word; "proposed" is still a suggestion.

| # | Item | Entry | Status |
| --- | --- | --- | --- |
| 1 | The stdlib per segment | `done.md` | **done** 2026-10-08 |
| 2 | A math batch, seven ops | below | decided |
| 3 | A mixed list literal refuses a function | `backlog.md` | proposed |
| 4 | `AnalysisContext` leaves the public surface | `backlog.md` | proposed |
| 5 | Strings as lists, with its own plan | below | decided |

After the release: the two symbols that want `?`, below.

---

## Stdlib — a math batch: `Round`, `Floor`, `Ceil`, `Clamp`, `Mod`, `Abs`, `Pow`

**When:** in 0.6.0, and next: the restructure it waited for is in (`done.md`, 2026-10-08). The
maintainer asked for `Clamp` on 2026-10-05 and then chose the full list. Moved from the
backlog's code-TODO roundup, where it was "more math ops". Its `TODO` is in
`stdlib/arithmetic.ts` and goes when the ops land.

**Why after the restructure:** it is the restructure's test. Seven ops in the `arithmetic`
category should be seven registrations in one file, their tests and a changelog line, and nothing
else by hand: the reference page and the index row are generated.

**Not in the batch:** `Min` and `Max`. Both exist, over a list: `Max([a, b])`. `Clamp` can be
written today as `Min([Max([value, low]), high])` (probed 2026-10-05: 15 into 0..10 gives 10).

**To decide in the plan,** one rule each:

- `Round(value, digits?)`: whether it takes `digits`, and the half rule. JS `Math.round` sends
  `-2.5` to `-2`.
- `Clamp(value, low, high)`: what `low > high` gives. The form above lets `high` win.
- `Mod(a, b)`: the sign for a negative `a` (JS `%` keeps the sign of `a`; a floored result is what
  cycling through a list wants), and `b = 0`, where `Divide` gives zero.
- `Pow(base, exponent)`: a result that is no number (a negative base with a fractional exponent).
- `null` in any input, by the rule the arithmetic ops have today.
- Symbols: none is asked for. `%` is the one to settle, because of the cost below.

**One cost:** the Host docs build `Mod`, and then `%` as its symbol, as their example of extending
the language (`host/extending-the-language.md`). With `Mod` in the stdlib that page needs another
op and another symbol.

---

## Language — strings as lists, in some places

**When:** in the release after 0.5.0, after the stdlib restructure (`done.md`, 2026-10-08) and
the math batch above, with its own plan (the maintainer, 2026-10-05). Before that: after the types plan (`types-and-text-plan.md`), the
user's instruction 2026-09-22. Moved from the backlog, where it was "strings and arrays,
interchangeable"; the wanted direction and the four open edges below are unchanged.

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

## After the 0.6.0 release — two symbols that want `?`: `??` and `c ? a : b`

**When:** the first item after 0.6.0 (the maintainer, 2026-10-05), as ONE plan for both. Asked
the same day, as "`||` as sugar on `Default`" and "an inline if, `condition ? true : false`".

**Why one plan:** three ideas want `?`: these two, and the optional lambda parameter
(`backlog.md`). The first one built fixes what the lexer does with `?`, `??` and `?:`, so the plan
settles all three spellings, even if it builds two.

**`??` for `Default`, not `||`** (probed 2026-10-05). `||` is taken: it is sugar over `Or`, `Or`
takes booleans, and `null || 5` is `op_input_type_mismatch` today. A symbol becomes its op while
the parser reads, before any type is known, so `||` cannot choose between `Or` and `Default` by
type. The other way is an `Or` that accepts `any` and decides at runtime, and then the reference
prints a signature that is not honest, which is what keeps `+` from text (`backlog.md`). `Default`
tests for `null`, not for false, and that is what other languages spell `??`.
`registerInfix("??", …)` is plain sugar, as `++` is over `Join`, and a registered symbol reaches
the lexer through `grammar.symbols`. **To decide:** its tier in the ladder (`precedence.ts` has
room below `OR`).

**`condition ? a : b` for `If`.** Sugar over `If(condition, a, b)`, so it inherits what `If` does:

- **Both branches are evaluated** ("`If` evaluates both branches", `backlog.md`). A reader of `?:`
  expects the opposite more than a reader of `If(…)` does. Decide whether the symbol waits for a
  lazy `If`, or ships with the fact said in the docs.
- **Its type** is the branches' type when they agree, and `any` when they differ (`If`'s
  `inferOutput`).
- **The registration has no route today.** `registerInfix` builds a symbol with two operands. A
  conditional needs a led that reads two more, and `registerLed` does not add its key to
  `grammar.symbols`, so the lexer still answers `unknown_character` for `?` (probed). It should
  not go in the core grammar either, which names no stdlib op. The smallest fix is a way to
  register a symbol with a hand-written led.
- **To decide:** its tier (between `ARROW` and `OR`), whether `a ? b : c ? d : e` chains, and
  that a `:` inside the first branch still reads (a lambda's annotation,
  `c ? (x: number) => x : y`).

**No consumer but the wish:** `If` and `Default` work. Estimate: a plan, then about three commits
(one per symbol, one for the docs).

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
