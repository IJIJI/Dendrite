# Changelog

Changes to `@dendrite-lang/core`, newest first. Every version is tagged
`@dendrite-lang/core@<version>`; its date is on the
[GitHub release](https://github.com/IJIJI/Dendrite/releases) that ships it, which covers every
package released at the same time.

The version follows [semantic versioning](https://semver.org/). Before 1.0 a **minor** bump may
break the API. `@dendrite-lang/editor` and `@dendrite-lang/link` declare this package as a peer
at `^0.2.0`, so a minor release here is always accompanied by a release of both.

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
