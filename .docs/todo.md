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
| 0.7.1 | **On npm since 2026-10-14** (`done.md`, "0.7.1 on npm") | done |
| 0.8.0, next | **"No value", option B, everywhere**, with its docs (the maintainer, 2026-10-12). 0.7.0 brings `??` first, so a program can be made ready: `x ?? 0` means the same under both rules. **Planned, probed and approved 2026-10-14**: the plan file `perfect-agreed-make-sure-purrfect-karp.md` (the maintainer's plan folder), revision 3 | Below, "0.8.0 — decided on 2026-10-14", and "Before 1.0.0" |
| 0.8.1 | **The strict keys: the evaluator typed from the op's declaration**, so the stdlib's 35 casts go (the maintainer, 2026-10-13: "something I definitely want"). A patch, it only adds; after 0.8.0 because the door is what makes the types true. **And a fix: a binding recomputed once per reference** (found 2026-10-14; the maintainer: 0.8.1, "it has a timeframe") | `backlog.md`, "Core — a typed evaluator derived from the op's declaration"; below, "Core — a binding is recomputed once per reference" |
| 0.8.2 | **What the editor and the docs need after "no value"**: how a `null` output is shown, the samples re-read, and the rest of the list below. A patch of the editor, possibly the docs alone | Below, "0.8.1 and 0.8.2" |
| Soon after | **The visual (Rete) half starts, with a plan.** The maintainer, 2026-10-10: "it will become harder to implement the more we wait" | `backlog.md`, "Editor — the visual (Rete) half" |
| After 0.7 | Union types, `A \| B` (the maintainer, 2026-10-10; it was "0.7, possibly") | `backlog.md`, "Language — union types" |
| Later, possibly | Strings as lists, with `Split`, `Slice` and `Replace` | `backlog.md`, "Language — strings as lists" |

Beside that order, with no release named for them: the three entries after the next one. Two
came from the maintainer while 0.6.1 was built (*How a program runs* gets simpler; two styles
for setting an input), and the third is where a reading of the site collects. The last section
of this file is what must be done before a 1.0.0.

---

## 0.8.0 — decided on 2026-10-14

The plan of option B, probed on 0.7.1 source and approved by the maintainer on 2026-10-14
after four review passes and one independent review from another chat, assessed claim by
claim. The plan file is `perfect-agreed-make-sure-purrfect-karp.md` in the maintainer's plan
folder (revision 3); this section is the record in the repo. Every decision of option B was
taken on 2026-10-12 ("Before 1.0.0", below). What the plan settled, each with its letter:

| Question | Decided | Letter |
| --- | --- | --- |
| `Default` and `If` | `Default` stays the op under `??`. A desugar to `If(IsSet(a), a, b)` writes `a` into two nodes, and the analyser copies a node per visit, so `a` evaluates twice (probed: `Tick() ?? 0` calls once, the inline `If` form twice). One op call is also cheaper than a thunk, and `??` is shipped over `Default` | 1A |
| `Default`'s output type | Aligned with `If`: the branches' type when they agree, else `any`. `$n ?? "none"` was typed `number` with the fallback unchecked: the one exception to the language's rule for types that disagree | 2A |
| The mark on the evaluator | `finiteCheck: false` (renamed on 2026-10-15 from `finite: true`, which read backwards as a switch: the check is on by default, `false` turns the walk off on the op's promise that no number it returns, at any depth, is a `NaN` or an infinity) | 3A |
| The host-push door for a `NaN` | Read as `null`, on every input, in `updateInput`, the one function every path enters the evaluation state through. A `number` input refused a `NaN` through zod before, never by decision; it reads it as `null` now. An `undefined` the same way (probed: it passed the door and stopped every output with `input_not_set`) | 4B |
| The field read on an `any` | A new warning, `field_access_on_any`. The run-time kind `invalid_field_access` is unreachable and goes | 5a A, 5b A |
| `assertSavedPorts` | Removed in 0.8.0, as its deprecation said | 6a A |
| The "`null`, both ways" convention | Rewritten in place, in the commit that changes the code | 6b A |
| The samples on the site | Run on 0.7.1 and on 0.8.0 once; the prose beside a moved result is fixed. No pinning test | 6c |
| The cost of the rule | Measured, settled: one comparison per input inside the loop that already runs | 6d |
| A binding recomputed once per reference | Not this release: 0.8.1 (below), and a "Known" line in the changelog | 7B |
| `Reduce(list, null, …)` refused as `unknown_type` | Fixed in 0.8.0, in `Reduce`'s own `inferInputTypes`: a `null` or `any` initial types the accumulator `any` | 8 |
| The 1.x sentence | Not written: the repo has no definition of 1.0 yet. A hedge only, in `implicit_any_cast`'s meaning: a stricter check may refuse such a program later | 9 |
| Which list ops skip a `null` item | `Average`, `Max`, `Min`, through one helper. `Length([1, null])` is 2, `Map([1, null], x => x + 1)` is `[2, null]` | 10A |
| An optional input handed `null` | Reads as absent: the op sees `undefined`, as when the input is left out. `Round(2.5, null)` is 3. Python, Kotlin, C# and Rust read their one "nothing" so; JavaScript keeps `null` apart from `undefined`; SQL propagates | 11A |
| A value of the wrong kind on a typed input | No value, like a `null`: the KIND the type names is checked at every op (a primitive by `typeof`, a list by `Array.isArray`, a struct as an object, a type that extends a primitive by its root, an opaque handle not at all), a type's schema only at the door. `Upper(5)` and `"abc" + 1` give `null`; the stdlib's thirty guards go, which served this second rule as much as the `null` one | 12A |
| A `~` on an expression, converting to the slot's type | Rejected (`backlog.md`, "Language — `~` on an expression") | — |
| The door's standard for `null` | The language's: `null` is a member of every type and stays accepted; a wrong kind is refused as today. Stricter would leave a host no way to clear a value | — |
| Run-time tracking | Probably not before 1.0 (`backlog.md`, "Core — run-time tracking") | — |

**Today's result per changed case** (probed on 0.7.1 source, 2026-10-14), and the result
under the plan. Each row is a test in the commit named.

| Expression | 0.7.1 | 0.8.0 | Commit |
| --- | --- | --- | --- |
| `1 / 0 + 1` | `1` | `null` | 1 |
| `Add(1, null)`, `Multiply(2, null)`, `Subtract(null, 1)`, `Negate(null)`, `Divide(null, 2)`, `Mod(null, 3)`, `Pow(null, 2)`, `Abs(null)`, `Floor(null)`, `Ceil(null)`, `Clamp(null, 0, 10)`, `Round(null)` | `1`, `0`, `-1`, `0`, `0`, `0`, `0`, `0`, `0`, `0`, `0`, `0` | `null`, each | 1 |
| `Divide(2, null)` | `null` | `null` | 1 |
| `Round(2.5, null)` | `3` | `3` (absent, 11A) | 1 |
| `null > -1`, `null < 1`, `null >= 0`, `null <= 0` | `true`, each | `null`, each | 1 |
| `null == 0`, `null == null`, `null != 0` | `false`, `true`, `true` | the same (`Equals` takes `any`) | 1 |
| `Not(null)`, `!null`, `Xor(null, true)` | `true`, `true`, `true` | `null`, each | 1 |
| `And(null, true)`, `And(true, null)` | `false`, `false` | `null`, `null` | 1 |
| `And(false, null)`, `And(null, false)` | `false`, `false` | `false`, `false` | 1 |
| `Or(null, true)`, `Or(true, null)` | `true`, `true` | `true`, `true` | 1 |
| `Or(null, false)`, `Or(false, null)` | `false`, `false` | `null`, `null` | 1 |
| `If(null, 1, 2)`, `null ? 1 : 2` | `2`, `2` | `null`, and no branch is read | 1 |
| `null ?? 5`, `Default(null, 5)`, `IsSet(null)` | `5`, `5`, `false` | the same | 1 |
| `ToString(null)`, `ToNumber(null)`, `ToBool(null)` | `""`, `null`, `false` | `null`, each | 1 |
| `Upper(null)`, `Lower(null)`, `Trim(null)` | `""`, each | `null`, each | 1 |
| `Contains(null, "a")`, `Contains("a", null)`, `StartsWith(null, "a")`, `EndsWith("a", null)` | `false`, `true`, `false`, `true` | `null`, each | 1 |
| `Join([1, null], ",")`, `` `total {null}` ``, `"a" ++ null` | `"1,"`, `"total "`, `"a"` | the same (a converting leaf) | 1 |
| `Join(["a", "b"], null)` | `"ab"` | `"ab"` (absent, 11A) | 1 |
| `Join(null, ",")` | `""` | `null` (a converting input converts its leaves; a list that is no list is no value) | 1 |
| `Length(null)`, `Flatten(null, 1)`, `Flatten([[1]], null)`, `Concat([1], null)`, `Includes(null, 1)` | `0`, `[]`, `[[1]]`, `[1]`, `false` | `null`, each | 1 |
| `Average([1, null])`, `Max([-4, null])`, `Min([4, null])` | `0.5`, `0`, `0` | `1`, `-4`, `4` | 1 |
| `Average([null])`, `Max([null])` | `0`, `0` | `null`, `null` (nothing left) | 1 |
| `Average([1, "a"])` (through `any`) | `12` | `1` (the skip is by kind) | 1 |
| `Average(null)`, `Max(null)` | `null`, `null` | `null`, `null` | 1 |
| `Includes([1, null], null)` | `true` | `true` | 1 |
| `Filter(null, x => true)`, `Map(null, x => x)`, `Find(null, x => true)`, `Every(null, x => false)`, `Some(null, x => true)`, `Reduce(null, 0, (acc, i) => acc + i)` | `[]`, `[]`, `null`, `true`, `false`, `0` | `null`, each | 1 |
| `Map([1, null], x => x + 1)` | `[2, 1]` | `[2, null]` | 1 |
| `Filter([1, null], x => x > 0)`, `Every([1, null], x => x > 0)` | `[1]`, `false` | `[1]`, `false` (a predicate's no value does not hold) | 1 |
| `Reduce([1, 2], null, (acc, i) => acc + i)` | compile error `unknown_type` | `null`; compiles, warns `implicit_any_cast` on `acc + i` (8) | 3 |
| `Length()`, `Upper()`, `Round()` (a required input left out, `missing_op_input`) | `0`, `""`, `0` | `null`, each: the placeholder is `null` for every type, and the warning says so | 3 |
| `Concat()` (a variadic left out) | `[]` | `[]` | 3 |
| `$a.length` with `a: any` holding `[1, 2]` | `2` (JavaScript's own field) | `null`: a list has no fields | 1 |
| `Map(["1e999"], (n~: number) => n)` | `[Infinity]` | `[null]`: `Convert.toNumber` gives `null` for a number that is not finite | 2 |
| `null ?? 5` (its type) | `null` | `any` | 1 |
| `[1, null]` (its type) | `any[]` | `number[]` | 3 |
| `Average([1, null]) + 1` | `1.5`, warns `implicit_any_cast` | `2`, no warning | 3 |
| `[null]`, `[null, null]` | `any[]` | `any[]` | 3 |
| `[x => x, null]` | `function_in_mixed_list` | the same | 3 |
| `null as number`, `"5" as number` | `null`, `null` | the same | 1 |
| `Upper($a)` with `a: any` holding `5` | `"5"`, warns | `null`, warns (12A) | 1 |
| `$a + 1` with `a` holding `"abc"` | `"0abc1"`, warns | `null`, warns (12A) | 1 |
| `If($b, 1, 2)` with `b` holding `null` | `2` | `null` | 1 |
| `$a.name` with `a: any` holding `5`, or `{ x: 1 }` | throws `invalid_field_access` | `null`, and the checker warns `field_access_on_any` | 1, 3 |
| `$a.name` with `a` holding `null`, or `{ name: "x" }` | `null`, `"x"` | the same, and the warning | 1, 3 |
| `$a.x` with `a` holding `{ x: undefined }` | `undefined` | `null` | 1 |
| `$n.z` with `n: number` | warns `field_access_on_primitive`, throws | warns, `null` | 1 |
| `$p.z` with `p: Pair` lacking `z` | compile error `unknown_field` | the same | — |
| `$p.n` with `p` holding `null`, or `{ n: null, m: 1 }` | `null`, `null` | the same | 1 |
| A host op returning `[1, NaN, -0, Infinity]` | arrives untouched | `[1, null, 0, null]` | 2 |
| A host op returning `{ n: NaN, m: 1 }` | arrives untouched | `{ n: null, m: 1 }` | 2 |
| A host op returning `NaN` | `null` | `null` | 2 |
| `setInput("a", NaN)` on `a: any`, and `[1, NaN]`, and `{ x: NaN }` | arrive untouched; `$a == $a` is `false` | `null`, `[1, null]`, `{ x: null }`; `$a == $a` is `true` | 2 |
| `setInput("n", NaN)` on `n: number` | `value_does_not_fit`, nothing moves | `null` (4B) | 2 |
| `runtime.updateInputs({ g: NaN })` on `g: number` | throws | `null` | 2 |
| `setInput("n", null)` on `n: number` | `null` | `null` | — |
| `setInput("n", undefined)`, on `n: number` or `a: any` | admitted, then `input_not_set` stops every output, stale | `null` | 2 |
| A host op with `convert` on `number`, on `boolean`, handed `null` | `null`, `false` | `null`, `false` (`Convert`'s own answers) | 1 |

**Costs**, measured on 0.7.1 (the runner, every input changed):

| Measured | ns |
| --- | --- |
| One op call (4-op and 39-op programs agree) | about 1570 |
| One `=== null` comparison | 3.5 |
| A second loop over two declared inputs (refused: the check sits in the loop that runs already) | 82 |
| Precomputed keys per op (refused: not needed) | 17 |
| The kind of a declared type, a primitive name (no lookup) | 4.0 |
| The kind of a host type: a struct, an opaque handle, one `extends` level, two levels | 32, 30, 45, 62 |
| The `NaN` walk, per clean number item in a list of 1000 | 4.0 |
| The walk, per struct of four fields | 46 |
| The walk, one scalar | 3.5 |
| The walk, 1000 numbers with one `NaN` (a copy) | 12 300 |

**Two findings outside the scope**, from the same probes: a binding is recomputed once per
reference when its input changed (0.8.1, below), and `Reduce([1, 2], null, …)` fails to
compile with `unknown_type` (fixed in 0.8.0, row 8). The samples probe ran on 0.7.1 source on
2026-10-15: 35 samples, none throws, none fails; its file waits in the chat's scratchpad for
the run after the code lands.

**The commits**, as the plan has them: 0 the notes and the samples' "before"; 1 the rule in
the evaluator (one function, `receive`), the stdlib under it, the convention rewritten; 2 the
`NaN` doors (`clean`, `finiteCheck: false`, the push door, `Convert.toNumber` finite); 3 the analyser
(`[1, null]`, `field_access_on_any`, `Reduce`'s accumulator, `castsAny` without `null`, the
missing-input placeholder `null` for every type); 4 `assertSavedPorts` out; 5 the docs with
the "No value" box on both Host developers pages, the changelogs, the versions, the lockfile.
Then the release.

---

## 0.8.1 and 0.8.2 — further items, each to discuss for its need and its options

Seven suggestions from the handoff of 2026-10-14, parked here by the maintainer ("add them all
to a 0.8.2/1, depending on what it touches, as a further discuss the need and options"). None
is decided. Each row says what it touches, which patch it would ride, and the one thing that
cannot wait: three are bound to 0.8.0's plan by their nature, and the row says what is left
for the patch.

| Suggestion | Touches | Release | The need and the options to discuss |
| --- | --- | --- | --- |
| **Remove `assertSavedPorts`** | Core's public surface (`serialise.ts`, `index.ts`) | **0.8.0** (decided 2026-10-14, 6a A) | 0.7.1 deprecated it "until a minor removes it". Need: one fewer export with two ways to say one thing. Options: 0.8.0 (one breaking line more on a release that has many), or 0.9.0 (a release of its own for one line) |
| **Rewrite the "`null`, both ways" convention** | `CLAUDE.md` "Conventions", *The type system* page | **0.8.0, the commit that changes the code** (decided 2026-10-14, 6b A: in place, so the rules file is true at every commit); the page in 0.8.0's docs pass | It states the rule option B replaces. Need: a rules file that is true. Options: rewrite in place, or a dated line that says what changed and when |
| **Run every sample on the site before and after** | `apps/docs` (the samples, `content.test.ts`), the ops' examples | **0.8.0, once** (decided 2026-10-14, 6c): a one-off probe, run on 0.7.1 source on 2026-10-15 (35 samples, the file in the chat's scratchpad) and again before the docs pass; no pinning test | `content.test.ts` checks that a sample loads, not what it gives. Need: prose beside a moved result must not lie. Options: a one-off probe for the release, or a test that pins each sample's outputs so a later change shows |
| **How the editor shows a `null` output** | The editor's outputs pane | 0.8.2 (an editor patch) | Under option B a null output is ordinary, and the pane prints JSON, so `null` beside a number reads as a fault. Options: print "no value" in a muted style, print `null` as the language writes it, or leave it, with the docs saying what it means |
| **Measure the rule's cost** | `evaluator.ts`, the probe | **Settled 2026-10-14**: 3.5 ns per input, inside the loop that already runs, against about 1570 ns per op call; a host type's kind 30 to 62 ns. Nothing is left | One check per declared input per op call, on the hot path. Need: a number before the design. Options, if it is bad: check only inputs that name a type, or precompute per op which inputs to check |
| **Name the host's "no `NaN`" mark for what it promises** | `registry.ts`, *Extending the language* | **Decided 2026-10-14: `finite: true`, renamed `finiteCheck: false` on 2026-10-15** (the check is on by default, `false` turns it off; 3A) | Options: `finite` (says the promise), `pure`, `trusted` (do not). Its default is off. What is left for a patch: nothing; a rename after is a break |
| **`If(null, a, b)` reads no branch** | `stdlib/control.ts`, the lazy tests | **0.8.0**: the rule skips the op before any thunk is read, one test pins it | The lazy input makes it free. Need: the one case where a null condition must evaluate no side, pinned so it stays |

---

## Core — a binding is recomputed once per reference

**What:** found 2026-10-14 by the probes of the 0.8.0 plan. A binding that depends on an input
that changed is recomputed once per reference within one evaluation, on every path (`run`,
the runner, the instance): `let t = Tick($n)` read three times calls the host op `Tick` three
times; read inside a `Map` body over five items, five times. When nothing changed, zero. The
docs promise the opposite in four places (*Evaluation* "A binding is computed once per
evaluation", *Glossary*, *How a program runs*, *Bindings and outputs*), and `CLAUDE.md` says
"evaluated at most once".

**Why:** `isCached(node, cache, dependsOn, changedInputs)` answers "not cached" whenever the
node depends on a changed input, with no notion of "computed in this traversal". So the first
reference computes and caches, and the second reference finds the entry, sees the dependency
on a changed input, and computes again. Results are right; the work repeats. A host op with a
side effect or a cost (a tally lookup, for Beacon) runs once per reference, and
`let limit = Max($data)` inside `Filter($data, x => x > limit)` computes `Max` once per item.

**When: 0.8.1** (the maintainer, 2026-10-14: 7B, "in todo as it has a timeframe"). 0.8.0's
changelog carries a "Known" line so the docs' promise is not silently false for a release.

**What it requires:** about eight lines and two tests. A `computed: WeakSet<object>` on
`EvalContext`, made per traversal in `evaluate` and `evaluateProgram`; in the `ref` case and
in `memoise`, a node in `computed` is a hit before `isCached` is asked, and a node is added
after it is computed (a closure is not cached, as today); a hit in `bodyScope` is always
valid, since that cache is fresh per application, so `memoise` asks `isCached` only for
`nodeCache`. Tests: the three-reference program calls `Tick` once per run, and the `Map` body
case once, with the counting host op of the lazy tests. Then the "Known" line closes and the
four docs sentences are true.

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
