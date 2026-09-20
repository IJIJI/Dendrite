---
title: "@dendrite-lang/core"
description: "The language: parser, analyser, evaluator, runtime. What it exports and how the pieces fit."
sidebar:
  order: 1
---

The language, and nothing else. No DOM, no framework, no network: it runs wherever JavaScript does,
in a browser, in node, in a worker. The only runtime dependency is `zod`, for type schemas.

## The exports, by what you are doing

**Building a language.** `createStdlib{:ts}`, `createLanguage{:ts}`, `extendLanguage{:ts}`, `extendStdlib{:ts}`, and the
`Language{:ts}` they return with its `register*` methods. `BP{:ts}` for symbol precedence, `operationNode{:ts}`
for building an op node from a symbol. [Extending the language](../../extending-the-language/)
walks through them.

**Running programs.** `createEnvironment{:ts}` is the usual entry point, and everything else hangs off
it: `createRuntime{:ts}` and `createInstance{:ts}` from the environment, `forProgram{:ts}` for a pipeline bound to
a composed descriptor. The lower levels, `run{:ts}` and `createProgramRunner{:ts}`, are exported for hosts that
need less. [Embedding core](../../embedding-core/) covers when to use which.

**Describing types and ports.** `Type{:ts}` builds types (`Type.number{:ts}`, `Type.array(…){:ts}`, `Type.fn(…){:ts}`),
`typeToString{:ts}` prints them, `isCompatible{:ts}` is the one compatibility rule. `Policy.host{:ts}` and
`Policy.user{:ts}` are the two common layer policies. `composeLayers{:ts}` is composition on its own, for a
host that wants the descriptor without a runtime.

**Storing programs.** `serialiseSource{:ts}` makes a saved program from text, `den` is the same as a
tagged template for tests and examples, and `SavedProgram{:ts}` is the union of the forms. Load one
through `environment.load{:ts}`, which always re-analyses.

**Reading problems.** `diagnostics{:ts}` and `diagnosticList{:ts}` are the registry of every kind the language
can report, with a message and a triggering program each. It is the same one the
[diagnostics page](../../../how-it-works/diagnostics/) prints. `ProgramDiagnostic{:ts}` is the shape an
instance publishes.

**Lower level.** `parseSource{:ts}`, `analyse{:ts}`, `evaluate{:ts}`, `tokenise{:ts}`, and their result types, for tools
that need one stage on its own. The parser kernel and grammar internals are deliberately not
exported: extend a language through its `register*` methods instead.

## How the pieces fit

```
createStdlib()             a Language: types, ops, evaluators, symbols
  └ createEnvironment()    that language with its pipeline
      ├ forProgram()       a pipeline bound to a composed descriptor: parse, analyse, run, load
      └ createRuntime()    many programs, global layers, shared input values
          └ createInstance()   one program, its own layers, five observables, four commands
```

Two rules keep that stack honest:

- **A language declares no inputs or outputs.** Those arrive as port layers and compose on top.
  See [ports and layers](../../../how-it-works/ports-and-layers/).
- **Only a composed environment can analyse.** A bare environment has a vocabulary and no
  declarations, so there is nothing to check a program against yet. `forProgram{:ts}` is what gives you
  one, and a runtime does it for you.

## Module format

Both ESM and CommonJS, with types. The package's `exports` map points `import{:ts}` at the ESM build and
`require{:ts}` at the CommonJS one, so either works without configuration.
