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
| 0.7.0 | **On npm since 2026-10-14** (`done.md`, "0.7.0 on npm") | done |
| 0.7.1, next | **A saved program that is not well formed is reported, never thrown** (the maintainer, 2026-10-12: "Do it in 0.7.1"). A patch: it breaks nothing | below |
| 0.8.0, the minor after 0.7 | **"No value", option B, everywhere**, with its docs (the maintainer, 2026-10-12). 0.7.0 brings `??` first, so a program can be made ready: `x ?? 0` means the same under both rules | The last section of this file |
| 0.8.1 | **The strict keys: the evaluator typed from the op's declaration**, so the stdlib's 35 casts go (the maintainer, 2026-10-13: "something I definitely want"). A patch, it only adds; after 0.8.0 because the door is what makes the types true | `backlog.md`, "Core — a typed evaluator derived from the op's declaration" |
| Soon after | **The visual (Rete) half starts, with a plan.** The maintainer, 2026-10-10: "it will become harder to implement the more we wait" | `backlog.md`, "Editor — the visual (Rete) half" |
| After 0.7 | Union types, `A \| B` (the maintainer, 2026-10-10; it was "0.7, possibly") | `backlog.md`, "Language — union types" |
| Later, possibly | Strings as lists, with `Split`, `Slice` and `Replace` | `backlog.md`, "Language — strings as lists" |

Beside that order, with no release named for them: the three entries after the next one. Two
came from the maintainer while 0.6.1 was built (*How a program runs* gets simpler; two styles
for setting an input), and the third is where a reading of the site collects. The last section
of this file is what must be done before a 1.0.0.

---

## 0.7.1 — a saved program or layer that is not well formed

**This is the next work.** A patch for core and the link, straight after 0.7.0 (on npm since
2026-10-14). The entry as it stood in the backlog, with its probe table and the decisions of
2026-10-14, then the plan.

### The entry

**What:** a saved program is data from outside: a host reads it from a file or a database and
hands it over. Core checks part of it, and what it does not check comes out as a raw
`TypeError`, from commands that are documented to report through the observables. Probed on
2026-10-12, each case on a fresh instance, followed by a sound `setProgram`:

| Handed to `setProgram` | The call | A sound program next |
| --- | --- | --- |
| Ports with no `outputs` | `TypeError`: `layer.ports.outputs is not iterable` | **Throws again** |
| Ports where `inputs` is a text | `TypeError` | **Throws again** |
| An input with no name | `TypeError` | **Throws again** |
| An input whose type is a text | `malformed_program`, stale | Works |
| Ports that are `null` | `malformed_program`, stale | Works |
| A source that is a number | `TypeError`: `s.source.startsWith is not a function` | Works |
| A form nobody knows | `TypeError`, though the kind `unsupported_form` exists | Works |
| A version from the future | `unsupported_version`, stale | Works |

`setLayer` and `createInstance` give the same `TypeError` for ports of the wrong shape, with
no lasting harm. `env.load` answers `malformed_program` for the ports and throws for the
source and for the form.

**Why three cases break the instance for good:** `setProgram` writes `saved.ports` into the
persisted layer and THEN recompiles (`runtime/instance.ts`). When composing throws, the layer
is already replaced, so every later recompile throws too.

**The cause under all of it:** the whole check exists, and it is in the wrong package.
`isSavedProgram` in `packages/link/src/protocol.ts` tests the version, the form, the source and
the ports (through core's `isPorts`), so a program that arrives over a link is safe. A program
that arrives from storage goes past it.

**Who can reach it:** any host that loads what it saved, when the file is damaged or was
written by another version. TypeScript does not help: read JSON is `unknown`, cast to a
`SavedProgram`.

**When: 0.7.1** (the maintainer, 2026-10-12: "Do it in 0.7.1"). A patch, straight after
0.7.0: a raw error becomes a diagnostic, so nothing breaks. It was found in passing, while
the *Embedding core* sample was probed for the docs pass of 0.6.1.

**Proposed, and not yet said yes to:** the fix at the door, and report rather than throw (an
instance already reports `unsupported_version` that way: a diagnostic, and the old program
keeps running, stale). The plan of 0.7.1 confirms both. One thing it must settle: the link
would import `isSavedProgram` from core, so the link needs core 0.7.1 or later, and its peer
range has to say so.

**Decided 2026-10-14** (the maintainer: "Agreed on both"): **the fix at the door**, and
three things the plan settled with it:

- **A layer of a bad shape is refused inside `composeLayers`**, as a new `PortProblem` kind,
  `malformed_ports`, with the layer's id. It is the one function that reads `layer.ports`, and
  every door composes, so the kind is the same at both levels and each level keeps its channel:
  `runtime.setLayer` returns it, `createRuntime` throws its report, `instance.setLayer`
  publishes it with `refused: true` (its filter by `layerId` already matches). A program's own
  ports never get that far: `setProgram` and `createInstance` refuse them at the door, as
  `malformed_program`, before the layer is written. So the narrow fix below needs no `isPorts` of its
  own in `setLayer`: it falls out. The question that decided it: is the error the same for a
  global and a program layer? The kind should be, the channel should not.
- **`isSavedProgram` is thin**: a record, a numeric `version`, a `form` of the three, a `code`
  form with a string `source`, an `ast` form whose `bindings` and `outputs` are records (the
  nodes stay `deserialise`'s, which throws into `malformed_program` today), `ports` absent or
  `isPorts`. `assertSavedPorts` stays exported and marked deprecated: it leaves `index.ts`
  through `export *`, and a patch removes nothing.
- **The `layers` option of `createInstance` is host code**, as `createRuntime`'s layers are: a
  host layer with `ports: null` is read in five places before and after compose, so a guard
  would be Shotgun Surgery. The constructor keeps its throw; the docs draw the line (data is
  reported, a layer built in code throws); one test pins it.

Two facts for the work: `malformed_ports` gets `triggeredBy` and no sample, because the docs
page prints every compose sample's declarations through `declarationsOf`, which maps over
`ports.inputs` and would break the build on a bad shape; and the link's one test file is
`link.test.ts`. The release record is written after the release, as every record is.

**What it requires, in two sizes:**

- **The narrow fix:** `isPorts(saved.ports)` in `setProgram` before the layer is touched, and
  `malformed_program` where it fails. It ends the three cases that break an instance. The four
  other raw errors stay.
- **The fix at the door:** `isSavedProgram` moves to core beside `isPorts`, and the link imports
  it. `env.load` asks it first, so `load`, `setProgram` and `createInstance` answer
  `malformed_program` or `unsupported_form` and never throw; `setProgram` installs the ports
  only after that; `setLayer` asks `isPorts`. No new diagnostic kind. A test for each row of
  the table, and one that a refused program leaves the next one working.

### The plan (from the approved plan of 0.7.0 and 0.7.1, revision 7)

Three commits, each with its gates green before its handover, the docs build for the last.

**Commit B: core.**

| File | Change |
| --- | --- |
| `compose.ts` | `PortProblem.kind` gains `"malformed_ports"`. In `walk`, before reading `layer.ports`: `isPorts` fails → a problem with the layer's id, `where: "ports"`, and the layer is skipped |
| `diagnostics.ts` | `malformed_ports`: stage `compose`, with `triggeredBy` and no sample (the docs page prints every compose sample's declarations through `declarationsOf`, which maps over `ports.inputs` and would break the build on a bad shape) |
| `infra/serialise.ts` | `isSavedProgram(value: unknown): value is SavedProgram`: a record, a numeric `version`, a `form` of the three, a `code` form with a string `source`, an `ast` form whose `bindings` and `outputs` are records (the nodes stay `deserialise`'s), `ports` absent or `isPorts`. Exported from `index.ts`. `assertSavedPorts` stays, marked `@deprecated` for `isSavedProgram` |
| `environment.ts`, `load` | `!isSavedProgram(saved)` → `unsupported_form` when `form` is a string none of the three names, else `malformed_program`; then `migrate` (`unsupported_version`) and the switch as today; `assertSavedPorts` no longer called |
| `runtime/instance.ts` | The constructor takes the document layer's ports from the program only when `isSavedProgram` holds (`EMPTY_PORTS` otherwise); `recompile` → `load` publishes the diagnostic. `setProgram`: `isSavedProgram` first, and the two `saved.ports` reads behind it. `setLayer`: no change, the compose problem carries the layer's id. The `layers` option is host code, as `createRuntime`'s layers are: a bad one there throws, and one test pins the line |

Tests: `runtime/instance.test.ts`, one per row of the probe table on the call the row names,
plus `setLayer` with `inputs: "x"`, `createInstance` with a bad first program, a sound program
after a refused one, and a host layer with `ports: null` throwing. `runtime/runtime.test.ts`:
`runtime.setLayer` with a bad shape returns one `malformed_ports`, `createRuntime` with one
throws its report. `environment.test.ts`: `load` per bad shape. `compose.test.ts`: the kind with
its `layerId`, the other layers still composing. `infra/serialise.test.ts`: `isSavedProgram` per
shape. `packages/link/src/link.test.ts`: unchanged in outcome.

**Commit C: link, docs, changelogs, versions.**

| Where | What |
| --- | --- |
| `packages/link/src/protocol.ts`, `package.json` | Its own `isSavedProgram` deleted, core's imported; `0.7.1`, peer `^0.7.1` |
| `packages/core/package.json` | `0.7.1` |
| `host/embedding-core.md` | A damaged file is reported on `diagnostics` (`malformed_program`, `unsupported_form`), a layer of a bad shape that arrives as data as `malformed_ports`; a layer a host builds in code (`createRuntime`'s `layers`, `createInstance`'s `layers` option) throws, as any compose problem there |
| `host/packages/core.md` | `isSavedProgram` among the named exports |
| `how-it-works/diagnostics.mdx` | Generated: `malformed_ports` with its `triggeredBy` |
| The two changelogs | Core 0.7.1: the eight raw errors become diagnostics, `malformed_ports`, `isSavedProgram` exported. Link 0.7.1: core's guard, peer `^0.7.1` |
| The notes | Nothing moves; the record "0.7.1 on npm" is written after the release, and this entry goes to `done.md` with it |

Then the release, per the runbook: `yarn install` after the peer bump (the lockfile), the
version note on *Installation* at 0.7.1, the PR, the tags, one release in the shape of the
previous ones, two approvals core first, the check from outside the repo. The editor's peer
`^0.7.0` admits 0.7.1: no editor release.

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

## Editor — the boolean input's checkbox, better looking

**What:** asked by the maintainer on 2026-10-12. A boolean input is the browser's own checkbox
(`BooleanField` in `packages/editor/src/react/blocks/panes/Inputs.tsx`), and the stylesheet gives
it one declaration, `accent-color: var(--dendrite-accent)`. Every other control of the pane is
drawn by the editor: 2px corners, the border colour, the raised ground. The checkbox is the
system's size and shape, so it differs from one browser and one platform to the next.

**When:** not placed by the maintainer.

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

**Agreed, the maintainer, 2026-10-10:**

| What | Why before 1.0.0 | Where it is written |
| --- | --- | --- |
| **A review of the stdlib's names** | A rename or a move is a break, as the comparison ops' move to `logic` was in 0.6.0 | Here. With it: `Flatten`, which cannot type its output (`backlog.md`) |
| **The functions the stdlib still lacks** | Asked for with the review. Each one only adds, so it is here for completeness of a 1.0, not for the rule | `backlog.md`: "the rest of the string ops", "`Clamp` with one bound", "what the math batch left out" |
| **Strings as lists** ("probably should") | `Contains` and `Includes` would become one op, which removes a name | `backlog.md`, "Language — strings as lists" |
| **A struct type may not reach itself through a function field** | Refusing it later refuses a type a host declared. `Tree { children: Tree[] }` stays legal | `backlog.md`, "Core — a struct type that names itself" |
| **A saved program that is not well formed is reported, never thrown: in 0.7.1** (the maintainer, 2026-10-12) | 1.0 promises that a command reports and does not throw. Probed: seven kinds of bad program give a raw `TypeError` from `setProgram`, `setLayer`, `createInstance` or `load`, and three of them leave the instance broken for good. The whole check exists, in the link (`isSavedProgram`); a program from storage goes past it | `backlog.md`, "Core — a saved program that is not well formed" |
| **One style for setting an input** | The shape of `updateInputs` and `setInput`, and the link's protocol | Above, "Core — two styles for setting an input" |
| **What is public, in the editor and in core's extension API** | Hosts use the editor's CSS variables and classes already. In core: say that `language.grammar`'s maps are internal, and that the keys of `registerNud` and the three booleans of `OpInput` are the API as they are. Then the `Grammar` refactors of the backlog can come after 1.0.0, and the one that renames the keys is dropped. To be explained in detail when it is taken | `backlog.md`: "documenting the configs", "drill down on `LayoutConfig`", "Parser — `Grammar` is a data bag" |
| **"No value": a single op hands it on, a list op skips it, EVERYWHERE** (option B; the maintainer, 2026-10-12: "Ok B it is", then "Agreed, everywhere": every op that names a type for an input, so `Upper(null)`, `Length(null)`, `Not(null)` and a comparison give `null` too; `IsSet`, `??`, `==` and an input that converts are the places that take no value) | It changes results: `1 / 0 + 1` is `1` today and becomes `null`, `Average([1, null])` goes from `0.5` to `1`, `Max([-4, null])` from `0` to `-4`. Decided with it: no implicit casting and no switch for a host, `+` never joins text, and **an error is no option** ("especially since we have no way of logging or displaying them"; a run error also stops every output). What is still open of it is in the table below | Below, and `backlog.md`: "a `null` that goes through arithmetic", "What boundary validation left" |
| **The promise leaves out a program that compiles with `implicit_any_cast`** (the maintainer, 2026-10-12: "that is fine, we are pre 1.0, and we warned") | It lets an inferred union, or any stricter check, refuse such a program after 1.0.0 with no 2.0.0. **The docs update is part of the plan** (the maintainer): the sentence where the docs state what 1.x keeps, and in the warning's own text | Here. The plan of option B carries the docs: the pages on `null` and on types, the reference, *Every diagnostic*, the changelog's breaking lines |
| **The rule for "no value" lives in the evaluator; the skip lives in the stdlib** (the maintainer, 2026-10-12) | One place, and a host's op is covered. `Average`, `Max` and `Min` skip through one helper; about thirty guards in the ops can go | The plan of option B |
| **A field read that finds nothing gives `null`, and the checker warns** (the maintainer: "6A, but do warn") | Today `$v.name` on a `5`, or on a struct without that field, throws and stops every output; on a `null` it is `null`. Nothing warns: a field read from an `any` compiles clean. The warning is the checker's, at the read; a note at run time is the tracking entry's | The plan of option B; `backlog.md`, "Core — run-time tracking" |
| **A `null` item leaves a list literal's type alone** (the maintainer: "7A", to reassess before 1.0.0) | `[1, null]` is `number[]`, where it is `any[]` today and `Average([1, null])` warns | The plan of option B; `backlog.md`, "Language — a `null` item in a list literal" |
| **A struct prints as its JSON, and the docs say so** (the maintainer: "8A") | No code. A type's own text form can still come later: it is opt-in | The docs update of option B |
| **Each package reaches 1.0.0 when it is ready** (the maintainer: "11B") | Core and link first, the editor after the Rete half. The gates above apply to the package they concern | Here |
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

**Still to decide** (after the talk of 2026-10-12):

| Decision | The options, and where the talk stands | Wanted by |
| --- | --- | --- |
| **Two styles for setting an input** | Keep both, add a batch call to an instance (only adds), or one verb for both (a break). The maintainer: "We'll decide later, but before 1.0" | Before 1.0.0 |

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
