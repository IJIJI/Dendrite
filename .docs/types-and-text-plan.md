# Types and text — plan

Approved 2026-09-22, as revision 4, after four review passes and two independent reviews. The
decisions came from the discussion of 2026-09-21 and 22; the reasoning behind each one is in
`todo.md` ("binding annotations and a safe cast") and `done.md` ("do we want implicit casting?").
Milestone 0, the 0.3.0 release, is done (`done.md`). The rest is worked in order, one commit at a
time, and each finished milestone is recorded in `done.md`.

## Context

The `any` warning is now louder, and a program author has no answer to it. This plan gives the
author three tools: **state** a type (an annotation), **check** a type (a safe cast), and **make
text** (a template). It also removes two accidents: list ops that throw on `null`, and an op
input that cannot say "I convert".

Each open detail appears as a **stated default**. Correct it in this file.

## Decisions

| Topic | Decision |
|---|---|
| Release | **0.3.0 now**, with what is on `dev`. **0.4.0** after this plan. |
| Binding annotation | `let rows: number[] = $rows`. On `let` only. It states a type. It has no runtime check. |
| The warning on an annotation | **Stays** when the source is `any`. Its message names the fix: `as`. |
| Safe cast | `$rows as number[]` gives the value, or **`null`** when it does not fit. Never `[]`: an empty list is a valid list, so `[]` would hide the misfit from `IsSet` and `Default`. |
| A cast that can never fit | A **warning**, not an error: the cast is pointless, not broken. |
| `valueFits` | Checks the **shape and the rules** (the zod `schema` of the type and of each ancestor). |
| Boundary validation | **Not in this plan.** First item after the 0.4.0 release. It reuses `valueFits`. |
| `null` in a list op | A stdlib list op reads each value that is not a list as `[]`: `Array.isArray(value) ? value : []`. No list op throws. (The maintainer's decision, 2026-09-22.) |
| Implicit casting | **None by type.** The analyser never inserts a node. |
| Cast to boolean | **No.** `ToBool` stays explicit. `If` stays strict. |
| `convert` flag | **Stays** (the maintainer's decision, as the foundation for `(t~: string)`). `convert: true` on an op input of type `string`, `number`, `boolean`, or a list of those. The outer shape must match. A leaf takes any data, a list included (it becomes its JSON text). A value with no conversion rule gives `null` (`"abc"` to a number). |
| Who uses the flag | In the stdlib, **`Join` only**: `parts~: string[]`. |
| `Convert` | Core exports `Convert.toString`, `Convert.toNumber`, `Convert.toBool`. The ops call them. |
| Template | Backticks, holes as **`{…}`**. It becomes a plain `Join([…])`. No special case for holes. |
| Reference mark | `name~: type`, plus a generated sentence below the signature. |
| Where grammar goes | A core node (`as`) goes in `installCoreGrammar`. Sugar over an op (a template) goes in the stdlib. |

## Rules for each feature commit

- The commit adds its entry to `Unreleased` in the changelog of each package it changes.
- Each new diagnostic gets a registry entry with an example:

| Diagnostic | Level | Milestone | Example form |
|---|---|---|---|
| `unknown_type` (new meaning) | error | B.1 | `den` |
| `binding_type_mismatch` | error | B.1 | `den` |
| `cast_to_function` | error | C.3 | `den` |
| `cast_never_fits` | warning | C.3 | `den` |
| `invalid_convert_input` | thrown when the language composes | K.2 | none. It is an `AnalysisErrorKind`, so the registry entry is mandatory (`diagnostics.ts:555`). It follows `orphan_evaluator`: stage `"ports"`, a `triggeredBy` note, no example. |
| `unterminated_template` | error | T.1 | `serialiseSource("…")` |
| `dollar_before_hole` | warning | T.1 | `serialiseSource("…")` |

B.0 renames the old `unknown_type` to `unknown_port_type`. It keeps its stage, its message and
its example. The name `unknown_type` then goes to the program error, as the pair of `unknown_op`.

`den` is a JavaScript template literal. It cannot hold a Dendrite backtick, and `${` starts a
JavaScript interpolation. So the two template entries use a plain string.

## Milestone 0: release 0.3.0

**Done 2026-09-22** (`done.md`).

| # | Commit | Files |
|---|---|---|
| 0.1 | Versions to 0.3.0, peer ranges to `^0.3.0`, `Unreleased` to `0.3.0` | three `package.json`, three `CHANGELOG.md`, `host/installation.md`, `yarn.lock` |

Then the maintainer: PR, three tags on `main`, one GitHub release on the core tag, three approvals (core
first). I check the result as for 0.2.0. **A good PR point.**

## Milestone R: records

| # | Commit | Content |
|---|---|---|
| R.1 | Record each decision above | See the list. |

- This plan goes in the repo as `.docs/types-and-text-plan.md`, as `release-plan.md` does. `.docs` has no `types-and-text.md` today.
- `todo.md`: a link to this plan. Then, for the release after 0.4.0: boundary validation (first), `++`, a converting lambda parameter, an optional lambda parameter.
- `todo.md`, after this plan: **look at strings as lists in some places**, such as `Includes("abc", "a")` and `Length("abc")`. The backlog entry "strings and arrays, interchangeable" MOVES there, with the note that N.1 ends the accident that made these calls work through `any`.
- The boundary-validation entry gets an open question: does a missing struct field fit? Today the cast says no (V.1), and a read throws (N.2). To relax both is not a breaking change.
- `backlog.md`, new: `If` evaluates both branches, so it cannot guard a read.
- `backlog.md`, new: a type defines its own text form, a flag struct, `+` on text, smart values (rejected, with the reason), **a return type on a lambda** (was B.2).
- `backlog.md`, changed: the implicit-casting entry closes with the decision. The struct-literal entry records that a `{…}` hole then needs brace depth.
- The template entry moves to the todo with the new hole syntax.
- `.docs/CLAUDE.md`: the package table says 0.3.0 when I have verified the release.

## Milestone N: `null` does not throw

**Problem:** `Length(null)`, `Average(null)`, `Includes(null, 1)` and `Filter(null, …)` throw. A field read on `null` throws too.

| # | Commit | Files |
|---|---|---|
| N.1 | `const toList = (value) => (Array.isArray(value) ? value : [])`, beside `toText`. Tests for each op. Docs: see below. | `stdlib/index.ts`, `evaluator.test.ts`, core `CHANGELOG.md`, `learn/writing/types.mdx` |
| N.2 | A field read on `null` gives `null`: one line in the `field` case of `evalNode` (`evaluator.ts:147`). A read of a missing field still throws `invalid_field_access`. | `evaluator/evaluator.ts`, `evaluator.test.ts`, core `CHANGELOG.md`, `learn/writing/types.mdx` |

- **Measured by the second review, and verified:** `Find($buses, b => b.id == 9).name` throws when no bus matches, in a well-typed program. `If(IsSet(found), found.name, "none")` throws too, because `If` evaluates both branches (`stdlib/index.ts:534`). A program has no guard.
- **Decided 2026-09-22:** `null` gives `null`. A missing field stays an error until boundary validation decides it (R.1). To relax it later is not a breaking change.
- **Measured:** 12 evaluators cast `(list as unknown[])`. Each one calls `toList` instead. `Join` has this guard today (`stdlib/index.ts:758`), so it calls `toList` too. 13 callers, one rule.
- `Concat` guards each member: `arrays.map(toList).flat()`. `[null, [1]].flat()` keeps the `null`.
- **Behaviour that changes, through `any`, or through a host value of the wrong type:** `Length(5)` goes from `undefined` to `0`. `Average(5)` goes from a throw to `0`. `Length("abc")` goes from `3` to `0`, and `Includes("abc", "a")` from `true` to `false`. The two string results were accidents. The changelog records each one.
- **Docs:** the paragraph at `types.mdx:67` is written again. It says `length` shows `undefined` for a number, and that becomes false. The lesson stays: `any` gives a wrong answer with no warning (`0`). Also one sentence under "`null` goes anywhere".
- **Smell avoided:** Duplicate Code (one guard per op).
- **Rejected:** the guard in the evaluator, for each input with a list type. It is a conversion by type.

## Milestone B: a binding annotation

| # | Commit | Content |
|---|---|---|
| B.0 | Rename `unknown_type` to `unknown_port_type`. A pure rename, with no new behaviour. | `analyser/analyser.ts`, `analyser/types.ts`, `compose.ts`, `diagnostics.ts`, `analyser.test.ts`, `compose.test.ts`, `how-it-works/ports-and-layers.md`, `.docs/analyser-spec.md`, core `CHANGELOG.md` |
| B.1 | `let name: Type = expr` | See the list. |

- **Why two commits:** a name must not change its meaning inside one commit. After B.0 the gates pass and no `unknown_type` exists. B.1 adds it again, in `AnalysisErrorKind` only, not in `PortProblem["kind"]`.
- **Changelog, breaking:** "`unknown_type` now means a type name in a program. The port problem is `unknown_port_type`."
- The two finished plans in `.docs` keep the old name. They are history.
- **The name survives X.1:** `Ports` is the record of a layer, whatever name the stage gets.

**B.1 in detail:**

1. `parseBinding` reads an optional `: Type` with the existing `parseType` (`core-grammar.ts:158`). On `output` it is a syntax error.
2. `RawProgram` gets `annotations?: Map<string, Type>`. The saved `ast` form gets `annotations?: Record<string, Type>`. The key is written only when it has content, as `portsKey` does. No version change.
3. `analyseBindings` checks the inferred type against the annotation with `checkCompat`. New error `binding_type_mismatch`. The check runs inside the error window of `analyseBindings`, before line 958, so step 5 needs no new code.
4. The `ref` case (`analyser.ts:461`) reads `ctx.annotations.get(name) ?? getOutputType(binding)`. One line. The CNode of the binding does not change. (`getOutputType` reads the element type on a list node, so "set the type on the CNode" is not one assignment.)
5. A binding with `binding_type_mismatch` is a **failed binding**, as for each other error (`analyser.ts:958`). A `ref` to it reports nothing more, and an output that depends on it drops. No special case: a program with errors can still run its other outputs, so a value of the wrong type must not flow on.
6. The "use `as`" hint goes in the message **of an annotation only**. The registry entry of `implicit_any_cast` names `as` as the fix for each case. The ten tests that pin the message stay.
7. **A type name in a program must be registered.** Nothing checks this today. `collectTypeNames` (`analyser.ts:651`) walks a `Type`, and one helper reports `unknown_type` for each name that `descriptor.types` does not have. Three sites call it: a lambda (its parameters and its `returnType`, which a saved `ast` program can carry), a binding annotation, and a cast target (C.2). The analyser has the composed descriptor, so a layer type such as `Bus` is known. The parser cannot do this check, because it has the vocabulary only. A `Type` has no source span, so the underline goes on the binding name, the lambda, or the cast node.

- **Measured by the second review:** `let f = (n: nubmer) => n`, then `f(1)`, gives `app_argument_type_mismatch` with "expected 'nubmer'". No message says that the type does not exist. Without step 7, `$x as nubmer` gives no message, because `any` fits each name.
- **Behaviour that changes:** `(n: nubmer) => 1` with an `any` argument compiles today with a warning. After step 7 it is an error. The changelog records it.

- **Smell, accepted:** `annotations` beside `bindings` is a mild Data Clump. The fix is `Map<string, { node, type }>`: Shotgun Surgery on 12 sites and a change of the saved format.
- **Ceiling:** an annotation does not give types to the parameters of an untyped lambda.
- **Cut:** B.2, the return type on a lambda. It has no named need. It goes to the backlog (R.1).

## Milestone V: `valueFits`

| # | Commit | Content |
|---|---|---|
| V.1 | `valueFits(value, type, descriptor): boolean`, in `infra/` | See the table. Unit tests for each row. Not exported from the package yet. |

| Type | Rule |
|---|---|
| `any` | fits |
| `null` value | fits each type, as in the static rule |
| a named type | Walk the `extends` chain, and apply each `schema`. `string`, `number` and `boolean` carry a zod schema (`language.ts:93`), so no `typeof` check is necessary. |
| `T[]` | a list, and each item fits `T` |
| a named struct | a value that is not an object never fits. Each declared field must be present, and its value can be `null`. Each present field fits its type. **Extra fields fit.** With N.2, a read after a cast never throws. |
| a named type with no `fields` and no `schema` | fits. There is nothing to check. |
| a function type | cannot be checked. The cast refuses it (milestone C). |
| a name that is not in the descriptor | does not fit, and `valueFits` does not throw. The analyser refuses the name first (B.1 step 7), so an analysed program does not reach this row. |

- **Fact (measured by the second review, zod 4.4.3):** `z.number()` refuses `NaN` and `Infinity`. So `NaN as number` and `Infinity as number` give `null`. A test pins both. Only a host input can hold one: `Divide` by zero gives `0`.
- **Fact:** only a type on the LANGUAGE has a `schema`. A layer type gets one through `extends`.
- **Not a smell:** a `switch` on `type.kind` is over a closed union. A Visitor is over-engineering.

## Milestone C: the safe cast

| # | Commit | Content |
|---|---|---|
| C.1 | Word-leds in the Pratt kernel | `keyOf` gives each identifier the key `"ident"`, so a led for `as` would run for every identifier. The grammar gets `wordLeds: Map<string, Led>` and `registerWordLed`. The precedent is `grammar.statements`. The Pratt loop reads `wordLeds` when the next token is an identifier. |
| C.2 | The `cast` node | A new node kind (a type is not a value, so `as` cannot be an op call). `installCoreGrammar` registers `as`. The result type is the target type. The analyser checks the target with the `unknown_type` helper (B.1 step 7). The evaluator returns the value when `valueFits` holds, else `null`. |
| C.3 | Diagnostics and editor | Warning `cast_never_fits` when neither type is compatible with the other. Error `cast_to_function`. `unknown_type` comes first, and `cast_never_fits` stays quiet for that cast. The editor's `typePositions` learns "after `as`". `as` gets the `keyword` class: `tokens.ts:111` reads `wordLeds` beside `statements`. **A guard at registration (added 2026-09-23):** `registerWordLed` refuses a word that is not an identifier, and `registerInfix`/`registerPrefix` refuse an identifier-shaped token and name `registerWordLed`. Each is a handler that would never fire, because the kernel consults each map for one token kind only (the lexer scans letters as an identifier before it reads the operator list). One test per direction. `registerLed("ident", …)` stays legal: a host may want a led over every name. |

**C.2 touches these sites.** Shotgun Surgery, inherent in a new node kind.

| Site | Found by |
|---|---|
| `infra/nodes.ts`, `AST_NODE_KINDS` | the `_AllKindsListed` compile check |
| `analyseNode`, `evalNode`, `getOutputType` (`analyser.ts:78`) | the exhaustive `switch` |
| `show` in `examples/3-(code)/2-parser.ts` | the compiler |
| `collectRefs` (the reference graph) | **silent today.** It gets `default: n satisfies never`, so each later node kind is a compile error. Test: `let a = b as number` orders `b` first. |
| `assertNode` in `serialise.ts` | **silent.** Test: a cast with a malformed child fails the guard. A cast makes a round trip. |

**Rejected for C.1:** leds keyed by the value of an identifier in the same map. An identifier with the name `number` collides with the token kind `number`.

**Stated default:** `as` binds **tight**: `BP.CAST = 80`, between `PREFIX` and `MEMBER`. Both reviews agree.

| You write | At 45 (TypeScript, C#) | At 80 (Rust) |
|---|---|---|
| `1 + $x as number` | `(1 + $x) as number`. The `+` warns first. | `1 + ($x as number)` |
| `!$on as boolean` | `(!$on) as boolean`. The `!` warns first. | `!($on as boolean)` |
| `$price as number * 2` | `($price as number) * 2` | the same |

**A good PR point:** after C, the author has both answers to the `any` warning.

## Milestone K: `Convert` and the `convert` flag

| # | Commit | Content |
|---|---|---|
| K.1 | The `Convert` namespace | The three rules move from `stdlib/index.ts` to one exported object of three functions. `ToString`, `ToNumber`, `ToBool` call it. |
| K.2 | The flag | See the list. |
| K.3 | The reference | `OpsReference.astro` prints `name~: type` and a generated sentence. The stdlib index explains `~` beside `...` and `?`. **Measured by the second review:** the highlighter needs no change. `sourceParts` prints `~` as plain text, as it prints `?`, and the `string` after `parts~:` gets the `type` class. One test pins the signature of `Join`. |

**K.2 in detail:**

1. `OpInput.convert?: true` in `registry.ts`.
2. **Compose:** `validateDescriptor` refuses the flag on a struct, a function, `any`, a variadic input, or an input with `required: false`. An op belongs to the vocabulary, so this is **not** a `ports` problem. `attribute()` in `compose.ts` throws "Language descriptor is invalid" for an op error. That path exists.
3. **Analyse:** no second compatibility relation. The check is `isCompatible(actual, anyAtLeaves(input.type))`. The `any` warning then stays quiet, and the function guard holds, with no new code.
4. **Evaluate:** `convertTo(value, type)` runs in the `operation` case of `evalNode` (`evaluator.ts:203`), only for an input with the flag. Extract Method: the input loop becomes `resolveInputs`. When the shape is wrong at run time (an `any` that holds `5`), the value passes unchanged, and the guard in the op handles it.
5. `Join` declares `parts: string[]` with the flag. **`Join` loses its `map(toText)`.** The evaluator converts. One owner, no Duplicate Code.

- **Variadic with the flag is refused:** no op needs it (Speculative Generality).
- **Optional with the flag is refused:** `convertTo(undefined)` would make an absent input into `""`, and the op could not see that the input is absent. No op needs it. The mark in `OpsReference.astro:42` then stays one choice: `...`, `?` or `~`.
- **Noted:** `Join` alone does not need the flag, because `any[]` gives the same analysis. The flag stays as the foundation for `(t~: string)`. This is the maintainer's decision, made on purpose.
- **Not a smell:** `convertTo` and `valueFits` look alike and do different work. One converts, one checks.
- **Two tests change on purpose:** `analyser.test.ts:1602` ("a mixed list into Join warns") and `evaluator.test.ts:408` ("a list of numbers is a type error").
- **Stated default:** the `Join(5)` error says "expected 'any[]'", because step 3 checks against `anyAtLeaves`. The reference shows `string[]`. I accept the difference and pin the message with a test. It is the smaller diff.
## Milestone T: templates

| # | Commit | Content |
|---|---|---|
| T.1 | The lexer | See the list. |
| T.2 | The nud | The **stdlib** registers it, because it names `Join`. It reads `string` tokens and holes until the closing backtick, and builds `Join([…parts])`. It does not wrap a hole: `Join` converts its parts. |
| T.3 | Editor and docs plugin | Small. The text parts are `string` tokens, so they get the `string` class today. One line gives the backtick the `string` class. Tests for the editor and for `remark-den`. The language data in `cm.ts:42` gets `closeBrackets: { brackets: ["(", "[", "{", "'", '"', "`"] }`. CodeMirror closes the first five by default (measured by the second review), so a `{` hole closes already. Without the backtick, each new template shows `unterminated_template` while the author types. |

**T.1 in detail:**

1. **No new token kind.** A backtick and the hole braces are `punct` tokens. A text part is a `string` token. The tokens of a hole are ordinary tokens.
2. `scanTemplate` calls the ordinary token scan for a hole, until `}`. The driver loop body becomes `scanToken` (Extract Method). Recursion handles a template in a hole. No mode stack.
3. **No brace depth.** `{` and `}` are not tokens of the language today. Struct literals will change that (recorded in R.1).
4. Escapes: `` \` ``, `\{`, `\$`, and the usual ones.
5. Error `unterminated_template`. The lexer recovers to the end of the source, as for a string.
6. Warning `dollar_before_hole` when `$` comes directly before `{`. `\$` stops the warning, for a text such as a price.

**Stated defaults:** a template can span lines. A hole can contain a template.

**Ceiling:** a lambda in a hole is a type error, and the message names `Join`, which the author did not write.

## Milestone D: documentation

| # | Commit | Pages |
|---|---|---|
| D.1 | *Extending the language*, expanded | The `convert` flag, its consequence (a caller's mistake on that input stays hidden), and the guide: use it freely for text, take care with `number` because it can give `null`. `Convert`. A template cannot go in the `den` tag. |
| D.2 | Learn | *Types in practice*: state a type, check a type. *Operators and symbols*: templates. *The chain*: a template in the Desugar section. The glossary. |

Each earlier milestone also updates the page that its change makes wrong.

## Milestone X: the two renames, then release 0.4.0

| # | Commit | Content |
|---|---|---|
| X.1 | The `"ports"` stage gets one name | Backlog entry "the compose stage has two names". A public type changes. |
| X.2 | The API says "symbol" where the docs do | Backlog entry "the API still says operator". |
| X.3 | Records, then versions to 0.4.0 | As milestone 0. |

**Stated default:** both renames go in 0.4.0, because it is a breaking release already. Remove this milestone for a smaller release.

## Order and size

`0` → `R` → `N` → `B` → `V` → `C` → `K` → `T` → `D` → `X`. **21 commits.** Without X: 18. (0.1, R.1, N ×2, B ×2, V.1, C ×3, K ×3, T ×3, D ×2, X ×3.)

- `V` comes before `C`: the cast needs `valueFits`.
- `K` comes before `T`: a template needs `Join` to convert.

## Verification

- The five gates after each commit, by exit code. The docs build when a page changes.
- **N:** each list op with `null`, with `5` and with `"abc"` gives the value it gives for `[]`. `Concat(null, [1])` gives `[1]`. `Concat(5, [1])` gives `[1]`. `Find(…).name` with no match gives `null`. A read of a missing field still throws.
- **B:** after B.0, no `unknown_type` exists in the source. `let x: Nope = 1`, `(n: Nope) => n` and `$x as Nope` (in C) each give `unknown_type`. `let b: Bus = $bus` with a layer type gives no `unknown_type`. `let none: number[] = []` gives no warning. This closes the named ceiling from the `any` fix, and its test changes to prove it. `let n: number = "a"` is `binding_type_mismatch`. A `ref` to an annotated binding has the annotated type, for a list literal and for an op call. An annotation makes a round trip through the `ast` form.
- **V:** one test for each row of the table, and one for `NaN`.
- **C:** `$rows as number[]` gives `null` for `5`, for `[1, "a"]`, and for a `Grade` that breaks its schema. `IsSet` of that result is `false`. `$bus as Bus` gives `null` when `$bus` holds `{}`. A field read on that result gives `null`. `Average($rows as number[])` gives `0`, not a throw (needs N). The two silent sites have their tests.
- **K:** `Join([1, 2], ", ")` compiles with no warning and gives `"1, 2"`. `Join(5)` stays a type error. `Join` of an `any` that holds `5` gives `""`. A language with the flag on a struct input throws when it composes. A language with the flag on an optional input throws too.
- **T:** `` `n = {count}` `` gives `"n = 5"`. A hole with a list gives its JSON. A hole with `null` gives `""`. A template in a hole works. An unterminated template recovers, so the editor colours the text while the author types. A diagnostic in a hole has the correct line and column.
- The whole suite and each sample on the site run after N, B, K and T, because each changes behaviour. (B.1 step 7 changes behaviour for a lambda.) I report each new warning or failure before I change a sample.

## Risks

| Risk | Answer |
|---|---|
| The plan is large: six features | Each milestone stands alone and has its own gates. A release can follow any milestone. |
| A host does not understand the `convert` flag | Milestone D.1. The reference shows each input that converts. |
| The word-led change breaks the parser | The parser tests are the check. C.1 is its own commit, so it is easy to revert. |
| `valueFits` on a long list costs time | It runs only in a cast. The pull-based cache runs the cast again only when its inputs change. |
| A Dendrite template cannot go in the `den` tag | The tests and the two registry entries use plain strings. `den` does not change. D.1 says so. |
| A backtick in inline code on an MDX page | A fence has no problem. An inline sample needs a double-backtick span. If `{:den}` cannot read it, the page uses a fence. |
| The name check finds a name in a test or a sample that exists | The check on a lambda parameter is new for programs that exist. The second review found no such sample on the site or in the registry. The suite is the check, and I report each case before I change it. |
| `as` is a word, not a reserved word | `let as = 1` stays valid. `as` is special only after an expression. The editor colours each `as` as a keyword. Accepted. |

## Recap

- Release 0.3.0 first. It can start now: PR #17 is merged, and the tree is clean.
- Six features: `null` that does not throw, a binding annotation with a check of each type name, `valueFits`, the safe cast, the `convert` flag, templates.
- The analyser never inserts a node. Each analysed node maps to a node that the author wrote.
- A failed cast gives `null`, never `[]`. A list op reads each value that is not a list as `[]`. No list op throws.
- After this plan: look at strings as lists in some places.
- After 0.4.0: boundary validation first, then `++` and the two lambda features.
