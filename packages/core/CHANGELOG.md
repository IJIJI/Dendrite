# Changelog

Changes to `@dendrite-lang/core`, newest first. Every version is tagged
`@dendrite-lang/core@<version>`; its date is on the
[GitHub release](https://github.com/IJIJI/Dendrite/releases) that ships it, which covers every
package released at the same time.

The version follows [semantic versioning](https://semver.org/). Before 1.0 a **minor** bump may
break the API, and the three packages share a minor, so a minor release here is a release of
all three. `@dendrite-lang/editor` declares this package as a peer at `^0.8.0`,
`@dendrite-lang/link` at `^0.8.2`.

## 0.8.2

- **New: `setInput` and `setInputs` on the runtime**, the names an instance's two verbs have,
  so one verb has one name on every side. `runtime.setInputs({ ... })` checks every value,
  stores them all and evaluates each program it reaches once, as `updateInputs` did; a name that
  is not a global input is ignored.
- **New: `setInputs` on a program handle and on an instance.** Several program-level inputs with
  one evaluation, and on an instance one `values` and at most one `snapshot`. All or none: a
  global or unknown name throws, and a value that does not fit refuses the whole batch (a handle
  throws, an instance reports `value_does_not_fit` on each name that did not fit), and nothing
  moves. `setInput` is `setInputs` of one name.
- **Deprecated: `updateInput` and `updateInputs`**, the runtime's old names for the same two
  functions, kept until the minor before 1.0.
- **Changed (types), no run-time change:** `ProgramInstance` gains `setInputs` as a required
  member, so a host's own object typed as one must carry it.

## 0.8.1

- **New: an evaluator's inputs are typed from its definition, every key.** Hand the definition
  `registerOp` returns to `registerEvaluator` as `op`, and each input arrives typed from its
  declaration (`InputsOf`): a `number` input is a `number`, a variadic one a `number[]`, an
  optional one `T | undefined`, a lazy one a `Thunk<T>`, a function an `FnValue`; `any` and a
  host's own type are `unknown`. The items of a declared list are the declaration's: the
  language checks a list's kind, not its items. An op registered by its name keeps every key
  `unknown`, as before. The library is written this way, and its 52 casts are gone.
- **New: the `Type` constants keep their literal types** (`Type.number` is
  `{ kind: "name"; name: "number" }` to the compiler, and `Type.array` keeps its element), which
  is what the typing above reads. `ValueOf` and `InputsOf` are exported.
- **Deprecated: `LazyInputsOf`**, the lazy slice of `InputsOf`, kept until the minor before 1.0.
- **Changed (types), no run-time change:** a host evaluator handed its definition as `op` with a
  cast that disagrees with the declaration (`n as string` where `n` is a `number`) stops
  compiling; a variable that held one `Type` constant and is assigned another needs a `Type`
  annotation.
- **Fixed: a binding is computed once per evaluation.** A binding read more than once, in one
  expression or in a lambda body, was computed once per read whenever an input it reads had
  changed (the "Known" line of 0.8.0); it is computed once, and every later read in that
  evaluation reads its value.

## 0.8.0

- **Breaking: "no value" everywhere.** An op handed a `null`, or a value of another kind, on an
  input that names a type gives `null` and does not run, where it read the null as the type's
  empty value: `1 / 0 + 1` is `null` (it was `1`), `Upper(null)` is `null` (it was `""`),
  `Upper(5)` through an `any` is `null` (it was `"5"`), `And(null, true)` is `null` (it was
  `false`): `And` and `Or` are three-valued, deciding on a `false` or a `true` on either side. A
  conversion of no value is no value (`ToString(null)`, `ToBool(null)`). `Average`, `Max` and
  `Min` skip a `null` item: `Average([1, null])` is `1` (it was `0.5`), `Max([-4, null])` is `-4`
  (it was `0`). An optional input handed a `null` reads it as absent. The rule is the
  evaluator's, in one place, so a host's op is under it too; the stdlib's thirty guards are gone.
  `??` was shipped in 0.7.0 for this: `x ?? 0` means the same before and after.
- **Breaking: a `NaN` is read as no value, at any depth, on both doors a host has.** A list or a
  struct a host's op returns is walked, and a `NaN` or an infinity in it becomes `null`, a
  negative zero `0`, unless the evaluator says `finiteCheck: false` (new): the promise that
  none is in there, which the library's `Map`, `Filter`, `Find`, `Reduce`, `Concat`,
  `Flatten`, `If` and `Default` make. A `NaN`, an infinity or an `undefined` a host pushes is
  read as `null` the same way, on every input and on every path; a `number` input refused a
  `NaN` before, and an `undefined` passed the door and then stopped every output with
  `input_not_set`.
- **Breaking: a field read never throws.** A field read on a value without the field, a number,
  or a list gives `null`; the run-time error kind `invalid_field_access` is gone. The checker
  warns where it could not look: `field_access_on_any` (new) on a field read of an `any` value.
- **Breaking: `Default`'s output type is `If`'s**, the type both sides agree on, else `any`. It
  took the value's type on faith and never looked at the fallback, so `$n ?? "none"` was typed
  `number`.
- **Breaking: `assertSavedPorts` is removed**, as its deprecation in 0.7.1 said; `isSavedProgram`
  is the guard.
- **Changed: a required op input left out is no value for every type**, where a primitive took
  its type's default (`Upper()` was `""`); the `missing_op_input` warning says so. A literal
  `null` into a typed slot no longer warns `implicit_any_cast`: it is known, and the op gives no
  value for it. The warning's meaning says that a stricter check may refuse such a program later.
- **New: `[1, null]` is `number[]`**, where it was `any[]` and warned on its way into `Average`;
  `[null]` alone is `any[]`, where it was `null[]`.
- **Fixed:** `Reduce(list, null, …)` compiles, its accumulator typed `any` (it was refused with
  `unknown_type`); `Convert.toNumber` gives `null` for text that overflows to an infinity
  (`"1e999"`), which a converting lambda parameter handed on; a field read on a list gives `null`,
  not JavaScript's `length`.
- **Known:** a binding read more than once is recomputed per read when its input changed, on
  every path, where the docs say once per evaluation. To be fixed in 0.8.1.

## 0.7.1

- **Fixed: a saved program that is not well formed is reported, never thrown.** A program from a
  file, a database or a wire is checked by shape before anything reads it: `load`,
  `setProgram` and `createInstance` answer `malformed_program` (or `unsupported_form` for a form
  this build does not know) on the diagnostics, and an instance keeps its previous program
  running, stale. Eight shapes threw a raw `TypeError` before, from commands documented to
  report, and three of them left an instance broken for every later program.
- **New compose problem, `malformed_ports`:** a layer whose ports are not a Ports record is
  refused inside `composeLayers`, with the layer's id, so every door reports it its own way:
  an instance's `setLayer` publishes it refused, a runtime's `setLayer` returns it, and
  `createRuntime` and the `layers` option of `createInstance`, which are a host's own code,
  throw the report as for any compose problem.
- **`isSavedProgram` is exported**, the guard above, for a host that wants to ask before handing
  a blob over; the link uses it for a program that arrives over a channel. `assertSavedPorts`
  is deprecated in its favour and stays until a minor removes it.

## 0.7.0

- **Breaking: the `BP` tiers are renumbered**, twenty apart (`ARROW` 20 to `CALL` 260), with
  two new tiers between `ARROW` and `OR`: `CONDITIONAL` 40 and `COALESCE` 60. A host that
  registered a symbol with a raw number sits somewhere else on the ladder now; one that used
  the names sees no change.
- **Breaking: `grammar.symbols` is gone.** The lexer's symbols are derived from the grammar's
  handler keys by `symbolsOf(grammar)`, exported beside `BP`, so a led registered by hand (the
  conditional's `?`) reaches the lexer with no second list to keep. `registerNud` and
  `registerLed` refuse a key that is a word, as `registerInfix` did.
- **Breaking: `AnalysisContext` is no longer exported.** It is the analyser's working state.
  The result and diagnostic types are exported by name, as before.
- **Breaking, for the type only: `OpDefinition.inputs` is `readonly`.**
- **`??` and `c ? a : b`.** `a ?? b` is `Default(a, b)`, below `||` and above `? :`, as C#, PHP
  and JS have it. `c ? a : b` is `If(c, a, b)`, with C's grammar: the then branch ends at the
  colon, the else branch chains to the right (`a ? b : c ? d : e`), and a lambda in the else
  branch needs brackets.
- **A lazy op input.** `lazy: true` on an `OpInput` hands the input to the evaluator
  unevaluated, as a `Thunk` (exported) with a `.value` getter, a variadic one as a `Thunk[]`.
  `registerOp` returns its definition, and `registerEvaluator({ op: If, … })` types the lazy
  keys from it, so `then.value` compiles and `condition.value` does not; `op: "If"` by name is
  unchanged, with every input `unknown`. The reference prints a lazy input as `then: lazy any`.
- **`If`, `Default`, `And` and `Or` evaluate only what they read.** `If` reads the branch taken,
  `Default` its fallback only for a null, `And` stops at the first false and `Or` at the first
  true. No value changes.
- **A name nothing declares names the nearest one.** "No binding exists by the name 'totl'.
  Did you mean 'total'?", and the same hint on an unknown input (`$scor`), an unknown struct
  field, a type written in a program (`$x as strng`), an argument named for an input or a
  parameter that does not exist (`If(thn: 1, …)`, `f(itm: 1)`), and an output nobody declared.
  A call to a name that is no op says so: "No operation or binding exists by the name 'Lenght'.
  Did you mean 'Length'?" (the kind stays `undeclared_binding_reference`). The sentences of
  those eight diagnostics are reworded to carry the hint.
- **Fixed: a run error in a branch not taken no longer stops every output.** `If(c, a, Boom())`
  ran `Boom()` whether or not `c` held.
- **Fixed: a reference to a binding in a cycle got a second error**, `undeclared_binding_reference`,
  beside the member's own `binding_cycle`.

## 0.6.0

- **Breaking: a list literal whose items differ in type refuses a function.** `["a", x => x]`
  is the new error `function_in_mixed_list`, and so is a list of two functions of different
  types. Such a list is a list of `any`, and a function is never `any`: until now it analysed
  clean, `Join` printed nothing for the function, and the function could leave through an
  output, where it is not JSON. A template and `++` build the same list, so `` `a{x => x}` `` and
  `"a" ++ (x => x)` are refused too. A list in which every item is the same function type is
  still allowed.
- **Breaking: a list that holds a function no longer fits `any`.** `isCompatible` looked at the
  outermost kind alone, so `Equals([x => x], 1)` was accepted where `Equals(x => x, 1)` was not.
  It reads through a list at any depth now, and the first is `op_input_type_mismatch` too.

- **Seven math ops, in the `arithmetic` segment: `Mod`, `Pow`, `Abs`, `Round`, `Floor`, `Ceil`,
  `Clamp`.** Each rule that languages disagree on is decided:
  - `Round(value, digits?)` sends a half **away from zero**: `Round(2.5)` is `3` and
    `Round(-2.5)` is `-3`, where JavaScript's `Math.round` gives `-2`. `digits` may be left out
    (a whole number) or negative (`Round(1234, -2)` is `1200`), and the decimal point moves
    without the error of multiplying, so `Round(1.005, 2)` is `1.01`.
  - `Mod(a, b)` has the **sign of `a`**, as `%` does in JavaScript and C: `Mod(-7, 3)` is `-1`.
  - `Clamp(value, low, high)` takes its bounds **in either order**: `Clamp(15, 10, 0)` is `10`.
  - `Mod` by zero, and a `Pow` whose result is no real number (`Pow(-8, 0.5)`) or too large to
    hold, have no answer and give `null`, by the rule below.
  - A `null` reads as zero in all seven, as in the arithmetic ops that were there.

  None has a symbol. `Min` and `Max` exist already, over a list.

- **The evaluator reads a negative zero as zero.** JSON writes `-0` as `0`, so a program held a
  value that changed on its way to a host. `Negate(0)`, `Ceil(-0.5)` and `Mod(-7, 7)` are `0`.
- **Breaking: an op with no answer gives `null`.** `Divide` by zero gave `0`, and so did
  `Average`, `Max` and `Min` of an empty list. All four give `null` now, as `Find` with no match
  and `ToNumber("abc")` do: a zero there could not be told from a real one.
  `Default(Max(states), 0)` says the fallback where one is wanted, and `IsSet` tests for it. The
  null is the answer of that one op: the next number op reads it as zero, as it reads any null,
  so `Divide(1, 0) + 1` is `1`.
- **The evaluator gives `null` for a result that is `NaN` or an infinity,** for every op, a
  host's included. Neither is JSON, so either changed on its way to a host, and `NaN` is not
  equal to itself. This is what makes the entry above one rule rather than four, and it fixes
  two leaks: `Divide(1, null)` was `Infinity`, and a number op fed a non-number through `any`
  was `NaN`. Only the number an op returns is read; a list it returns is not looked into.
- **`Max` and `Min` read a `null` item as zero,** as `Average` and the arithmetic ops do.
  `Max([null, -4])` was `null`, and is `0`.
- **`createStdlib({ segments })` takes part of the library.** The segments are `logic`,
  `control`, `array`, `arithmetic`, `list`, `conversion` and `string`, and the type
  `StdlibSegment` names them. Every segment stands alone. A symbol comes with the segment that
  owns its op, so a language without `arithmetic` has no `+` and no `-14` (a negative number is
  `Negate`'s symbol), and one without `string` has no `++` and no template. The segments
  install in the library's own order, whatever order the list is in; a name that is no segment
  throws. `createStdlib()` is the whole library, as before.
- **Breaking: the comparison ops are in the `logic` segment.** `Equals`, `NotEquals`,
  `GreaterThan` and `LessThan` carry `category: "logic"`, where a host reading `op.category`
  saw `"comparison"`. The reason is `>=`: it is sugar over `Not(LessThan(…))`, and with the
  four in `logic` every symbol's op is in the segment that registers the symbol. The reference
  has seven pages; `/stdlib/comparison/` is gone, and its entries are on the logic page.

## 0.5.0

- **A lambda parameter can convert: `(t~: string) => Upper(t)`.** The mark `~` means what it
  means on an op input (`parts~` in the reference): an argument of any type is accepted, and it
  arrives in the body converted to the written type by `Convert`'s rules, leaf by leaf for a
  list. To a caller the parameter is `any`, so the function's type is `(any) -> string` and the
  lambda fits wherever an op hands it another type: `Map([1, 2], (n~: string) => Upper(n))`.
  The conversion runs where the closure binds its arguments, so a call an op makes converts as
  a call written in the program does. A function is still refused, as it is everywhere. The
  type must be written, and must be `string`, `number`, `boolean` or a list of them; any other
  type, or none, is the new error `invalid_convert_param`. That includes the short form
  `t~ => …`, which has no place for a type. `LambdaParam` gains `convert?: true`.
- **`~` is punctuation.** A stray one was the lexer's `unknown_character`; it is now a
  `syntax_error` from the parser that says what the mark is for.
- **`++` joins two values as text: `"Bus " ++ $n ++ " is live"`.** Sugar over `Join`, as a
  template is: the two sides become a two-item list, and `Join` converts each to text itself, so
  a number, a boolean, a null or a list needs no `ToString`, and nothing is inserted that the
  author did not write. It binds as `+` does and chains to the left, one `Join` inside the next.
  With `+` in the same expression that rule reads `"total: " ++ 1 + 2` as
  `("total: " ++ 1) + 2`, text handed to `Add`, which is `op_input_type_mismatch`: bracket the
  sum, or write a template. `1++2` was a syntax error and is now `"12"`.
- **Breaking: a value pushed into an input must fit the type the input declares.** Nothing
  checked it before: `updateInputs({ score: "oops" })` succeeded, and the program failed later
  at a field read or computed nonsense. The check is `valueFits`, the one a cast (`as`) runs: a
  list item by item, a struct field by field (a missing field does not fit, an extra one is
  ignored), a named type along its whole `extends` chain with every `schema` on it, and `null`
  fits every type. It is always on. Each level answers in the channel it already has:
  - **A runtime throws.** `runtime.updateInput` / `updateInputs`, a handle's `setInput` and
    `fireTrigger`, and the starting `values` of `register` and `replace`. The caller is host
    code, so a wrong value is a bug in it, the way a wrong name is. A batch with one bad value
    changes nothing, and neither does a refused `register`.
  - **An instance refuses.** `instance.setInput` and `fireTrigger` keep the input's value and
    publish a `value_does_not_fit` diagnostic: stage `"input"` (new on `ProgramDiagnostic.stage`
    and `DiagnosticDoc.stage`), `where` naming the input, `refused: true`. It is published once
    per input however often the bad value arrives, and it goes with the next value that fits or
    with the next compile. A host that switches on the stage gains one case.
  - **A value that outlives a change of declaration is checked again.** When an input's type
    changes and the value it held no longer fits, the input is seeded from its new type, where
    the stale value used to be handed to a program that expected something else.

## 0.4.0

- **Breaking: `grammar.operatorTokens` is `grammar.symbols`.** The docs settled on
  _operator_ (an _op_) for a named function like `Add` and _symbol_ for the `+` that spells it;
  the set of symbol strings the lexer recognises now says so. A host that reads the set renames
  one property. `registerInfix` and `registerPrefix` keep their names: they name a position.
- **Breaking: the stage `"ports"` is `"compose"`.** The step that builds the descriptor was
  called compose in the docs' chain and by `composeLayers`, and ports by `DiagnosticDoc.stage`
  and `ProgramDiagnostic.stage`, which _Every diagnostic_ had to explain away. One name now. A
  host that switches on the stage changes one string; the kinds are unchanged.
- **Templates: `` `n = {count}` ``.** Text with holes, the way TypeScript writes it, except that a
  hole is `{…}`, because `$` already means an input in this language (`` `${count}` `` is the text
  `$` followed by the hole). A template is sugar over `Join`, the way `>=` is sugar over
  `LessThan`: the text parts and the holes become one list, and `Join` converts each part to text
  itself, so a number, a boolean, a null or a list in a hole needs no `ToString`, and nothing is
  inserted that the author did not write. A template can span lines and can hold a template.
  Escapes: `` \` `` and `\{`, plus the usual ones. An unterminated template, or a hole left open,
  is `unterminated_string`, the same fault as a string without its closing quote. The lexer cuts
  a template into a backtick, string tokens and `{` `}` punctuation around ordinary tokens, so
  the editor colours the code in a hole as code.
- **An op input can declare that it converts: `convert: true`.** `Join([1, 2], ", ")` is
  `"1, 2"`, with no `ToString` and no `implicit_any_cast`: the analyser accepts a value of the
  declared SHAPE with any data at the leaves, and the evaluator converts each leaf with
  `Convert` before the op runs, so the op sees the type it declared. Only `string`, `number`,
  `boolean` or a list of them can carry the flag, and neither a variadic nor an optional input
  can; a wrong declaration is `invalid_convert_input` and throws when the language composes.
  In the stdlib only `Join` uses it, on `parts`. The rule stays the language's, not a type's:
  the analyser inserts nothing, and a caller's mistake on a converting input is converted
  rather than reported, which is what the flag means and why it is opt-in per input. One
  consequence of `Join` converting: `Join([1, 2])` was an `op_input_type_mismatch` and compiles.
  A bare `any` into a list-shaped converting input still warns (`'$x' is 'any' typed - 'any[]'
expected`): the flag vouches for the leaves, and the shape is what the checker cannot see.
  The reference marks a converting input `name~`.
- **`Convert` moved to `infra/`** (from `stdlib/`, where it was added a commit ago): the
  evaluator converts with it, and core does not import from the stdlib.
- **`Convert`, the three conversion rules, exported.** `Convert.toString`, `Convert.toNumber` and
  `Convert.toBool` are what `ToString`, `ToNumber` and `ToBool` do, and what every string op reads
  its text through, so a host op can convert the way the language does instead of the way
  JavaScript does. The rules are unchanged; they moved out of the stdlib's one file into
  `stdlib/convert.ts`.
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
