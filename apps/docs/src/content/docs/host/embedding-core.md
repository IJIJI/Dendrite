---
title: "Embedding core"
description: "The instance as the front door: five observables, four commands, and the levels beneath it."
sidebar:
  order: 2
---

A host holds an **instance** and does two things with it: pushes values in, and watches what comes
out. Everything on this page is how.

This picks up where [Installation](../installation/) left off: a runtime carrying the host's
contract, and one instance on it.

## Five observables

Everything an instance knows, it publishes. Each is an `Observable{:ts}`: `get(){:ts}` for the current value,
`subscribe(listener){:ts}` for changes, which returns its own unsubscribe.

| Observable | Holds |
| --- | --- |
| `outputs{:ts}` | `{ outputs, error, stale }{:ts}` - the values, a runtime error if the run failed, and whether they came from a program that is no longer current |
| `diagnostics{:ts}` | every error and warning, from composing, parsing and analysing |
| `values{:ts}` | every program-level input's current value, whoever fed it |
| `ports{:ts}` | the layers as composed, and which layer placed each name |
| `snapshot{:ts}` | everything a save would capture: the program, its ports, its values |

```ts runs continues="installation"
const stop = instance.outputs.subscribe(({ outputs, error, stale }) => {
  if (error) return report(error);
  act(outputs?.get("alert"), { stale });
});
```

Subscribe to `outputs{:ts}` to act, to `diagnostics{:ts}` to show problems, to `snapshot{:ts}` to save. A host
pushing its own values leaves `snapshot{:ts}` silent, so a save listener only fires when something a
save would care about changed.

## Four commands

Every command returns nothing and reports through the observables. That is deliberate: it is the
shape a command needs to cross a network, and it means a local instance and a remote one behave
identically.

| Command | Does |
| --- | --- |
| `setInput(name, value){:ts}` | set a program-level input. Throws on a global name - those are the runtime's. Refuses a value that does not fit the input's type |
| `fireTrigger(name, value){:ts}` | set, evaluate, reset to the default, evaluate again. Refuses a value the same way |
| `setProgram(saved){:ts}` | swap the program |
| `setLayer(id, ports){:ts}` | replace one program-level layer's declarations |

And `dispose(){:ts}`, which unregisters the program from the runtime.

A saved program can carry
[declarations of its own](../../how-it-works/persistence/#a-program-carries-its-own-declarations),
and `setProgram{:ts}` takes them with it. This program brings an input the runtime does not declare:

```ts runs
instance.setProgram(
  serialiseSource("output alert = $temperature > $limit", {
    inputs: [{ name: "limit", type: Type.number, default: 25 }],
    outputs: [],
  }),
);
```

The instance now has an input of its own beside the runtime's, and that difference is the next
section.

## Two kinds of input, two places to set them

This is the thing hosts most often get wrong, so it is worth stating flatly.

- A **global** input belongs to the runtime. Set it with `runtime.updateInputs({ ... }){:ts}`, and
  every program on the runtime sees the new value.
- A **program-level** input belongs to one instance. Set it with `instance.setInput(name, value){:ts}`.

```ts runs
runtime.updateInputs({ temperature: 30 }); // your state, every program
instance.outputs.get().outputs?.get("alert"); // true: 30 is over 25

instance.setInput("limit", 35); // this program's own input
instance.outputs.get().outputs?.get("alert"); // false
```

Calling `instance.setInput{:ts}` with a global name throws, because a value with two owners would have
no right answer. `updateInputs{:ts}` takes several at once and evaluates each program a single time, so
prefer it for anything that arrives together.

## A value has to fit its type

Both places check a value against the type its input declares, with the check a cast (`as{:den}`)
runs: a list item by item, a struct field by field, a named type along its whole `extends{:ts}` chain
with every `schema{:ts}` on it. `null{:den}` fits every type. A struct with a declared field missing
does not fit, and an extra field is ignored.

What differs is how each one says no.

- **The runtime throws.** `runtime.updateInputs{:ts}` and a handle's `setInput{:ts}` are called by your
  code, so a value of the wrong type is a bug in it. A batch with one bad value changes nothing.
- **An instance refuses.** `instance.setInput{:ts}` and `fireTrigger{:ts}` may be called by a pane, or by
  a client across a network, and neither can catch an exception. The input keeps its value, and
  `diagnostics{:ts}` gains a [`value_does_not_fit{:den}`](../../how-it-works/diagnostics/#value_does_not_fit)
  error marked `refused{:ts}` that names the input. It goes with the next value that fits, or with
  the next compile.

A value that outlives a change of declaration is checked again. When an input's type changes and
what it held no longer fits, the input starts over from the default of its new type.

## When the program breaks

A user editing a program is nearly always mid-keystroke, and so nearly always invalid. What an
instance does about that is designed around a host that is acting on its outputs.

```ts runs
instance.setProgram(serialiseSource("output alert = $temperature >"));
instance.diagnostics.get(); // the parse error
instance.outputs.get().stale; // true - the last good values are still there
```

The broken program is reported and **not** run. The previous program keeps running, and its outputs
stay available with `stale: true{:ts}`. The moment a program compiles again, the flag clears. Decide what
stale means for your application (keep acting, pause, grey out), but you will not be handed blanks.

An error the analyser found in a binding no output reads does not stop anything at all: it is
reported, the binding is pruned, and the outputs run. Only a lost `required{:ts}` output fails a program
outright.

## The levels beneath

An instance is the top of four levels. Most hosts only ever touch the top one, but each exists for
a reason, and the lower ones are there when you need less.

| Level | Remembers | Reach for it when |
| --- | --- | --- |
| `run(program, descriptor, inputs){:ts}` | nothing | you evaluate once, in a test or a script |
| `createProgramRunner(program, descriptor){:ts}` | one program's cache | one program, evaluated repeatedly, no other state |
| `createRuntime(){:ts}` | many programs, shared global inputs | an application's whole set of programs |
| `createInstance(runtime, …){:ts}` | one program on a runtime, its own layers and observables | a program somebody edits, saves, or watches |

The lower two take a compiled program directly:

```ts runs
import { createProgramRunner, type PortLayer, run } from "@dendrite-lang/core";

const layer: PortLayer = {
  id: "sample",
  policy: Policy.user,
  ports: { inputs: [{ name: "n", type: Type.number, default: 0 }], outputs: [] },
};

const composed = env.forProgram([], [layer]);
if (!composed.ok) throw new Error("those layers do not compose");
const parsed = composed.environment.parse("output doubled = $n * 2");
if (!parsed.ok) throw new Error("that program does not parse");
const { program } = composed.environment.analyse(parsed.program);
const { descriptor } = composed.environment;

run(program, descriptor, { n: 4 }).get("doubled"); // 8

const runner = createProgramRunner(program, descriptor);
runner.run({ n: 5 }).get("doubled"); // 10, and only what `n` reaches recomputes next time
```

They are deliberately separate rather than one object with options. Each is the smallest thing that
does its job, and a host that needs a runner does not carry a runtime's state.
