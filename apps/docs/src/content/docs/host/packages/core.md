---
title: "@dendrite-lang/core"
description: "The language: parser, analyser, evaluator, runtime. What it exports and how the pieces fit."
sidebar:
  order: 1
---

The language, and nothing else. No DOM, no framework, no network: it runs wherever JavaScript does,
in a browser, in node, in a worker. The only runtime dependency is `zod`, for type schemas.

## The exports, by what you are doing

**Building a language.** `createStdlib`, `createLanguage`, `extendLanguage`, `extendStdlib`, and the
`Language` they return with its `register*` methods. `BP` for operator precedence, `operationNode`
for building an op node from an operator. [Extending the language](../../extending-the-language/)
walks through them.

**Running programs.** `createEnvironment` is the usual entry point, and everything else hangs off
it: `createRuntime` and `createInstance` from the environment, `forProgram` for a pipeline bound to
a composed descriptor. The lower levels, `run` and `createProgramRunner`, are exported for hosts that
need less. [Embedding core](../../embedding-core/) covers when to use which.

**Describing types and ports.** `Type` builds types (`Type.number`, `Type.array(…)`, `Type.fn(…)`),
`typeToString` prints them, `isCompatible` is the one compatibility rule. `Policy.host` and
`Policy.user` are the two common layer policies. `composeLayers` is composition on its own, for a
host that wants the descriptor without a runtime.

**Storing programs.** `serialiseSource` makes a saved program from text, `den` is the same as a
tagged template for tests and examples, and `SavedProgram` is the union of the forms. Load one
through `environment.load`, which always re-analyses.

**Reading problems.** `diagnostics` and `diagnosticList` are the registry of every kind the language
can report, with a message and a triggering program each - the same one the
[diagnostics page](../../../how-it-works/diagnostics/) prints. `ProgramDiagnostic` is the shape an
instance publishes.

**Lower level.** `parseSource`, `analyse`, `evaluate`, `tokenise`, and their result types, for tools
that need one stage on its own. The parser kernel and grammar internals are deliberately not
exported: extend a language through its `register*` methods instead.

## How the pieces fit

```
createStdlib()             a Language: types, ops, evaluators, operators
  └ createEnvironment()    that language with its pipeline
      ├ forProgram()       a pipeline bound to a composed descriptor: parse, analyse, run, load
      └ createRuntime()    many programs, global layers, shared input values
          └ createInstance()   one program, its own layers, five observables, four commands
```

Two rules keep that stack honest:

- **A language declares no inputs or outputs.** Those arrive as port layers and compose on top.
  See [ports and layers](../../../how-it-works/ports-and-layers/).
- **Only a composed environment can analyse.** A bare environment has a vocabulary and no
  declarations, so there is nothing to check a program against yet. `forProgram` is what gives you
  one, and a runtime does it for you.

## Module format

Both ESM and CommonJS, with types. The package's `exports` map points `import` at the ESM build and
`require` at the CommonJS one, so either works without configuration.

**Next:** [@dendrite-lang/editor](../editor/).
