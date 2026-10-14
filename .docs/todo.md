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
| 0.7.0, next | `??` and `c ? a : b`, a lazy `If`, `AnalysisContext` out of the public surface, a better sentence for a call to a name that is no op. A minor for all three packages, because removing an export breaks | below |
| 0.7.1 | **A saved program that is not well formed is reported, never thrown** (the maintainer, 2026-10-12: "Do it in 0.7.1"). A patch: it breaks nothing | `backlog.md`, "Core — a saved program that is not well formed" |
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

## 0.7.0 — `??`, `c ? a : b`, a lazy `If`, and two small things

**This is the next work, and it starts with a plan** (the maintainer, 2026-10-12: "0.7.0 will
be done in a next chat"). A minor for core, the editor and the link together: one of its items
removes an export, and a minor of core forces a release of both others.

**What it holds, as decided between 2026-10-10 and 2026-10-12:**

| Item | Decided | Left for the plan |
| --- | --- | --- |
| `??`, sugar over `Default` | Yes, and not `\|\|` (below) | **Decided 2026-10-13**, below: the tier |
| `c ? a : b`, sugar over `If` | Yes | **Decided 2026-10-13**, below: C's grammar, the tier, the chain, how a symbol reaches the lexer |
| A lazy `If` | Yes, in this release, so that `c ? a : b` never ships eager | **Decided 2026-10-13**, below: a lazy input, declared on the input, handed over as a `Thunk`. `If`, `Default`, `And` and `Or` use it to skip work. **Results do not change in 0.7.0**, with one stated exception (below): the three-valued `And` and `Or`, and every other change of "no value", come with the minor after 0.7 (the last section of this file) |
| `AnalysisContext` leaves the public surface | Yes ("it should be removed, probably in the next release") | **Confirmed 2026-10-13**: export the result and diagnostic types by name (`backlog.md`, "Core — `AnalysisContext` is public") |
| A call to a name that is no op | Keep the kind `undeclared_binding_reference`; name the nearest op or binding | **Decided 2026-10-13**, below: the sentence, and the same help for a plain reference, an input and a field |
| A saved program that is not well formed | **Not in 0.7.0: it is 0.7.1** (the maintainer, 2026-10-12) | Nothing here (`backlog.md`, "Core — a saved program that is not well formed") |

The docs are part of the plan, as for every release: the operators page, the reference of
`Default` and `If`, *Every diagnostic*, the changelogs with the breaking line for
`AnalysisContext`.

### Decided on 2026-10-13: the base of the plan

**Status: locked as the starting point. Tweaking continues, and the plan needs a full
go-ahead from the maintainer before any code is written** (the maintainer, 2026-10-13: "Lock
this in as a base, and lets keep tweaking it"). Each row below is a decision of that day, with
what was probed for it. Every probe ran on core 0.6.0 and was deleted afterwards.

| Decision | What was decided | Probed, measured, or compared |
| --- | --- | --- |
| **The tier of `??`** (1A) | `BP.COALESCE`, below `\|\|` and above `? :`, as C#, PHP and JS have it. So `$x ?? 0 > 5` is `$x ?? (0 > 5)`, and a default before arithmetic takes brackets: `($x ?? 0) + 1`. Swift and Kotlin put it above comparison; C++ and Java have no `??` (`value_or`, `Optional.orElse`) | The docs show the brackets |
| **`c ? a : b` follows C's grammar** | `logical-OR ? expression : conditional-expression`: the then branch reads at power 0 and ends at `:` (which is no operator, so a lambda body, a named argument `f(x: 1)` and a typed parameter `(x: number) => x` inside it all read), the else branch reads just below `?`, so `a ? b : c ? d : e` chains to the right. One consequence, stated in the docs: `c ? a : x => x` needs brackets, `c ? a : (x => x)`; Java and JS take it bare, C has no lambda. PHP 8 refuses the chain without brackets and that is not copied | Probed: a function in a branch is refused today, `op_input_type_mismatch` ("a function is never `any`" and the branches are `any`), so `If`, `?:` and `??` take no function until the union-types work types the branches from each other. A docs line, not 0.7.0's work |
| **The ladder in twenties** (2B, "make sure there is enough space") | `ARROW` 20, `CONDITIONAL` 40, `COALESCE` 60, `OR` 80, `AND` 100, `EQUALITY` 120, `COMPARE` 140, `ADD` 160, `MULTIPLY` 180, `PREFIX` 200, `CAST` 220, `MEMBER` 240, `CALL` 260. A breaking line in the changelog for a host that wrote a raw number | Checked: no package or page reads a `BP` number, only the names |
| **The lexer learns its symbols from the grammar's maps** (3D, with the guard) | `grammar.symbols` goes. `symbolsOf(grammar)` derives the symbols from the keys of `nuds` and `leds` when `parseSource` and the editor tokenise, skipping what the lexer owns (the five token kinds, the structural punctuation, the two arrows, exported as one set from `lexer.ts`). `registerLed` and `registerNud` refuse a word that is none of those at registration ("'as' is a word; use registerWordLed"), which `registerInfix` says today and `registerLed("as", …)` did not. `registerInfix` and `registerPrefix` lose their own `symbols.add`. The ternary is then `lang.registerLed("?", { bp: BP.CONDITIONAL, parse })` from `control.ts`, beside `registerInfix("??", …)`. The editor's `tokens.ts` changes two lines (the call at 88 and the `has` at 134); `mergeGrammar` and `createGrammar` lose one line each | Compared: a new `registerOperator(token, led)` (Crockford's `symbol()` with the led; keeps the trap for `registerLed`), a stored set filled at registration (B': the same rule at write time, one file, keeps derived state), a separate `registerSymbol` (two calls, one forgettable), maximal-munch lexing as Haskell and Swift do (`$x>-1` lexes as `>-`: refused). The recompute per tokenise is about twenty keys through a set: not a cost |
| **The lazy op: X-derived** (after C3, X, X-merged and `evaluateLazy` were compared and probed) | `lazy?: true` on `OpInput`, beside `convert`, `required` and `variadic`: the same config as every input. `resolveInputs` hands a lazy input over as a `Thunk` (a variadic one as a `Thunk[]`), a class of five lines with a `.value` getter that evaluates the memoised node, converting a `~` input inside. `registerOp` returns its definition with its literal types kept; `EvaluatorDefinition.op` takes the definition as well as the name, and the evaluator's inputs are then typed by the lazy keys of that definition (`then: Thunk`, `nodes: Thunk[]`, every strict key `unknown` as today); the string form `op: "Add"` is unchanged. `OpDefinition.inputs` becomes `readonly`. The pass that reads every op's result refuses a returned `Thunk`. `If`, `Default`, `And` and `Or` are declared so and written `condition ? then.value : e.value` and `nodes.every((n) => n.value)`. The reference prints `then: lazy any` (the mark on the type, `CLAUDE.md` "Conventions"). No `force`, no mark in the name, no new diagnostic: a name cannot be wrong when the flag sits on the input. Three tests: a type-level test file that holds each line of the typing (including that an op by name keeps `unknown` inputs, a hole found by a probe and closed with a default on the type parameter), a throwing branch not taken per lazy op, and the `?:` and `??` sugar in the parser tests. **The one visible change of 0.7.0**: a run error in a branch not taken no longer stops every output; said as a fix in the changelog | Measured: a thunk made and forced is 12 ns against 1.3 ns for a value; a whole `If` run is 888 ns today (399 ns for a plain output, about 360 ns per `+ 1` in a branch), so two thunks add about 5 % and a skipped branch repays them at once. Probed with tsc: every mistake an author can make under `force`, under a cast and under a plain-function thunk compiles clean, so compile-time safety exists only where the declaration is in source the compiler reads; under X-derived three of five mistakes fail to compile and none is silent. Getters on the inputs object (`inputs.then` evaluating on read) were measured and refused: destructuring reads every getter at once, so the op turns eager silently, and every stdlib op destructures; the generic forms cost 475 to 1673 ns, and only a hand-written class per op reaches the thunk's 15 ns |
| **Where a lazy type is NOT** | Not a kind of `Type` (`lazy T` beside `T[]`): no value ever has it, a program cannot write it, a port cannot carry it, and every switch over a type would read it for one bit the flag carries (`backlog.md`, "Language — thunks as values"). Not a lazy lambda parameter: no consumer (same entry) | The three levels compared: the flag (1), a derived type on op inputs only (2: the cost of 3 with the power of 1, never the right stop), thunks as values (3: the course's language, open for a consumer) |
| **The callee that is no op** (5, option B) | The kind stays. The sentence: "No operation or binding exists by the name 'Lenght'. Did you mean 'Length'?" for a call, "No binding exists by the name 'totl'. Did you mean 'total'?" for a plain reference, and the same "Did you mean" appended for an input (`unknown_program_input`) and a field (`unknown_field`). One helper: the nearest name by edit distance, at most two edits, over the ops and the bindings in scope for a call, the bindings and the lambda parameters for a reference, the declared inputs, the struct's fields. The `app` case checks an undeclared callee before analysing it | |
| **`AnalysisContext` out** (6) | `export *` of the analyser's types becomes named exports of the result, error and warning types and the two kinds. The readme line. The breaking line in core's changelog. The peer ranges of the editor and the link move to `^0.7.0` | Checked: no file outside core's analyser reads it |

**The commits the plan holds**, in order: (1) the ladder in twenties, `symbolsOf` and the guard, `??` and `? :` in `control.ts`, the lexer and parser tests, the editor's two lines; (2) `Thunk`, `lazy` on the input, the typed `op`, the four ops, the three tests; (3) the nearest-name helper and the four sentences; (4) `AnalysisContext` out, the readme; (5) the docs: the operators page (two rows, a paragraph on precedence and the two bracket cases), `If`'s description ("Only the branch taken is evaluated"), the reference's `lazy` mark and its legend line, *Extending the language* (a lazy input on a host's op, with the `Guard` sample), *Every diagnostic* (the new sentences), the three changelogs, the backlog entry on `If` closed to `done.md`.

**Decided on 2026-10-14: the go, and what the plan's reviews changed.** The maintainer gave
the go for 0.7.0 as it stands above, with the gaps the repo showed folded in. The plan itself
(revision 7, after seven review passes and three independent reviews from other chats) is the
chat's working document; what it changed in the base, each row with its reason:

| What | Decided | Why |
| --- | --- | --- |
| Seven more readers of `grammar.symbols` | Move to `symbolsOf` in commit 1: the four examples in `packages/core/examples/3-(code)/` (typechecked, `tsconfig` includes them), `parser.test.ts` (three lines), `stdlib/index.test.ts` | The handoff listed `language.ts`, `index.ts` and the editor's `tokens.ts` only |
| The backtick | The set the lexer owns holds it, beside the token kinds, the structural punctuation and the two arrows | The template nud is keyed on it (`string.ts`), so `symbolsOf` would list it as a symbol. The lexer reads it before the operators, as it reads `"` |
| `registerEvaluator` with a definition as `op` | Stores `{ ...def, op: name }`, so the map keeps `op: string` | `extendLanguage`, `validateDescriptor` (`orphan_evaluator`) and the link read `op` as a string; one normalisation at the door instead of a branch in each |
| The type-level file | `language/lazy.test-d.ts`: `tsconfig` includes `src/**/*`, vitest runs `*.test.ts` only, so `yarn typecheck` reads it and nothing runs it. `Record<never, never>`, not `{}` (`no-empty-object-type` is in the lint set) | It exercises `registerOp`, `registerEvaluator` and the lazy keys, not the class |
| An optional lazy input | Typed `Thunk \| undefined` | An absent optional input has no key in `node.inputs`, so the evaluator sees `undefined` |
| The callee that is no op: the pre-check | "Declared nowhere": not a lambda parameter, not in `declarationIndex`, not an op | A forward reference and a failed binding fall through to the `ref` path, which reports them as today; an `ast`-form app whose callee names an op would otherwise be told to mean its own name |
| A reference to a cycle member | The `ref` case returns the error node for a failed binding before the undeclared report. A fix in the changelog | A cycle member is failed but never analysed, so today it gets `undeclared_binding_reference` as a second error. The outputs do not change: reachability drops them first |
| The two undeclared sentences | One helper, `reportUndeclared`, with the noun phrase as a parameter | Duplicate Code |
| `nearest` | Its own `analyser/nearest.ts` and test; distance at most two, at most one for a name of four letters or fewer; ties by order, ops before bindings before locals for a call | `analyser.ts` is 1286 lines; `m` must not hint `n`; the sentence must not flip between runs |
| The reference's signature | Assembled per input in `apps/docs/src/components/ops.ts`, with a test, as `diagnostics.ts` sits beside its component | In one `sourceHtml` string, `any` after `lazy` is not a type position and loses its colour |
| `?` in `separator?` | Becomes a symbol token, coloured as one | It was an unknown character, printed plain; the editor test that asserts so flips in commit 1 |
| The 0.7.0 record in `done.md` | Written after the release, dated, as every release record is | Commit 5 closes the three backlog entries only (`If` evaluates both branches, `AnalysisContext` is public, a call to a name that is no op) |
| *Extending the language* | One sentence: read a thunk during the call | A thunk kept for later reads a traversal that is gone; the same trust as a host op returning no `NaN` |

**0.7.1 was decided the same day**: the fix at the door, and a layer of a bad shape refused
inside `composeLayers` (`backlog.md`, "Core — a saved program that is not well formed").

**The entry as it stood before those decisions**, kept for its probes:

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
