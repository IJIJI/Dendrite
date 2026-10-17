# Dendrite — Todo

The near future: what is being worked on now, and what comes straight after. Anything for
some later point in time is in `backlog.md`; finished work, kept for its reasoning, is in
`done.md`.

---

## The order after 0.8.0

0.8.0 is on npm since 2026-10-16 (`done.md`, "0.8.0 on npm"). The release plan below was
agreed with the maintainer on 2026-10-16, right after, and given each package's number on
2026-10-17: before 1.0 the three packages share a minor (`CLAUDE.md`, "The packages'
numbers"). Patches only add; minors may break. Each row names its entry.

| Version | Packages | Holds | Entry |
| --- | --- | --- | --- |
| **0.8.1** | Core 0.8.1, a patch; the editor and the link stay at 0.8.0 | **On npm since 2026-10-16** (`done.md`, "0.8.1 on npm"). The strict keys: the evaluator typed from the op's declaration, the stdlib's 52 casts gone (counted 2026-10-16; the earlier 35 was stale). And the binding computed once per evaluation. **Planned 2026-10-16**, with 0.8.2 and 0.8.3, in `perfect-agreed-make-sure-purrfect-karp.md` (the maintainer's plan folder), revision 3 after ten review passes, two of them independent reviews from other chats; revision 6 (2026-10-17, 21 passes) holds the rows below | `done.md`, "Core — a typed evaluator derived from the op's declaration", "Core — a binding is recomputed once per reference" |
| **0.8.2, next** | A patch of all three: core 0.8.2, editor 0.8.1, link 0.8.1 (its peer `^0.8.2`; protocol 2, the wire change riding the patch under the exception in `CLAUDE.md`) | The set-input split, A: `setInput` and `setInputs` on every side, all or none, each keeping its channel; `setInputs` on the wire in `setInput`'s place with protocol 2 (decision C, 2026-10-16: no support for a mixed pair, none is deployed); `updateInputs` deprecated. Built (`cce7a64`). Hover on an op: its signature coloured and its description (built, `86cb18e`, `fe5e73a`), and its first example. Hovers on `$input`, an output's name and a type name, from the instance's ports, values and outputs (decided 2026-10-16, A). *How a program runs* simplified. The Outputs pane stays as it is (`backlog.md`, "Editor — what a `null` output does") | `done.md`: "0.8.1 and 0.8.2", "Core — two styles for setting an input", "Docs — *How a program runs* gets simpler"; `backlog.md`, "Editor — what the hover does not show yet" |
| **0.8.3** | Core 0.8.3, a patch; the editor and the link stay at 0.8.1 | The ops that only add (and *Extending the language* renames its own sample op `Last`, which the library then has): `At`, `First`, `Last`; `Split`, `Slice`, `Replace`; `Sum`, and `Sort`, `Reverse`, `Unique`, `Range` where the backlog lacks them; `Clamp` with one bound; the math leftovers | `backlog.md`: "array index access", "the rest of the string ops", "`Clamp` with one bound", "what the math batch left out" |
| **0.9.0** | A minor of all three, the peers `^0.9.0` | Union types, `A \| B`: the kind, `isCompatible`, the parser, honest types for `If`, `??`, `[1, null]`, a function in a branch; the null-item rule reassessed; the `implicit_any_cast` promise written; a new `Type` kind refused where it is not known (the saved format's version, and `PROTOCOL`) | `backlog.md`, "Language — union types", "a `null` item in a list literal" |
| **0.9.1** | Core 0.9.1, a patch; the editor 0.9.1 (peer `^0.9.1`) if a pane shows the answer; the link stays at 0.9.0 | "Why is this `null`?": one output, on demand, the small first step of run-time tracking; with it, whether the two cache checks become one | `backlog.md`, "Core — run-time tracking", "Core — less recomputation" |
| **0.10.0** | A minor of all three | Lists: `xs[i]` as syntax over `At`; a string is a list for the list ops, no name removed; struct literals `{ a: 1 }`, and before them the struct type that names itself refused (a breaking line, beside `Length("abc")`) | `backlog.md`: "array index access", "strings as lists", "struct literals", "a struct type that names itself" |
| **The Rete half** | The next shared minor of all three: the editor carries the work, core and the link release with their peers moved. Or it rides 0.10.0, if the two are ready together | The visual editor, with its own plan; after 0.9.0, since it needs `Type` final | `backlog.md`, "Editor — the visual (Rete) half" |
| **The pre-1.0 minor** | A minor of all three | Every removal and review left: `updateInput` and `updateInputs` gone; `LazyInputsOf` gone; the evaluator registered by name kept or removed; the stdlib names review and `Flatten`'s type; what is public in the editor and core's extension API | Below, "Before 1.0.0"; `backlog.md`, "Core — whether an evaluator may still be registered by the op's name" |
| **1.0.0** | All three together (the maintainer, 2026-10-17, replacing "11B") | When the pre-1.0 minor is out, the Rete half has settled, and Beacon has used the API | Below, "Before 1.0.0" |

The order's three reasons: adds before breaks (0.8.1 to 0.8.3 ship every small thing without a
plan file each, 0.9.0 is the first plan); types before the editor (union types change `Type`,
and Rete reads it everywhere); one pre-1.0 minor for every removal, so 1.0 is a list.

Beside that order: the two entries below it (the site review after Learn, as the maintainer
reads; the boolean input's checkbox, with the Rete half). The last section of this file is what
must be done before a 1.0.0.

---

## Docs — review the rest of the site after Learn

**What:** the user is reading the docs page by page and sending observations. Learn comes first
(its observations were the samples step, now in `done.md`); **then** How it works, Host
developers and the stdlib reference, the same way. The site-wide passes (the colouring, the
dashes, the chain) already landed with the samples step, so these pages start from them.

**When:** next, alongside the inline TypeScript colouring: the user reads, and the
observations collect here until there is a section's worth to plan.

---

## Editor — the boolean input's checkbox, better looking

**What:** asked by the maintainer on 2026-10-12. A boolean input is the browser's own checkbox
(`BooleanField` in `packages/editor/src/react/blocks/panes/Inputs.tsx`), and the stylesheet gives
it one declaration, `accent-color: var(--dendrite-accent)`. Every other control of the pane is
drawn by the editor: 2px corners, the border colour, the raised ground. The checkbox is the
system's size and shape, so it differs from one browser and one platform to the next.

**When:** with the Rete half's editor release (2026-10-16): that work looks at the brand sheet anyway.

**What it requires:** a look first, as the surfaces had: what the brand sheet draws for a
checkbox or a switch, and a mock in the real page, light and dark, in the Minimal strip and in
a pane's row. Then values only if the sheet has it (`appearance: none`, the field's border and
ground, a mark in the accent), and a frame from Claude Design if it wants a new shape. It ships
in a release of the editor.

---

## Before 1.0.0 — what has no release named yet

Asked for by the maintainer on 2026-10-10: the todos that have no clear time, and that must
be done before a 1.0.0. The repo has no written definition of 1.0, so one rule sorts them:
**after 1.0.0, a change that breaks a program, a host's code or a saved file needs a 2.0.0.**
What only ADDS can come after. The list is being talked through; each row says where it stands.

**Built in 0.8.0 (2026-10-15):** every row below marked "The plan of option B", the `And`/`Or`
row, the conversion row, the two `NaN` rows and the field-read row. The record is "0.8.0 — decided
on 2026-10-14" above, and the three backlog entries they closed are in `done.md`.

**Agreed, the maintainer, 2026-10-10:**

| What | Why before 1.0.0 | Where it is written |
| --- | --- | --- |
| **A review of the stdlib's names** | A rename or a move is a break, as the comparison ops' move to `logic` was in 0.6.0 | Here. With it: `Flatten`, which cannot type its output (`backlog.md`) |
| **The functions the stdlib still lacks** | Asked for with the review. Each one only adds, so it is here for completeness of a 1.0, not for the rule | `backlog.md`: "the rest of the string ops", "`Clamp` with one bound", "what the math batch left out" |
| **Strings as lists** ("probably should") | `Contains` and `Includes` would become one op, which removes a name | `backlog.md`, "Language — strings as lists" |
| **A struct type may not reach itself through a function field** | Refusing it later refuses a type a host declared. `Tree { children: Tree[] }` stays legal | `backlog.md`, "Core — a struct type that names itself". Placed in 0.10.0, before struct literals (the order at the top) |
| **A saved program that is not well formed is reported, never thrown: in 0.7.1** (the maintainer, 2026-10-12) | 1.0 promises that a command reports and does not throw. Probed: seven kinds of bad program give a raw `TypeError` from `setProgram`, `setLayer`, `createInstance` or `load`, and three of them leave the instance broken for good. The whole check exists, in the link (`isSavedProgram`); a program from storage goes past it | `backlog.md`, "Core — a saved program that is not well formed" |
| **One style for setting an input** | The shape of `updateInputs` and `setInput`, and the link's protocol | **Decided 2026-10-16 (A), built for 0.8.2**: both styles kept, a batch on each side. `done.md`, "Core — two styles for setting an input" |
| **What is public, in the editor and in core's extension API** | Hosts use the editor's CSS variables and classes already. In core: say that `language.grammar`'s maps are internal, and that the keys of `registerNud` and the three booleans of `OpInput` are the API as they are. Then the `Grammar` refactors of the backlog can come after 1.0.0, and the one that renames the keys is dropped. To be explained in detail when it is taken | `backlog.md`: "documenting the configs", "drill down on `LayoutConfig`", "Parser — `Grammar` is a data bag" |
| **"No value": a single op hands it on, a list op skips it, EVERYWHERE** (option B; the maintainer, 2026-10-12: "Ok B it is", then "Agreed, everywhere": every op that names a type for an input, so `Upper(null)`, `Length(null)`, `Not(null)` and a comparison give `null` too; `IsSet`, `??`, `==` and an input that converts are the places that take no value) | It changes results: `1 / 0 + 1` is `1` today and becomes `null`, `Average([1, null])` goes from `0.5` to `1`, `Max([-4, null])` from `0` to `-4`. Decided with it: no implicit casting and no switch for a host, `+` never joins text, and **an error is no option** ("especially since we have no way of logging or displaying them"; a run error also stops every output). What is still open of it is in the table below | Below, and `backlog.md`: "a `null` that goes through arithmetic", "What boundary validation left" |
| **The promise leaves out a program that compiles with `implicit_any_cast`** (the maintainer, 2026-10-12: "that is fine, we are pre 1.0, and we warned") | It lets an inferred union, or any stricter check, refuse such a program after 1.0.0 with no 2.0.0. **The docs update is part of the plan** (the maintainer): the sentence where the docs state what 1.x keeps, and in the warning's own text | Here. The plan of option B carries the docs: the pages on `null` and on types, the reference, *Every diagnostic*, the changelog's breaking lines |
| **The rule for "no value" lives in the evaluator; the skip lives in the stdlib** (the maintainer, 2026-10-12) | One place, and a host's op is covered. `Average`, `Max` and `Min` skip through one helper; about thirty guards in the ops can go | The plan of option B |
| **A field read that finds nothing gives `null`, and the checker warns** (the maintainer: "6A, but do warn") | Today `$v.name` on a `5`, or on a struct without that field, throws and stops every output; on a `null` it is `null`. Nothing warns: a field read from an `any` compiles clean. The warning is the checker's, at the read; a note at run time is the tracking entry's | The plan of option B; `backlog.md`, "Core — run-time tracking" |
| **A `null` item leaves a list literal's type alone** (the maintainer: "7A", to reassess before 1.0.0) | `[1, null]` is `number[]`, where it is `any[]` today and `Average([1, null])` warns | The plan of option B; `backlog.md`, "Language — a `null` item in a list literal" |
| **A struct prints as its JSON, and the docs say so** (the maintainer: "8A") | No code. A type's own text form can still come later: it is opt-in | The docs update of option B |
| **All three packages reach 1.0.0 together** (the maintainer, 2026-10-17, replacing "11B" of 2026-10-12: each package when it was ready) | One minor across the packages before 1.0 and one major after (`CLAUDE.md`, "The packages' numbers"), so 1.0.0 is one release: when the pre-1.0 minor is out, the Rete half has settled and Beacon has used the API | Here; the order at the top |
| **`And` and `Or` are three-valued** (the maintainer, 2026-10-12: "2C") | A `false` on EITHER side decides an `&&`, a `true` on either side an `\|\|`; else a missing side gives `null`. So `false && null` and `null && false` are both `false`, and the order does not matter, as SQL, R, pandas and C# have it. It may still skip a side, which is only a saving. It changes results (`And(null, true)` is `false` today), so it is built with option B; the means for it, an op that looks at its inputs itself, comes with the lazy `If` of 0.7.0. `If(null, a, b)` is `null` | The plans of 0.7.0 and of option B |
| **A conversion of no value is no value** (the maintainer: "5C") | `ToString(null)`, `ToNumber(null)` and `ToBool(null)` are all `null`, where the first is `""` and the third `false` today. No value becomes text in one place only: an input that declares it converts (`Join`, so `++` and a template), and `` `total {x}` `` stays `"total "` | The plan of option B |
| **Every `NaN` becomes `null`** (the maintainer, 2026-10-12: "Agreed on the NaN handling") | A `NaN` is no value of the language: it is JavaScript's "not a number", a number by its type, not equal to itself, and not JSON. A program cannot make one and a typed input refuses one; it gets in by two doors, both a host's: an op of the host that returns it inside a list or a struct, and a value pushed into an `any` input. Both doors get a pass that reads lists and structs, turns a number that is not finite into `null` and a negative zero into `0`, and copies only when it finds one. Then `$a == $a` cannot be `false`, the two ends of a link agree, and a host needs no warning in the docs | The plan of option B |
| **Only a host's op gets the pass for a `NaN`, and the mark that skips it is public** (the maintainer, 2026-10-12: "B seems better. If we add a mark it means host ops can also do it, and it needs to be documented as an option to have quicker operations") | The stdlib is built with core's public tools only (`BP`, `operationNode`, `Convert`, `Type`, `elementOf`), so a private mark would be its first door of its own. Agreed with it: the mark is a member of the evaluator's definition, named for what it PROMISES (no number it returns, at any depth, is a `NaN` or an infinity) and not for speed; it is off unless said; the stdlib's ops that only hand items on, or collect results of ops, carry it, and a test holds each of them to it. A host's declared output type is not checked at run time either, so this is the same kind of trust. The docs get it on *Extending the language*, beside the paragraph on what an evaluator's `NaN` becomes, with the measured cost: 2.7 ns for a number and 8 ns for a struct's field, so it is rarely needed | The plan of option B, and its docs |
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

**Still to decide:** nothing. The last row, two styles for setting an input, was decided on
2026-10-16 (A) and built in 0.8.2 (`done.md`).

**What was probed for option B** (2026-10-12, all on core 0.6.0):

- **`null` today.** `$n + 1` is `1`. `$n >= 0` and `$n <= 0` are `true` while `$n == 0` is
  `false`. `Not($b)` is `true` while `$b == false` is `false`. A list that IS `null` has no
  average while `Average([null])` is `0`. `Max([null, -4])` is `0`. `ToNumber(null)` is `null`,
  so a conversion op hands a `null` on and arithmetic does not.
- **A wrong type through an `any`.** There is a rule for lists (`toList`) and for text
  (`Convert.toString`, so `Upper(5)` is `"5"`), and none for numbers, booleans, comparisons and
  a field read: there JavaScript decides. `Add` is `reduce((a, b) => a + b, 0)`, which is where
  `"0a1"` comes from; `Average(["2", 4])` is `12`; `If("no", 1, 2)` is `1`.
- **Where the guards are.** The stdlib holds about thirty of its own (`toList` 14 times,
  `Convert.toString` 8, `Number(` 5, `Boolean` 3), and the ops that have none are the faults.
  The evaluator's `resolveInputs` already loops over an op's inputs to convert one declared `~`.
- **Which ops would receive no value, by what they declare already.** An input typed `any`
  takes whatever comes: `IsSet`, `Default`, `Equals`, `NotEquals`, the branches of `If`, the
  three conversions, `Includes`' value, `Reduce`'s initial. Beside them: an optional input, and
  `Join`'s converting one. Every other input of the 46 ops names a type. So no new flag is
  needed to say which ops are the exceptions.
- **How common "no value" is.** An input with no declared default starts as its TYPE's
  default: `0`, `""`, `false`, `[]`, and `null` only for `any` and for a type that has none
  (`language.ts`, `runtime/seed.ts`). So a `null` comes from an op with no answer, a cast that
  does not fit, a field that is not there, an `any`, or a host that pushes one. **Corrected:**
  an earlier version of this note said that every unset input is `null`; that was true only of
  the probes, which declared `default: null`.
- **What an inferred union would refuse, and whether it warns today.** Each case tried has
  `implicit_any_cast` now: `If($c, 1, "a") + 1`, `Upper(If(…))`, `Average([1, "a"])`, the same
  `If` in an output a host declared `number`. Each clean one stays legal: `Length([1, "a"])`,
  `Equals(If(…), 1)`, a plain `output o = If(…)`.
- **What an error would do.** A run error stops EVERY output: the instance keeps the last
  values and marks them stale (`runtime/instance.ts`).

**Kept in mind, and may wait for 2.0.0:** versions of the documentation site
(`docs-plan.md` has "none before 1.0").
