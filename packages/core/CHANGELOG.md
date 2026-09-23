# Changelog

Changes to `@dendrite-lang/core`, newest first. Every version is tagged
`@dendrite-lang/core@<version>`; its date is on the
[GitHub release](https://github.com/IJIJI/Dendrite/releases) that ships it, which covers every
package released at the same time.

The version follows [semantic versioning](https://semver.org/). Before 1.0 a **minor** bump may
break the API. `@dendrite-lang/editor` and `@dendrite-lang/link` declare this package as a peer
at `^0.3.0`, so a minor release here is always accompanied by a release of both.

## Unreleased

- **The safe cast: `$rows as number[]`.** The other answer to an `any`: where an annotation
  states a type, a cast checks the value. It gives the value when it fits the type
  (`valueFits`, above) and **`null`** when it does not, for every type, a list included, so a
  cast never throws and `IsSet`, `Default` and the list ops handle the miss the way they
  already handle a null. `Average($rows as number[])` over a host's garbage is `0`. To the
  checker the result simply IS the target type, so nothing downstream warns. `as` is a new
  kind of node, not an op call, because a type is not a value an op can receive; it binds
  tighter than every operator and looser than a call or a field, so `1 + $x as number` casts
  `$x`, and `$row.value as number` casts the field. A cast to a name nothing registered is an
  `unknown_type`. `as` is a word, not a symbol, and it stays an ordinary name everywhere but
  after an expression: `let as = 1` is still a program. Two diagnostics of its own: a cast to
  a function type is an error, `cast_to_function`, because a closure carries no signature and
  could never be checked; and a cast between two types neither of which fits the other,
  `"five" as number`, is a warning, `cast_never_fits`, because it is always null, pointless
  rather than unsound. The `implicit_any_cast` warning on an annotated binding now names its
  fix: `Use 'as number[]' to check it`.
- **`registerInfix("as", …)` throws.** The lexer reads letters as an identifier before it reads
  the operator list, so an operator spelled as a word could never match, and until now it was
  registered without a word and never fired. It is refused at registration and the message
  names `registerWordLed`; the reverse, a word-led that is not an identifier, is refused too.
- **A led can be keyed by a word: `registerWordLed`.** The Pratt kernel looked every token up
  by its kind, so each identifier shared the key `ident` and no word could continue an
  expression without matching all of them. An identifier is now looked up by its text first,
  the way a statement keyword is, so `as` can be an infix word (next) while it stays an
  ordinary name everywhere else. `Grammar` gains a `wordLeds` map, which `extendLanguage`
  carries over like the others.
- **`valueFits`, a runtime check of a value against a type.** Internal for now: the dynamic half
  of the type system, beside `isCompatible`'s static half, and the first thing a safe cast
  (next) and validation at the host boundary (after that) both need. It follows the static
  rules: `any` fits everything and a `null` value fits every type; a list fits when each item
  fits; a named type is checked against every rule on its `extends` chain, the zod `schema` and
  the struct `fields` alike, so a `Grade extends number` value has to satisfy `Grade`'s rule
  AND be a number. A struct needs each declared field present, null allowed, missing not, and
  extra fields are ignored. A function type never fits: a closure carries no signature. One
  consequence of using the schemas as they are: `NaN` and `Infinity` are not numbers.
- **A binding can state its type: `let rows: number[] = $rows`.** The annotation is a claim
  about the value, checked when the program is analysed: a value the type does not fit is a new
  `binding_type_mismatch`, and the binding fails like any other error, so nothing downstream
  runs on a type it does not have. Where it fits, the stated type is what every reader of the
  binding sees, so `let none: number[] = []` is a `number[]` to `Average`, which closes the one
  case the `implicit_any_cast` warning had no answer for. An `any` source still warns: the
  annotation states a type, it does not check the value. `output` takes no annotation, because
  the host declares what an output is. The `ast` saved form carries the annotations under an
  `annotations` key, written only when there are any, so an existing document is unchanged.
- **A type written in a program must exist.** `(n: nubmer) => n` compiled, and the first thing
  to notice was a mismatch against a type called `nubmer`. A name in an annotation, on a lambda
  parameter or a lambda's return type, that nothing registered is now `unknown_type`, the
  program-side pair of `unknown_op`, and the lambda or the binding that wrote it fails.
- **Breaking: `unknown_type` is `unknown_port_type`.** The port problem for a declaration that
  names a type nothing registered is renamed, so that `unknown_type` can mean what `unknown_op`
  does: a name in a program. The kind changes in `PortProblem["kind"]`, in `AnalysisErrorKind`
  and in the diagnostics registry; its stage, message and example are unchanged.
- **A list op never throws.** `Length(null)`, `Average(null)`, `Includes(null, 1)` and
  `Filter(null, …)` threw a `TypeError` wrapped as `host_error`, while `Join(null)` was `""` and an
  unset list input already seeded to `[]`: an accident of `null.length`, not a rule. Every list op
  now reads a value that is not a list as the empty list, through one shared guard, so
  `Average(null)` is `0`, `Find(null, …)` is `null`, and `Concat(null, [1])` is `[1]`. The guard
  is by shape, not by `null` alone, so a value that reaches a list input through `any` is treated
  the same: `Length(5)` was `undefined` and is `0`, and `Length("abc")`, which was `3` only
  because a JavaScript string has a `length`, is `0` too. Whether a string should count as a
  list is a question in its own right, and is answered on purpose later, not by accident here.
- **A field of `null` is `null`.** `Find($buses, b => b.id == 9).name` threw `invalid_field_access`
  whenever no bus matched, in a program the checker had passed, and nothing in the language could
  guard it: `If` is an op, so both of its branches are evaluated. The read now gives `null`, the
  way a `null` reads as `""` in a string op and as `[]` in a list op. A struct that is there but
  lacks the field still throws: that value came from a host and does not match its declared type,
  and a value that is not an object at all now raises the same `invalid_field_access` instead of
  a bare `TypeError`.

## 0.3.0

- **Conversion ops: `ToString`, `ToNumber`, `ToBool`.** The language converts nothing on its own,
  and until now a program could not convert on purpose either. Each rule is decided here rather
  than inherited from JavaScript. `ToString` gives the empty string for `null`. `ToNumber` reads
  text as a plain decimal and gives **`null`** for anything that is not a number, the empty
  string, `"0x10"` and `"Infinity"` included: a `0` would be a guess indistinguishable from a real
  zero, so `Default(ToNumber(x), 0)` lets the author write the fallback. `ToBool` is false for
  `false`, `0`, the empty string, `null` **and an empty list**, which JavaScript calls true.
- **String ops: `Join`, `Upper`, `Lower`, `Trim`, `Contains`, `StartsWith`, `EndsWith`.** A
  program could not build a string at all: `Concat` is for lists and `Add` for numbers.
  `Join(parts, separator)` builds one from a list, and its `separator` is optional, the first op
  input in the library declared `required: false`. Case conversion is never locale-dependent, so
  a program gives the same text on every host. `Contains` is its own op rather than `Includes`,
  which asks whether a list holds an item. A `null` text reads as the empty string, and nothing
  here throws. There is no operator for joining text yet: that waits on whether the language
  should ever convert a value without being asked.
- **An `implicit_any_cast` names what you wrote.** `$height >= 10` over an `any` height said
  _"Input 'a' is 'any' typed"_, and `a` is an input of the `LessThan` that `>=` desugars to: a
  name nobody typed. It now says `'$height' is 'any' typed - 'number' expected`, for an input, a
  binding or a field access, and names the op and its input (`Input 'a' of 'GreaterThan'`) when
  the value has no name of its own. A lambda's return and an application's argument no longer
  call themselves an `Input`, and a `null` is called `'null'`, not `'any'`. Only the message
  changes: the `name` field still holds the op input.
- **The warning sees an `any` inside a list.** An `any[]` reaching a `number[]` crossed silently,
  because only a bare `any` was looked for, so a program passing a mixed list into a typed input
  **gains a warning**. Nothing stops compiling: it was always the rule, and the docs already
  promised it. An empty list literal stays quiet, and so does an untyped lambda.

## 0.2.0

- **Negative numbers.** There were none: `-14` was a syntax error anywhere. A new `Negate` op,
  with a prefix `-` as its symbol, the way `!` is `Not`'s - so `1 - -14` is
  `Subtract(1, Negate(14))`.
- **Lexical order holds for outputs too.** An output written above the binding it reads is now a
  `forward_reference`, as a binding already was. Evaluation order never depended on it; the text
  rule does, and it was only half enforced. A program that put its outputs first stops compiling.
  Every statement now has one place in a single declaration order, so `AnalysisContext`'s
  `currentBindingIndex` is `currentDeclarationIndex`: it numbers outputs too.
- **An input's diagnostics underline the whole `$name`**, not only the `$`: its source span now
  covers the name.
- **A variadic input reaches `inferOutput`** as the type its items share, or `any` when they
  disagree - the open question on variadic inputs, decided. `Concat` uses it: two `number[]`
  make a `number[]`, so a lambda over the result is typed instead of `any`, and the
  `implicit_any_cast` it used to cause is gone.
- **A program that does not compile still holds its declared input defaults.** An instance seeded
  its values only after a successful compile, so an input declared `default: 4` read as its
  type's seed (`0`) while the program was broken, including on the first mount. Seeding now
  happens as soon as the layers compose, which is whose business it is. A replica through
  `@dendrite-lang/link` follows, since it mirrors what the served instance publishes.
- **The npm page** carries the Dendrite wordmark, and version, docs and licence badges.

## 0.1.0

The first release.

- **The language.** A lexer and Pratt parser, an analyser that resolves types and checks every op
  call before anything runs, and a pull-based evaluator that recomputes only the nodes an input
  change reaches. Errors are collected rather than thrown, and soundness is per output.
- **Termination.** No loops and no recursion: a name cannot refer to itself, and a function is
  never accepted where `any` is, so every program finishes.
- **The standard library**, `createStdlib()`: logic, comparison, control, array, arithmetic and
  list ops, with operators registered as sugar over them.
- **Types.** Named types registered on a language, structural arrays and function types, `any` for
  data only, `null`, struct fields, and `extends`.
- **Ports and layers.** A language declares no inputs or outputs; they arrive as port layers that
  compose onto it, where the first layer to claim a name keeps it. `Policy.host` and `Policy.user`,
  global layers on a runtime, program layers on an instance.
- **Execution levels.** `run`, `createProgramRunner`, `createRuntime` and `createInstance`. An
  instance has five observables and four commands, and keeps its last good outputs, marked stale,
  while its program does not compile.
- **Extension.** `registerType`, `registerOp`, `registerEvaluator`, `registerInfix`,
  `registerPrefix`, and `inferOutput` / `inferInputTypes` for types that follow an op's inputs.
- **Persistence.** `SavedProgram` in `code`, `ast` and (reserved) `rete` forms; loading always
  re-analyses against the current language.
- **Diagnostics.** `diagnostics` documents all 47 kinds, each with what it means and a program that
  triggers it.

Known limits: a value pushed into an input is not validated against its declared type, and the
`rete` form cannot be loaded yet.
