# @dendrite-lang/core

A declarative dataflow language you embed in a TypeScript application.

A program is a set of named values and outputs. Your application declares what programs may read
and must produce, pushes values in, and acts on what comes out. When an input changes, only what
depends on it recomputes. Programs are type-checked before they run, and every program terminates.

📖 **[Documentation](https://ijiji.github.io/Dendrite/)** · 🧪 **[Playground](https://ijiji.github.io/Dendrite/playground/)**

## Install

```sh
npm install @dendrite-lang/core
```

ESM and CommonJS, with types. One runtime dependency, `zod`.

## A program, running

```ts
import {
  createEnvironment,
  createStdlib,
  Policy,
  serialiseSource,
  Type,
} from "@dendrite-lang/core";

const env = createEnvironment(createStdlib());

// Your contract: what every program on this runtime may read and must produce.
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

// One program, running.
const instance = env.createInstance(runtime, {
  program: serialiseSource("output alert = $temperature > 25"),
});

instance.outputs.subscribe(({ outputs, stale }) => console.log(outputs?.get("alert"), { stale }));
runtime.updateInputs({ temperature: 30 }); // true
```

## What is in the box

- **The language**: a parser, an analyser that resolves types and checks every op call, and a
  pull-based evaluator that recomputes only what an input change reaches.
- **A standard library** of logic, comparison, control, array, arithmetic and list ops, with
  operators as sugar over them.
- **Port layers**: a language declares no inputs or outputs; your application does, in layers
  whose order is authority.
- **An instance to hold**: five observables and four commands. A program that stops compiling
  keeps its last good outputs, marked stale rather than hidden.
- **Extension**: register your own types, ops, evaluators and operators.
- **Every diagnostic documented**: `diagnostics` is the registry of all of them, each with a
  program that triggers it.

## Where to go next

- [Installation](https://ijiji.github.io/Dendrite/host/installation/) and
  [Embedding core](https://ijiji.github.io/Dendrite/host/embedding-core/) for hosting programs.
- [Extending the language](https://ijiji.github.io/Dendrite/host/extending-the-language/) for your
  own types and ops.
- [Learn](https://ijiji.github.io/Dendrite/learn/getting-started/) for what programs look like.

Pre-1.0: the API can still change between minor versions.

## Related packages

- [`@dendrite-lang/editor`](https://www.npmjs.com/package/@dendrite-lang/editor): a code editor
  over a running program, with React components.
- [`@dendrite-lang/link`](https://www.npmjs.com/package/@dendrite-lang/link): a program driven
  across a channel, served on one side and edited on the other.

## License

[MPL-2.0](./LICENSE)
