# Dendrite — Todo

The near future: what is being worked on now, and what comes straight after. Anything for
some later point in time is in `backlog.md`; finished work, kept for its reasoning, is in
`done.md`.

---

## The order after 0.6.1

`@dendrite-lang/editor` 0.6.1 is on npm since 2026-10-10 (`done.md`, "Editor 0.6.1 on npm");
core and link are at 0.6.0. What follows is the order the maintainer gave on 2026-10-08, as
changed on 2026-10-10. "Possibly" is the maintainer's word.

| Release | Holds | Entry |
| --- | --- | --- |
| 0.7.0, next | `??` and `c ? a : b`, a lazy `If` decided with them, `AnalysisContext` out of the public surface. A minor for all three packages, because removing an export breaks | below |
| Soon after | **The visual (Rete) half starts, with a plan.** The maintainer, 2026-10-10: "it will become harder to implement the more we wait" | `backlog.md`, "Editor — the visual (Rete) half" |
| After 0.7 | Union types, `A \| B` (the maintainer, 2026-10-10; it was "0.7, possibly") | `backlog.md`, "Language — union types" |
| Later, possibly | Strings as lists, with `Split`, `Slice` and `Replace` | `backlog.md`, "Language — strings as lists" |

Beside that order, with no release named for them: the three entries after the next one. Two
came from the maintainer while 0.6.1 was built (*How a program runs* gets simpler; two styles
for setting an input), and the third is where a reading of the site collects. The last section
of this file is what must be done before a 1.0.0.

---

## After 0.6.1 — two symbols that want `?`: `??` and `c ? a : b`

**When:** after 0.6.1, as ONE plan for both. The maintainer placed it first after 0.6.0 on
2026-10-05, and named 0.6.1 for the editor on 2026-10-08, which comes before it by its number.
Asked on 2026-10-05, as "`||` as sugar on `Default`" and "an inline if, `condition ? true : false`".

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

## Core — two styles for setting an input: the runtime's and an instance's

**What:** asked by the maintainer on 2026-10-09, while the *Embedding core* sample was planned:
look at the difference in style between setting a global input and setting a program input.
The page shows the two side by side:

```ts
runtime.updateInputs({ temperature: 30 }); // your state, every program
instance.setInput("limit", 35);            // this program's own input
```

**How they differ today** (`runtime/runtime.ts`, `runtime/instance.ts`):

| | A global input | A program-level input |
| --- | --- | --- |
| Call | `runtime.updateInputs(changes)` | `instance.setInput(name, value)` |
| Shape | One record of several names | One name and one value a call |
| Returns | The outputs, per program | Nothing: it reports through the observables |
| A value that does not fit | Throws, and the batch changes nothing | Is refused: `value_does_not_fit` on `diagnostics` |
| The other kind's name | Not probed | Throws |

A runtime's program handle has a third: `setInput(name, value)`, which returns the outputs.
*Embedding core* gives the reason for two of the rows: a command of an instance returns nothing
and cannot throw for a value because a pane, or a client across a network, calls it.

**When:** not placed by the maintainer.

**What it requires:** first the question itself, which is not decided: whether the difference
is wanted, or whether an instance wants a batch (`setInputs`), or the two want one verb. Then a
plan: a change here is core's public API, the link's protocol carries `setInput` as a command,
and the docs name both calls on several pages.

---

## Docs — *How a program runs* gets simpler, and the complexity stays on *The chain*

**What:** asked by the maintainer on 2026-10-09: simplify the Learn page *How a program runs*,
and keep the complexity on *The chain* (How it works).

**The two pages today.** Both draw `<Chain>` and both walk the same steps:

| | *How a program runs* (Learn) | *The chain* (How it works) |
| --- | --- | --- |
| File | `learn/how-a-program-runs.mdx` | `how-it-works/the-chain.mdx` |
| Size | 100 lines, 850 words | 210 lines, 1409 words |
| Sections | Lex, Parse, Compose, Analyse, Evaluate, "What each step may not do", "That is Learn" | Lex, Parse, Desugar, Compose, Analyse, Prune, Evaluate, "Why it is separate artefacts and not one pass" |

So the Learn page is 60 % of the reference page's length and has the same outline: a reader
of Learn meets the chain twice.

**When:** in the docs pass of 0.6.1 or straight after it; not placed by the maintainer.

**What it requires:** a plan first, with the maintainer, because it is a page's content and
not a fix. The questions for it: what a Learn reader needs from the page (a first reading, not
decided: one picture and a few sentences a step, each step linking to its section of *The
chain*); whether "What each step may not do" moves to *The chain*; and which other pages link
to this page's anchors (`content.test.ts` checks every internal link).

---

## Docs — review the rest of the site after Learn

**What:** the user is reading the docs page by page and sending observations. Learn comes first
(its observations were the samples step, now in `done.md`); **then** How it works, Host
developers and the stdlib reference, the same way. The site-wide passes (the colouring, the
dashes, the chain) already landed with the samples step, so these pages start from them.

**When:** next, alongside the inline TypeScript colouring: the user reads, and the
observations collect here until there is a section's worth to plan.

---

## Before 1.0.0 — what has no release named yet

Asked for by the maintainer on 2026-10-10: the todos that have no clear time, and that must
be done before a 1.0.0. The repo has no written definition of 1.0, so one rule sorts them:
**after 1.0.0, a change that breaks a program, a host's code or a saved file needs a 2.0.0.**
What only ADDS can come after. The list is being talked through; each row says where it stands.

**Agreed, the maintainer, 2026-10-10:**

| What | Why before 1.0.0 | Where it is written |
| --- | --- | --- |
| **A review of the stdlib's names** | A rename or a move is a break, as the comparison ops' move to `logic` was in 0.6.0 | Here. With it: `Flatten`, which cannot type its output (`backlog.md`) |
| **The functions the stdlib still lacks** | Asked for with the review. Each one only adds, so it is here for completeness of a 1.0, not for the rule | `backlog.md`: "the rest of the string ops", "`Clamp` with one bound", "what the math batch left out" |
| **Strings as lists** ("probably should") | `Contains` and `Includes` would become one op, which removes a name | `backlog.md`, "Language — strings as lists" |
| **A struct type may not reach itself through a function field** | Refusing it later refuses a type a host declared. `Tree { children: Tree[] }` stays legal | `backlog.md`, "Core — a struct type that names itself" |
| **`instance.setProgram` checks its ports** | 1.0 promises that a command reports and never throws. Ports that are no ports throw a raw `TypeError` today and leave the instance broken | `backlog.md`, "Core — `instance.setProgram` trusts a saved program's ports" |
| **One style for setting an input** | The shape of `updateInputs` and `setInput`, and the link's protocol | Above, "Core — two styles for setting an input" |
| **What is public, in the editor and in core's extension API** | Hosts use the editor's CSS variables and classes already. In core: say that `language.grammar`'s maps are internal, and that the keys of `registerNud` and the three booleans of `OpInput` are the API as they are. Then the `Grammar` refactors of the backlog can come after 1.0.0, and the one that renames the keys is dropped. To be explained in detail when it is taken | `backlog.md`: "documenting the configs", "drill down on `LayoutConfig`", "Parser — `Grammar` is a data bag" |
| **Beacon uses the API first** | The rule of `editor-plan.md`: publish after the first real consumer | `backlog.md`: "Subtyping — Beacon-side representation", "Op-declared context-input dependencies" |
| **The visual (Rete) half of the editor** | The project's stated target; a gate by decision, not by the rule. It starts soon after 0.7.0 (the order at the top) | `backlog.md`, "Editor — the visual (Rete) half" |

**These have a release, so they are not rows here:** 0.7.0 holds `??`, `c ? a : b`, a lazy
`If` decided with them, and `AnalysisContext` leaving the public surface.

**Structs: what waits until after 1.0.0** (each only adds): struct literals (`{ a: 1 }`; the
brace counting they bring to a template hole touches only programs that are errors today),
struct types declared in a program and `extends` there, how a literal fits a named type while
named types stay nominal, a type's own text form (`toText`, opt-in), and the field-wise widget
for struct inputs. Two small things are decisions and not work: a struct prints as its JSON
(say that this is the form), and a field read on a value that is no struct (below).

**Still being talked through** (each with the question that is open, and what was probed on
2026-10-10):

| What | The open question |
| --- | --- |
| **What a union may break, and the promise** | Proposed by the maintainer: an inferred union may refuse a program after 1.0.0, because that program warns today. Probed: each case tried that an inferred union would refuse has `implicit_any_cast` now (`If($c, 1, "a") + 1`, `Upper(If(…))`, `Average([1, "a"])`, the same `If` in an output a host declared `number`), and each clean one stays legal (`Length([1, "a"])`, `Equals(If(…), 1)`, a plain `output o = If(…)`). It holds if the promise SAYS so before 1.0.0: a program that compiles with `implicit_any_cast` is not covered. Then union types are no gate, except that strings as lists wants a union one may write |
| **A `null` through arithmetic** | Today is JavaScript's rule and a blank spreadsheet cell's: `null + 1` is `1`, `null > -1` is `true`, `null == 0` is `false`. But a `null` here is also a FAILED computation, and no language compared treats that as zero: JavaScript gives `Infinity` for `1 / 0`, a spreadsheet `#DIV/0!` everywhere after it, SQL `NULL`. Each one with aggregates skips a missing value, where `Average([null, 4])` is `2` and `Max([null, -4])` is `0`, a number that is not in the list. The choice: keep the rule for good; or number ops hand a `null` on, aggregates skip it, and `??` says "use 0". Known hard part of the second: `>=` is `Not(LessThan(…))`, so a comparison with a `null` has to be `null` and not `false`, or `null >= 5` comes out `true` |
| **A value of the wrong type that crosses an `any`** | Written directly it is refused: `Add("abc", 1)` is `op_input_type_mismatch`. Through an `any` it runs. Probed: `Add($v, 1)` with `"5"` is the TEXT `"051"`, with `[2]` the text `"021"`; `Average(["2", 4])` is `12`; `Map([1, "a"], x => x + 1)` is `[2, "0a1"]`; `If("no", 1, 2)` is `1`; `LessThan([1], 5)` is `true`; `$v.name` on `5` THROWS, where on `null` it is `null`. And it is uneven: `Multiply("3", 2)` is `6` and `Max(["10", 9])` is `10`, so a numeric text is a number to some ops and not to `Add`. Already sound: `Subtract("abc", 1)` is `null`, `Length(5)` is `0`, `Upper(5)` is `"5"`. The choice: refuse with an error, or one rule that an op reads what is not of its type as no value |
| **A call to a name that is no op** | `Lenght($scores)` and a misspelt binding `socres` give one kind and one sentence: "'…' is not declared as a binding or scoped variable". Proposed: keep the kind, say "no op and no binding has that name" for a call, and name the nearest op or binding. That only adds, so it is no gate, and it can ride with 0.7.0. A kind of its own would be a break |
| **A `NaN` inside a list a host op returns** | A known ceiling. Proposed: no gate |
| **One 1.0.0 for all three packages, or each on its own** | Since 0.6.1 the editor has its own number, and Rete is an editor matter, so core could reach 1.0.0 first |

**Kept in mind, and may wait for 2.0.0:** versions of the documentation site
(`docs-plan.md` has "none before 1.0").
