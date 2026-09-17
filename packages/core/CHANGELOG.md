# Changelog

Changes to `@dendrite-lang/core`, newest first. Every version is tagged
`@dendrite-lang/core@<version>`; its date is on the
[GitHub release](https://github.com/IJIJI/Dendrite/releases) that ships it, which covers every
package released at the same time.

The version follows [semantic versioning](https://semver.org/). Before 1.0 a **minor** bump may
break the API. `@dendrite-lang/editor` and `@dendrite-lang/link` declare this package as a peer
at `^0.1.0`, so a minor release here is always accompanied by a release of both.

## Unreleased

- **The npm page** carries the Dendrite wordmark, and version, docs and licence badges.
  Nothing in the package itself changed.

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
