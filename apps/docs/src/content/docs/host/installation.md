---
title: "Installation"
description: "The packages, and the four things a host sets up: a language, an environment, a runtime, an instance."
sidebar:
  order: 1
---

_Host developers is for embedding the language in an application of your own. If you are writing programs in it, start with [Learn](../../learn/getting-started/)._

:::caution[Not on npm yet]
`@dendrite-lang/core@0.1.0` is the first release, and this documentation is part of preparing it.
Until it is published, the packages build from
[the repository](https://github.com/IJIJI/Dendrite): `yarn` then `yarn build` at the root. The
commands below are what installing will be once it lands.
:::

## The packages

| Package | What it is | Needs |
| --- | --- | --- |
| `@dendrite-lang/core` | the language: parser, analyser, evaluator, runtime | nothing |
| `@dendrite-lang/editor` | a code editor over a running program, with React components | core, and React for the components |
| `@dendrite-lang/link` | a program driven across a channel: served on one side, a replica on the other | core |

Core is the only one you need. The editor and the link are for hosts that let people write
programs, and for hosts where the program runs somewhere other than where it is edited.

```sh
npm install @dendrite-lang/core
```

Core is a peer dependency of the other two rather than a dependency, and that is load-bearing: two
copies of core in one bundle would disagree about `instanceof EvalError` and about which
descriptor is which. Install core once, at the top.

## Four things to set up

A host that runs programs builds four objects, each from the one before.

```ts
import { createEnvironment, createStdlib, Policy, serialiseSource, Type } from "@dendrite-lang/core";

// 1. A language: the vocabulary programs may use.
const language = createStdlib();

// 2. An environment: that language, with its pipeline.
const env = createEnvironment(language);

// 3. A runtime: your contract, shared by every program on it.
const runtime = env.createRuntime({
  layers: [
    {
      id: "host",
      policy: Policy.host,
      ports: {
        inputs: [{ name: "temperature", type: Type.number, default: 20 }],
        outputs: [{ name: "alert", type: Type.boolean, mode: "required" }],
      },
    },
  ],
});

// 4. An instance: one program, running.
const instance = env.createInstance(runtime, {
  program: serialiseSource("output alert = $temperature > 25"),
});
```

That program is now live. Push a value and read the result:

```ts
runtime.updateInputs({ temperature: 30 });
instance.outputs.get().outputs?.get("alert"); // true
```

## What each one is for

**The language** is what programs are allowed to say: the types, the ops, the operators.
`createStdlib()` is the standard library; `createLanguage()` is the bare core grammar with nothing
in it, for a host that wants to build its own vocabulary from zero. Either one can be extended, and
[Extending the language](../extending-the-language/) is how.

**The environment** binds a language to its pipeline. It is what can parse, compose layers, and
create runtimes. You make one per language.

**The runtime** holds your side of the contract. Its `layers` declare the inputs you will feed and
the outputs you expect, and those are **global**: every program registered on this runtime sees
them, and their values are shared. Mark an output `required` and a program missing it will not
load; `desired` warns; the default is optional.

**The instance** is one program on that runtime, and it is the object a host actually holds. It
has its own program-level inputs and outputs, five observables to watch and four commands to
drive it. [Embedding core](../embedding-core/) is about living with one.

## Options, in one place

| Call | Option | Meaning |
| --- | --- | --- |
| `createRuntime` | `layers` | global port layers, in precedence order: an earlier layer owns a contested name |
| `createInstance` | `program` | a `SavedProgram`: `serialiseSource(text, ports?)` for code |
| | `layers` | the program-level layers. Omit it for one editable, persisted `document` layer carrying `program.ports` |
| | `id` | the program's id on the runtime. Generated if omitted |
| | `inputValues` | starting values for the persisted layer's inputs |
| an input | `type`, `default` | the default is what the input holds before anything is pushed |
| | `trigger` | a discrete event: fired, evaluated, then reset to its default |
| an output | `mode` | `required`, `desired`, or omitted for optional |

**Next:** [Embedding core](../embedding-core/).
