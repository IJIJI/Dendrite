# Dendrite — Done

Finished work that used to be a todo or backlog entry, kept because the reasoning in it is not
recorded anywhere else. The changelogs say what shipped; this says why it was built that way.

---

## 0.4.0 on npm — DONE 2026-09-25

`@dendrite-lang/core`, `@dendrite-lang/editor` and `@dendrite-lang/link` at **0.4.0**, three days
after 0.3.0. A minor because it breaks: two renames (`"ports"` to `"compose"`, `operatorTokens` to
`symbols`), `unknown_type` with a new meaning, and three behaviours tightened on purpose. The
runbook held from the tags on, and taught two things before them.

- **Check the PR's commit count against `git log origin/main..dev` before merging.** PR #19 was
  merged while `dev` still had five commits to push, so `main` got 16 of 21. The fix chosen was a
  reset of `main` to the merge before it (`git reset --hard`, `--force-with-lease`), with the
  ruleset's block on force pushes lifted for the push and restored after, then one PR (#21) with
  all 21. Chosen over reverting the revert because nothing on npm or in a tag depended on `main`
  yet, and it leaves one merge instead of three.
- **A revert of a merge cannot be undone by merging the branch again.** Git counts the reverted
  commits as already merged and brings only the new ones. PR #20 was GitHub's Revert button on
  #19, merged by accident; had `main` not been reset, the way back was "revert the revert" and
  only then a PR for the rest. Recorded in `release-plan.md`, step 2.

Checked after approval: `latest` on each package, an attestation on all three, the peer ranges at
`^0.4.0`, and a clean install outside the repo where a program with an annotation, a cast that
misses, a template and a converting `Join` gives `"Ada has 2 rows: [3,4]"` for a list and the
empty text, `0` and `false` for `"nope"`; `grammar.symbols` reads, and the editor from npm colours
a template and a cast as the source does.

---

## Types and text — the plan for 0.4.0 — DONE 2026-09-24

Twenty-one commits in three days, the plan in `types-and-text-plan.md` (its status table, and what
was cut on review). Six features: a list op never throws and a field of null is null; a binding
states its type and every written type name must exist; `valueFits`; the safe cast `as`, with a
word-led in the Pratt kernel to carry it; `Convert` and the `convert` flag, with `Join` as its one
stdlib user; and templates with `{…}` holes as sugar over that `Join`. Two renames rode along,
because the release was breaking anyway.

What is worth keeping beyond the changelogs and the plan:

- **The analyser never inserts a node.** Named during the design discussion and held through
  every milestone: a template is sugar the parser writes, a cast is a node the author wrote, and
  the `convert` flag is a declaration the op owns. Implicit casting by type was rejected on it.
- **A diagnostic reports a provable fault, never a guessed habit.** The one guessed one,
  `dollar_before_hole`, was cut on review; `cast_never_fits` stayed because it is provable.
- **Two reviews from other chats caught what one pair of eyes did not:** `getOutputType`
  reading a list's element type (B.1), a field read on null in a well-typed program (N.2), the
  missing `unknown_type` for a written name (B.1 step 7), and the stale-`dist` docs gate.
- **Three process slips, each now a rule:** a milestone stacked on an uncommitted one, a file
  staged without permission, and a leftover check that searched `src` and not `examples`.

**The two todo entries as they stood** (the second is the design record the plan was built on):

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

## Naming — the API still says "operator" where the docs say "symbol" — DONE 2026-09-24

Renamed outright, with no deprecated aliases: `grammar.operatorTokens` is `symbols`, the
editor's token class `operator` is `symbol` (`tok-symbol`), and the theme variable
`--dendrite-syntax-operator` is `--dendrite-syntax-symbol`. `registerInfix` and `registerPrefix`
keep their names, as the entry said: they name a position. The entry asked for aliases "for a
version" when it expected an ordinary minor; 0.4.0 is breaking already and nothing on npm
consumes the packages, so an alias would have been dead flexibility kept for nobody. Two
changelog lines (core and the editor) say what changed. The four example scripts in
`packages/core/examples/3-(code)` read the set too, and a leftover check that searched only
`src` missed them: `yarn typecheck` did not.

**The entry as it stood:**


**What:** on 2026-09-18 the docs' vocabulary settled on **operator** (an **op**, for short) for a
named function like `Add`, and **symbol** for the `+` that spells it. The public API predates
that: `registerInfix` / `registerPrefix` are fine (they name a position, not a concept), but
`grammar.operatorTokens`, the editor's `tok-operator` class and the `--dendrite-syntax-operator`
theming variable all mean *symbol*.

**Why deferred:** each is public - a host reads `operatorTokens`, a theme sets the variable -
so renaming them is a breaking change, best done once, at a minor release, with the old names
kept as aliases for a version.

**What it requires:** `symbolTokens` beside `operatorTokens` (deprecated); `tok-symbol` beside
`tok-operator`; `--dendrite-syntax-symbol` falling back to the old variable. Then drop the old
names at the release after.

---

## Naming — the compose stage has two names — DONE 2026-09-24

**`"compose"` won.** It is what `composeLayers` is called and what the chain draws; "ports" named
what the stage checks, not the stage. Renamed in `DiagnosticDoc.stage`, `ProgramDiagnostic.stage`,
the diagnostics table's section and anchor, the editor's port-pane filter, and the wire (link's
`ProgramDiagnostic`), so all three packages carry a breaking line for 0.4.0. Done in the release
that was breaking anyway, and while nothing on npm consumes the packages, which is the cheapest
a rename ever gets. *The chain* no longer has to say "the same step under another name". Found
on the way: that section listed seven compose kinds, and there are eight since
`invalid_convert_input`.

**The entry as it stood:**


**What:** the docs' chain calls the step that builds the descriptor **compose** (after
`composeLayers`), while *Every diagnostic* and core's `DiagnosticDoc.stage` call it `"ports"`.
*The chain* says outright that they are the same step, which papers over it.

**Why deferred:** found while drawing the chain (2026-09-19). Renaming the stage is a change to a
public type (`DiagnosticDoc["stage"]`), so it waits for a release that can carry one.

**What it requires:** pick one name (compose matches the function and the chain; ports matches
what the stage checks), rename `"ports"` in `diagnostics.ts` and its `DiagnosticDoc` type, the
stage list in `DiagnosticsTable.astro` and its `#ports` anchor, and the links to it on *The
chain* and *Ports and layers*. A changelog line, since a host switching on the stage breaks.

---

## 0.3.0 on npm — DONE 2026-09-22

`@dendrite-lang/core`, `@dendrite-lang/editor` and `@dendrite-lang/link` at **0.3.0**, two days
after 0.2.0. A minor because core gained API (ten ops, the first optional op input) and a
warning widened (an `any` inside a list). Editor shipped a colour; link shipped nothing and moved
its peer range. The runbook held again: the bump on `dev`, PR #18, three tags on the merge commit
`7287918`, one release on core's tag, `Stage release` green, three approvals with 2FA, core first.

Checked after approval: `latest` on each package, an attestation on all three, the peer ranges at
`^0.3.0`, and a clean install outside the repo where `Join(["n =", ToString(ToNumber($raw)),
Upper("abc")], " ")` gives `"n = 12 ABC"` and `ToNumber("0x10")` gives `null`.

One thing worth keeping: **run the docs build in its own command, on a fresh cache.** All five
gates in one shell, `yarn test` then `yarn workspace dendrite-docs build`, gave the build exit 1
once, and it passed twice alone. Explained on 2026-09-24, while checking templates on the site:
Astro caches rendered `.md` pages in `apps/docs/.astro`, and the docs build reads core and the
editor from their `dist`, so after a package change the site can show the old highlighter while
every test passes. Rebuild both packages and delete the cache first (`CLAUDE.md`, Gates).

---

## Language — do we want implicit casting? — DECIDED 2026-09-21

**No, not by type.** The analyser never inserts a node: every analysed node maps to one the
author wrote, and that invariant was named during the discussion and is now the rule. What the
language does instead, all in `types-and-text-plan.md`:

- **An op input may declare that it converts**: `convert: true` on `OpInput`, shown as
  `parts~: string[]` in the reference. The conversion is the OP's, declared and documented, not
  the analyser's. `Join` is the only stdlib user; a converting lambda parameter is next.
- **A template converts through `Join`**, because it desugars to one: the hole calling
  `ToString` itself (the earlier decision, below) is superseded, and no node is inserted.
- **`++` is the same**: sugar over `Join`, so it converts the way `Join` does.
- **No cast to boolean**, ever. `If(0, …)` stays a type error and `ToBool` stays explicit: a
  number read as a condition is the coercion the language rejected first.
- **A value crossing an `any` is the author's to check**: `as` (a safe cast, `null` on a
  misfit) or an annotation, both in the plan.

**The entry as it stood when the question was open:**


**What:** a question, not a decision. Today the answer is **no**: implicit coercion (a number
read as a boolean, say) was rejected because it undermines the soundness model and would need
conversion nodes inserted by a rewrite the language deliberately lacks. The sound alternative is
built: `ToString`, `ToNumber` and `ToBool` (2026-09-20, `done.md`). Three things now lean on the
question:

- **A template literal's hole calls `ToString` itself** (decided 2026-09-20, entry below). Argued
  not to be the rejected coercion: the reader wrote the template, the conversion is visible in
  it, and it goes one way only, to a string. But it IS a conversion nobody typed.
- **An operator for joining strings** (entry below). `"n = " ++ 1` either stringifies the number
  or is refused, and whichever it does is this question answered for one operator.
- **A number in a condition.** `If(0, …)` is a type error today, and `ToBool` makes the
  conversion explicit. A program full of `ToBool(...)` is the cost of the current answer.

**Why deferred:** raised 2026-09-20 while planning the string ops, where it kept coming up from
different directions. It wants deciding once, as a rule, rather than three times by accident.

**What it requires:** a decision on WHICH direction, if any, is allowed silently (to a string is
the only one with a case so far); where it happens (a desugaring can do it visibly, the analyser
cannot without the rewrite); and whether a silent conversion warns. Decided together with the
string operator and with "strings and arrays, interchangeable" below, since all three are about
how much the language does without being asked.

---

## 0.2.0 on npm — DONE 2026-09-20

`@dendrite-lang/core`, `@dendrite-lang/editor` and `@dendrite-lang/link` at **0.2.0**, five days
after the first release. A minor because three things changed rather than added: an output above
the binding it reads is a `forward_reference`, `Negate` is new API, and `TokenClass` gained
`"type"`. The runbook in `release-plan.md` held exactly as written, so it taught nothing new:
bumps on `dev`, PR #15 into `main`, three tags on the merge commit, one GitHub release on core's
tag, `Stage release` green in 57s, and the three staged versions approved with 2FA, core first.

Checked after approval: `latest` on each package, an attestation on all three, the published peer
ranges at `^0.2.0`, and a clean install outside the repo where `require()` reaches all three and
`output out = 1 - -14` evaluates to 15.

One thing worth keeping: **a README image must be on `main` before anyone reads it.** The npm
wordmark pointed at `raw.githubusercontent.com/.../main/...` while the file existed only on `dev`,
so the three 0.1.0 npm pages showed a broken image until this release's PR merged.

---

## Bug — a program that does not compile ignored its input defaults — FIXED 2026-09-20

An instance seeded its input values only after a successful compile (`recompile` in
`runtime/instance.ts` called `seedValues` past the `loaded.ok` gate), so a sample mounted to SHOW
a diagnostic opened with its types' seeds: `$quantity` read 0 on *Inputs*, not the 4 its ports
declare. Seeding moved up to run as soon as the layers compose, which is whose business a
value is: the program decides nothing about what an input holds. A `link` replica follows,
because it mirrors what the served instance publishes. Found 2026-09-19 while checking the live
warning samples; `instance.test.ts` pins it with a program that cannot compile.

---

## Diagnostics — an `implicit_any_cast` names what you wrote, and sees inside a list — DONE 2026-09-21

**The message.** `$height >= 10` over an `any` height said *"Input 'a' is 'any' typed"*. `a` is
an input of the `LessThan` that `>=` desugars to, two levels down: a name nobody typed. The
squiggle was always right; the sentence pointed at the wrong thing. It now names the value as the
reader wrote it (an input, a binding, a field access), and names the op and its input only when
the value has no name of its own.

- **Only the message changed, not the `name` field**, which still holds `"a"`. `ProgramDiagnostic`
  drops `name`, so outside core the message is the only carrier; the field is the attribution
  (which slot) and the message is the sentence. One test pins both.
- **An incompatibility names the slot, a cast names the value.** "Which argument is wrong" is
  about the slot; "where did I lose the type" is about the value.
- **`checkCompat` took a `Slot`.** Its `name`, `source` and now the node travelled together at
  all four call sites, a Data Clump; the parameter object took it from six parameters to five and
  the dead `kind` default went. The warning branch had also been ignoring `kind`, so a lambda's
  return called itself an `Input`, and the message said `'any'` for a `null`.
- **Caught by reading the rendered page, not by a test:** adding the op's name to the old
  sentence shape gave *"Input 'nodes' of 'And' type 'string'"*, which reads as "'And' type". It
  is now *"has type 'string', which is not compatible with expected 'boolean'"*, and pinned.

**The blind spot.** The warning fired on a bare `any` only, so an `any[]` reaching a `number[]`,
compatible through array covariance, crossed **silently**, while *How it works* promised a
warning at every crossing. Found by accident: a plan for a `++` operator claimed a mixed list
"warns", the claim was checked against the code, and it was false. One predicate, `castsAny`,
now recurses into list elements, and both raise sites use it.

- **Narrowed twice, on purpose.** An empty list literal has no items to take a type from, so
  `Average([])` would cry wolf: the literal is recognised and skipped. Functions are left out:
  an untyped lambda into `Filter` is the gradual typing `isCompatible` allows deliberately, and
  warning there would flood every list op.
- **A named ceiling:** a NAME bound to an empty list does warn, since only its type reaches the
  check. Pinned by a test, and the fix is a binding annotation (`todo.md`, with the safe cast).
- **The fallout was measured, then confirmed:** no sample on the site passed a mixed or empty
  list into a typed slot, and all 455 core tests and 78 docs tests passed with the wider warning
  before a single new test was written.
- **It set up a question** rather than answering one: the author now has no way to say "I know
  what this is". That is the casting discussion in `todo.md`.

---

## Stdlib — conversion and string ops — DONE 2026-09-20

Until now a Dendrite program could not build a string at all, and could not convert a value on
purpose either. Two new categories, ten ops, in two commits. They ship in the next **minor**
(0.3.0): new ops are new API, as `Negate` was for 0.2.0.

**Conversion: `ToString`, `ToNumber`, `ToBool`.** The language converts nothing on its own
(implicit coercion was rejected: it needs a rewrite the language lacks), so these are the sound
alternative, and each rule was decided rather than inherited from JavaScript:

- **`ToNumber` gives `null`, not a throw and not `0`.** The alternatives other languages use are
  an exception (Python), a poisoned `NaN` (JavaScript) or an optional (Swift's `Int("abc")` is
  `nil`, Kotlin's `toIntOrNull()`, Elm's `Maybe`, Rust's `Result`). The optional is the modern
  answer, and `null` plus `Default` IS that here: the language has no `Result` type and `null`
  already means "no value". A `0` would be a guess indistinguishable from a real zero. A
  two-argument `ToNumber(value, fallback)` was dropped: it duplicates `Default`.
- **Text counts only as a plain decimal.** The plan said "trimmed and parsed", but `Number()`
  alone takes `""` (as 0), `"0x10"` (as 16) and `"Infinity"`, which is exactly the inheritance to
  avoid. So a regex: optional sign, digits, fraction, exponent.
- **`ToBool` is false for an empty list**, which JavaScript calls true. Lists are first-class
  here and "is there anything in it" is the question a program asks.
- **`ToString` of a list or a struct is its JSON.** The op must return something for them (the
  type system cannot say "primitives only" without unions), and JSON is total and what you want
  when a label came out wrong. `null` was weighed and dropped: it would blank a label silently.
  A friendlier form is in the backlog.
- `ToNumber` is typed `number` and can return `null`. Not a lie: `null` flows anywhere a data
  value is expected, and `Find` already does the same.

**String: `Join`, `Upper`, `Lower`, `Trim`, `Contains`, `StartsWith`, `EndsWith`.**

- **`Join(parts: string[], separator?)`, not a variadic builder.** It takes a list because text
  is built the way everything else is here, and because it is what a template literal will
  desugar into. Its separator is the **first op input declared `required: false`**: the analyser
  already skipped the `missing_op_input` warning for that and the evaluator only resolves inputs
  that are present, so it cost nothing new. Both halves are pinned by a test, and the host guide
  documents the flag, which it never had.
- **One rule for "a value as text"**, `toText`, shared by `ToString` and every string op. It
  replaced seven null guards and a second rule inside `ToString` that would have drifted, and it
  is why `Join(["n = ", 1])` is `"n = 1"` rather than a throw or `[object Object]`.
- **`Contains`, not `Includes`.** `Includes` asks whether a list holds an item. Keeping them apart
  is what lets text one day be read as a list of letters without changing this op (backlog:
  "strings and arrays, interchangeable").
- **Case is never locale-dependent**, or the same program would give different text per host.
- **The handful was picked by the Speculative Generality guard**: Beacon's labels are the only
  named consumer, so `Replace`, `Split` and `Slice` went to the backlog.
- **No operator for joining text.** Both `+` and `++` were weighed and both are the
  implicit-casting question in miniature (backlog).

**Found while building:** the reference page printed `separator: string` with nothing to say it
may be left out, since no op had an optional input before. `OpsReference.astro` now prints
`separator?: string`, and the stdlib index explains `?` beside `nodes...`.

**Written in `createStdlib`'s existing two-band style on purpose**, though it is a Long Method:
the user's call was one restructure later (now the first entry in `todo.md`) over two shapes side
by side now.

---

## Docs — inline TypeScript in the site's own colours — DONE 2026-09-20

Inline `…{:ts}` code on Host and How it works is highlighted by Shiki, on the Night Owl pair
Starlight's Expressive Code uses for its blocks. 239 snippets over 12 pages, in three commits:
the highlighter, the marking pass, and the one generated block.

- **Two plugins, not one.** `remark-ts.ts` sits beside `remark-den.ts` rather than inside it:
  the Dendrite one is synchronous and lexer-driven, this one is async and grammar-driven, and
  merging them would be Divergent Change. What they share (the MDX JSX node shapes) went to
  `mdx-jsx.ts`, and the highlighter itself to `shiki-ts.ts`, which the diagnostics table also
  uses.
- **`structure: "inline"`** gives bare spans, so a snippet drops into a sentence with no `<pre>`
  to strip. Both themes' colours ride on every span as `--shiki-light` and `--shiki-dark`, and
  `dendrite.css` picks one from Starlight's `data-theme`: no re-render when the theme flips.
- **How close the colours came:** dark is identical to a code block (a function name is `#82AAFF`
  in both). Light is a shade lighter inline (`#4876D6` against Expressive Code's `#3B61B0`),
  because EC lifts its blocks' contrast. That was the "close is enough" call, made in advance.
- **What stays plain**, by decision: package names (`zod`, `ws`), paths, URLs, a version range,
  a glob over method names (`register*`), a `package.json` field, JSON, maths, token kinds
  (`ident`, `operation`), meta-variables (`T`, `T[]`), and the Dendrite names the docs
  highlighter would colour wrongly (`Reading`, `Mod`, `Last`, `%`, `GreaterThanOrEqual`).
- **The generated block.** `hostCodeParts` printed TypeScript token by token with hand-applied
  classes; it is now `hostCode`, which prints text, and the table highlights it with the same
  Shiki call. That deleted the printer's `Part` machinery along with `partsHtml`, its `escape`
  and `partsText`: 103 lines out, 31 in.
- **Found on the way** (and fixed the same day, above): the type colour and Starlight's own
  inline-code colour were both the body text's grey.

---

## Editor — the type colour, again — DONE 2026-09-20

The plain ink chosen on 2026-09-19 was judged against editor snippets only. Once the inline
TypeScript pass put coloured code in the prose, the flaw showed: the docs colour an inline type
with the same `tok-type` class, and `--dendrite-muted` is exactly Starlight's body-text colour,
so `number[]` and `any` in a sentence read as unmarked text. It is now a **soft cyan**
(`oklch(0.55 0.05 198)` light, `oklch(0.76 0.05 198)` dark), a third of the chroma of the cyans
rejected on 2026-09-19 as too present: quiet on a canvas, visible in a paragraph.

The same reading fixed a second one: an inline snippet nothing highlights (a package name, a
path, a version range) took Starlight's inline-code colour, which is the body text's grey too.
Those now take the editor's identifier colour, so a name in a box reads as a name and matches an
identifier inside a Dendrite snippet. The rule is scoped `:not([class])`, so every highlighted
snippet keeps its own colours.

**The lesson**: judge a token colour where it will be READ, not only where it was born. The
editor's palette has two audiences now, a canvas and a paragraph, and the canvas is the
forgiving one.

---

## Learn — the samples step — DONE 2026-09-19

The user's observations on the Learn section (2026-09-18), built as one step in six commits. The
plan's reasoning, kept here because the code does not say it:

- **A type colour, in the editor.** A registered type's name is `tok-type`
  (`--dendrite-syntax-type`) where a type is written: after `:` or `->`, among a function type's
  parameters, or when the whole snippet is a type (`number[]{:den}` in prose). A binding sharing a
  type's name stays an identifier. **Known ceiling**, pinned by `tokens.test.ts`: a named
  argument's `:` looks like an annotation's, so in `If(then: number)` a binding called `number`
  reads as the type. Fixing it needs the parser.
- **One highlighter for Dendrite written as source.** The ops reference builds each signature as
  a string and runs it through `sourceHtml`. The diagnostics page **keeps** `typeParts` and
  `typeDefinitionParts`, with their classes corrected: they walk a real `Type`, so they know that
  a host type (`Bus`) is a type, which the stdlib-only highlighter cannot. Printing a type to a
  string for the lexer to guess back would be Primitive Obsession, and would lose that.
- **The colouring pass.** 84 inline snippets marked `{:den}` (74 found by a classifier, 10 by
  hand), and inline names take the editor's identifier colour. **Host-only names stay plain**
  (`Reading`, `Mod`, `Last`, `%`): a wrong colour is worse than none. The TypeScript half is its
  own todo, with the classifier's list.
- **Three warning samples, live.** `unused.den`, `shadowed.den`, `whatever.den`, with a `warns`
  flag held by `content.test.ts` like `fails`. They declare real output types, not the fences'
  derived `any`, so an output line reads `answer: number = 2`. `$whatever` defaults to
  `[1, 2, 3]`, or the block would open on `Length(null)`. Checking them corrected two claims:
  shadowing raises nothing (only `unused_binding`), and `Length` of a number is `undefined`, not
  a runtime error (backlog: "Value validation at the boundary").
- **The chain in five steps**: lex, parse, compose, analyse, evaluate. **Desugar** and **prune**
  are substeps, drawn nested under parse and analyse, because neither leaves an artefact:
  desugaring happens as the parser reads, and pruning is the analyser's last passes. *The chain*
  opens each section with its own piece of the diagram (`<Chain step>`), so the sections and the
  overview cannot disagree. On a wide screen the chain is two rows of three artefacts, breaking
  after the raw program; one row of eleven cells did not fit the content column.
- **The colour itself: plain ink**, `var(--dendrite-muted)`, picked by eye from about thirty
  candidates over two rounds (2026-09-20). A muted teal shipped first and read as too present,
  and so did softer cyans: a type is a kind of value, not a value, so it steps back from every
  coloured token instead of competing with them. Comments moved down with it, to
  `var(--dendrite-faint)`, and keep the italic they already had, which is what tells them from
  punctuation in the same grey. Keywords were already bold, which the candidate previews had not
  shown; that is why weight was considered at all. **The ink itself was superseded the next
  day**: see "the type colour, again" above.
- **Dashes.** Prose rewritten where a dash stood in for an em dash. The rule, as the user put it
  afterwards: a dash that reads naturally may stay (`.docs/CLAUDE.md`, *Working in this repo*).

Found on the way and recorded: the input-defaults bug (`todo.md`), an `any` value never checked
at runtime and the compose stage's two names (`backlog.md`).

---

## Document the core language (two levels) — DONE 2026-09-12

The docs site now teaches the language (`language-docs-plan.md`, seven commits): **Learn** for
writing programs, the **stdlib** reference with its conventions, **How it works** for the
chain in depth - one page per stage, the generated diagnostics catalogue, persistence, a
glossary - and **Host developers** for embedding it. Every Dendrite sample on the site is loaded
by `apps/docs/src/content/content.test.ts`; every diagnostic kind is documented and provoked in
`packages/core/src/language/diagnostics.ts`.

---

## The first npm release — DONE 2026-09-15

`@dendrite-lang/core`, `@dendrite-lang/editor` and `@dendrite-lang/link` are on npm at **0.1.0**,
with provenance. A GitHub release starts `.github/workflows/publish.yml`, which stages every
public package version npm lacks through trusted publishing - no token anywhere - and a
maintainer approves each with 2FA. The runbook for the next release, and what this one taught,
are in `release-plan.md`.

---

## Struct field typing — DONE

Implemented: `TypeDefinition.fields?: Record<string, Type>` (field name → type, structured); `registerType`
config + `extendLanguage` copy it; the analyser's `field` case resolves the struct type, infers a known
field's type (recursing for nested struct fields → multilevel) and errors on an unknown one
(`unknown_field`). Types without `fields` keep the permissive fallback (`any`; primitive → warning).
`fields` duplicates the Zod schema deliberately — explicit is debuggable and version-stable (no Zod
introspection). Verified end-to-end against the Beacon `Bus` struct (typed `bus.state`/`bus.sources`,
zero `implicit_any_cast` warnings, `bus.staet` typo caught). Inheritance is wired too: field lookup
follows the `extends` chain (inherited fields resolve; most-derived override wins), and
`validateDescriptor` checks each override is compatible with the parent's field
(`incompatible_field_override`) so a declared `Derived extends Base` is sound.

---

## Editor — the layouts: Minimal · Compact · Full — DONE 2026-09-10

**What landed** (five commits, `.claude/plans` "the editor's layouts"): three presets on one
`LayoutConfig` (`code` = `editable` + `gutters`, `declarations`, `end`, `topBar`), each with its
own defaults, nothing read-only by default; the top bar as one item model (menus, actions,
elements, and the editor's own controls as `Editor.items` a host lists or leaves out - no
`themeToggle`); `Editor.Actions` as the cluster in a bar or in a code block's corner;
`documentUrl` as the one open-in-playground shape; a collapsible `Pane` (`<details>`) that
Diagnostics fills with a count and never opens by itself; `Editor.Source` + `sourceParts` /
`sourceHtml` so a static block and a live Minimal one share markup and stylesheet. The docs
run Minimal in the hero (read-only, settable inputs, `→` lines) and Compact on the splash; the
reference's examples are static blocks with a build-time open link.

**Round two, the same day:** the actions cluster is `actions` + `actionsAt`, six generic spots
(the bar's start or end, floating over the code's start or end, a strip above the side panes,
the end of Minimal's input strip), each preset supporting its own subset with its own default
and a `bar-*` spot falling back when there is no bar; the input strip is a wrapping grid
(`inputs: "row" | "column"`, cells at least `--dendrite-inline-min`), the code takes
`--dendrite-code-min-height`; `Editor.Source` is the code block alone and the docs' `DenCode`
renders it on the server. The landing is one editable Minimal block beside the wordmark; the
Compact one moved to the examples page. What the entry below
called "the example layout" is `MinimalLayout`; the "compact + enlarge-to-page" embed is
`CompactLayout` without the enlarge, which waits for a host that wants it.

---

## Packages — `require()` for editor and link — FIXED 2026-09-16, ships in the next release

Editor and link were ESM-only with an `exports` map offering only `import`, so
`require("@dendrite-lang/editor")` failed with `ERR_PACKAGE_PATH_NOT_EXPORTED` (found in the 0.1.0
clean install). A `default` condition beside `import` in each entry (editor's `.` and `./react`,
link's `.`) fixes it: `require` matches `default`, and Node loads the file as ESM. Checked by
packing both and loading them from a project outside the repo, by `require` and by `import`. Core
is dual CJS/ESM and needed nothing. On npm from the next release; both changelogs carry it.

---

## Packages — Dendrite branding on the READMEs — DONE 2026-09-17, ships in the next release

The three package READMEs, which are the npm pages, open with the Dendrite wordmark - the same
logo the root README shows - and three badges:
the npm version, a docs link and the licence, in the brand's periwinkle on ink. The shared snippet
is `brand/README-header.md`, which also stopped advertising MIT and an `OWNER` placeholder. The root
README already carries a version badge per package.

Two things worth knowing next time:

- **The logo is a PNG**, `brand/assets/dendrite-wordmark.png`, rendered from the SVG beside it with
  sharp (already a dependency) and flattened onto white, which is what the root README's own
  wordmark carries. npm does not render SVG reliably, and that root wordmark is an SVG on GitHub's
  user-attachments host, which refuses a request without a browser user agent.
- **It is hotlinked** from `raw.githubusercontent.com/IJIJI/Dendrite/main/brand/assets/`, not packed
  into the tarballs, so the image only resolves once the commit is on `main` - which the release
  runbook does first anyway.

On npm from the next release: npm refreshes a README only when its package publishes, so core gets a
version bump for its page alone.

---

## Docs — the diagnostics page showed the wrong half — DONE 2026-09-17

The page printed each sample's program and dropped its port declarations, so 13 of 47 entries
showed something that was not the cause - five of them the same innocent `output x = 1`. It now
prints, from core's registry: a layer's types as text above the sample, the declared inputs above
the code and the declared outputs below it (the editor's own rows and `tok-*` colours, no gap),
each sample RUN so an output shows what it produced and an em dash where it produced nothing, and
a playground link in the corner, the way the ops reference already did it. The five `ports` kinds
show declarations alone, since they are raised before a program is read.

Twelve analyse samples gained the inputs and outputs they had left the reader to infer, and
`unknown_op` and `lambda_return_type_mismatch` - which no Dendrite text can express - became real
`ast` samples the test provokes, shown as the Dendrite they would be if the syntax allowed it
(marked invalid) and then as the host code that builds them. `DiagnosticDoc.inputs` was deleted:
nothing had ever set it.

Also: the three `den fails` samples in Learn are live editors now, mounted from
`src/examples/*.den` with a `fails` flag that `content.test.ts` holds to failing, each opening
with a comment saying how it fails.

---

## Docs — the TypeScript samples are checked — DONE 2026-09-17

`apps/docs/src/content/ts-samples.test.ts`, the sibling of `content.test.ts`: every ` ```ts ` and
` ```tsx ` fence on the site, typechecked against the packages' **source** through the docs
tsconfig's `paths`, so a rename in core, the editor or the link fails the test with no build step.
Proved by renaming a core export and watching every page that uses it fail, each at the page and
line a reader would open.

A page's fences are concatenated in order into one virtual file, because that is what the pages
already are - Installation imports in its first fence and uses `runtime` in its second - on top of
`src/examples/host/prelude.ts`, which declares what the *host* brings (`save`, `element`, `wss`)
and nothing Dendrite provides. Three fence tags steer it:

| Tag | Means |
| --- | --- |
| `sketch` | not TypeScript: a shape or an outline, skipped |
| `alone` | its own script, for a fence that is another runtime (the link page's two ends) |
| `continues="installation"` | this page picks up where that one left off, so it borrows its real code |
| `runs` | executed as well as typechecked, and its `// literal` comments are claims the test checks (2026-09-21, below) |

It found three samples already broken: `extending-the-language` used a `createEnvironment` it never
imported, `embedding-core`'s levels snippet used an undefined `layer` and skipped its `.ok` checks,
and the link page's `Channel` interface used an unimported `Observable`. All three are fixed on the
page.

**They run too, since 2026-09-21.** Typechecking catches a rename; it does not catch a sample
that compiles and then does the wrong thing, and `// 8` beside a call was a claim, not a fact. A
fence tagged `runs` is executed, and in it a trailing comment that starts with a literal is
checked: `run(program, descriptor, { n: 4 }).get("doubled"); // 8`. Four claims on two pages
(`8`, `10`, and two `true`s). The page stays the single source: nothing is copied into a test
that could drift from it, and a reader sees no scaffolding.

- **Opt-in per fence, not per page.** A page's fences are one script for the typechecker and not
  always for a runtime: *Embedding core* shows a `setInput` that throws (backlog). A whitelist in
  the test was rejected: it is a second list that cannot see the pages, and cannot say "this page
  runs except that fence".
- **Executed with what was already there:** `ts.transpileModule` to CommonJS, then
  `new Function`. TypeScript was already this test's dependency, the transpile hoists the
  imports, and a two-line `require` shim serves core through Vitest's alias to package SOURCE, as
  the typecheck does. No temp files, no new dependency, no config change.
- **Only core-only fences run.** No DOM and no socket here, so the editor and link pages stay
  typecheck-only, and aliasing them was skipped as config with no consumer.
- **The prelude's rule:** a name a `runs` fence uses is a value, not a `declare`. `report` and
  `act` got bodies, and `report` THROWS, so a documented happy path that reports an error fails
  the test rather than passing quietly.
- **A canary pins the claim count at four**, counted by where they sit on a page: a claim is a
  comment, so a rule that stops matching would otherwise be silent, and a `continues=` chain puts
  Installation's claim in two scripts.
- **Proved by mutation**, each turning the suite red with a message a reader can act on
  (`host/embedding-core.md:119: the page says 9, the code gives 8`): a wrong claim on the page,
  the CODE breaking (`Multiply` made to add), a dropped `runs` tag (the canary), and a happy path
  reporting an error.
- **Two ceilings, named in the test's header:** a `runs` fence cannot use top-level `await`, and
  a claim is a line rule, so one on a multi-line statement is not seen
  (`ts.getTrailingCommentRanges` is the upgrade path).

The file-based mechanism this entry used to describe - every snippet moved into
`src/examples/host/`, the pages converted to MDX, a component rendering them - was not built. It
costs six page conversions, a component and 18 files rewritten to stand alone, to buy live errors in
the editor that `astro check` already gives now that the samples compile.

---

## Web documentation site — DONE (empty), 2026-09-09

**Built as [docs-plan.md](docs-plan.md):** `apps/docs`, Astro + Starlight, at the root of
`ijiji.github.io/Dendrite/` with the playground under `/playground/` (one Pages workflow assembles
both). The stdlib reference is generated from the descriptor, one page per segment, every
example run. Live examples are React islands importing the editor directly - no iframe mode;
the docs' own example block is "the example layout" below. What remains is the CONTENT:
"Document the core language (two levels)" at the top of this file, with the notes from the
first look at the empty site under "Docs — content notes".

---

## Playground — React switch — DONE

The playground is a React host (`apps/playground/src/App.tsx`) of `@dendrite-lang/editor/react`
(editor-plan Phase 2, landed 2026-09-05); the vanilla shell is deleted. Deciding factor: Beacon is
React, and the chrome (panes, type pickers, top bar) is exactly the stateful list/form UI where a
vanilla shell hurts.

---

## Playground — share links — DONE (document model)

Implemented beyond the original sketch: the session state is a self-contained **document**
(`{source, surface, values}` with the surface as JSON-safe data), the URL fragment live-holds the
deflate+base64url payload (Share = copy URL), preset ids (`#tally`) are one-shot entry links that
convert to payload URLs, and preset loads push history entries (Back restores the previous
document). See `apps/playground/src/lang/{surface,document,permalink}.ts`.

---

## Playground — user-settable inputs and outputs — DONE

**Delivered 2026-09-07** as [editor-plan.md](editor-plan.md) Phase 3, on layers rather than the
`SurfaceSpec` sketched below: the document's own `Policy.user` layer is what the panes edit, the
gate is that layer's `editable` rather than a `surface.userInputs` flag, and `composeLayers` — not
the editor — judges every change. Declarations travel in share URLs as predicted, through
`SavedProgram.ports`. What is still missing is listed under "the declaration fields the port panes
do not expose". The original requirements are kept below for the record.

**What:** UI to declare/edit the language surface (inputs and outputs: name, type, default) from
the playground itself. **The data structure already exists** — documents carry a `SurfaceSpec`
(`apps/playground/src/lang/surface.ts`); this feature is "edit `document.surface` → rebuild language →
recompile", machinery the boot/dispose lifecycle already supports. Declarations travel in share
URLs automatically.

**Still needs:** a type picker (named/array types over the registered set), add/remove/edit rows
for inputs+outputs, and validation UX for dangling type references (createEnvironment fail-fast →
boot_failed rendering exists). A concrete step toward the editor era — the same UI generalises to
the Rete side's port configuration.

---

## Parser & Lexer — DONE

The entire parser/lexer worklist is implemented and green: lexer, expression core, `let`/`output`
statements, calls, arrows + higher-order (since collapsed into ordinary ops with function-typed
inputs), and the **grammar-registration API with operators**. The grammar lives in the parser layer
(kernel `parser.ts` + `grammar.ts` registration API + `core-grammar.ts` + `precedence.ts`); operators
are stdlib-registered sugar over ops; the lexer's operator vocabulary is single-sourced from
`grammar.operatorTokens` (no lexer↔parser desync). Source→RawProgram is `parseSource` (formerly
`compile`).

### Doc fixes

- _(Done)_ The `.docs/` set (CLAUDE.md, architecture.md, analyser-spec.md, decisions.md,
  ops-reference.md) and `packages/core/src/readme.md` were brought current with the structured-`Type`, first-class
  function, parser/grammar-split, and `createStdlib`/`parseSource` reality.

---

## Docs — content notes from the first look at the empty site — DONE with the content pass, 2026-09-12

Collected 2026-09-09 when the scaffold went up, for the content pass:

- **The chain wants a block diagram first**, prose second. The brand sheet
  (`brand/brand-sheet.html`) has a block style to reuse; inline SVG in the MDX, themed
  through the `--sl-*` tokens so it flips with the site.
- **Learn is a path, not a reference:** getting started (playground, no install) → writing
  programs with the base operators → how the language works → the full stdlib. The sidebar
  is already in that order; the content must read that way too, each page ending in "next".
- **Two readers.** Learn + stdlib are for someone writing programs; Host developers is for
  someone embedding the language, and it owns Installation (every package, every option)
  and the packages. Say this on the splash and at the top of each section's first page.
- **stdlib** is printed as code, one page per segment (generated), the index explaining the
  conventions (variadic inputs, `any`, function-typed inputs) and, once core has it, how a
  host picks segments.
- **A glossary** only once terms accumulate across pages; not as a stub.
- **Code samples in the site's own colours:** highlight Dendrite through the editor's
  `styledRanges` (the same lexer the canvas uses) rendered to spans at build time, rather
  than a second grammar for Shiki. Landed with the ops reference.

Reversed since (2026-09-18): pages no longer end in a **Next:** link. Starlight's own
pagination already says it, so the links were removed from every page.
