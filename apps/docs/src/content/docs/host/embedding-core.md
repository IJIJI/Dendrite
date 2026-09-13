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

Everything an instance knows, it publishes. Each is an `Observable`: `get()` for the current value,
`subscribe(listener)` for changes, which returns its own unsubscribe.

| Observable | Holds |
| --- | --- |
| `outputs` | `{ outputs, error, stale }` - the values, a runtime error if the run failed, and whether they came from a program that is no longer current |
| `diagnostics` | every error and warning, from composing, parsing and analysing |
| `values` | every program-level input's current value, whoever fed it |
| `ports` | the layers as composed, and which layer placed each name |
| `snapshot` | everything a save would capture: the program, its ports, its values |

```ts
const stop = instance.outputs.subscribe(({ outputs, error, stale }) => {
  if (error) return report(error);
  act(outputs?.get("alert"), { stale });
});
```

Subscribe to `outputs` to act, to `diagnostics` to show problems, to `snapshot` to save. A host
pushing its own values leaves `snapshot` silent, so a save listener only fires when something a
save would care about changed.

## Four commands

Every command returns nothing and reports through the observables. That is deliberate: it is the
shape a command needs to cross a network, and it means a local instance and a remote one behave
identically.

| Command | Does |
| --- | --- |
| `setInput(name, value)` | set a program-level input. Throws on a global name - those are the runtime's |
| `fireTrigger(name, value)` | set, evaluate, reset to the default, evaluate again |
| `setProgram(saved)` | swap the program |
| `setLayer(id, ports)` | replace one program-level layer's declarations |

And `dispose()`, which unregisters the program from the runtime.

## Two kinds of input, two places to set them

This is the thing hosts most often get wrong, so it is worth stating flatly.

- A **global** input belongs to the runtime. Set it with `runtime.updateInputs({ ... })`, and
  every program on the runtime sees the new value.
- A **program-level** input belongs to one instance. Set it with `instance.setInput(name, value)`.

```ts
runtime.updateInputs({ temperature: 30 }); // your state, every program
instance.setInput("limit", 35);            // this program's own input
```

Calling `instance.setInput` with a global name throws, because a value with two owners would have
no right answer. `updateInputs` takes several at once and evaluates each program a single time, so
prefer it for anything that arrives together.

## When the program breaks

A user editing a program is nearly always mid-keystroke, and so nearly always invalid. What an
instance does about that is designed around a host that is acting on its outputs.

```ts
instance.setProgram(serialiseSource("output alert = $temperature >"));
instance.diagnostics.get(); // the parse error
instance.outputs.get().stale; // true - the last good values are still there
```

The broken program is reported and **not** run. The previous program keeps running, and its outputs
stay available with `stale: true`. The moment a program compiles again, the flag clears. Decide what
stale means for your application - keep acting, pause, grey out - but you will not be handed blanks.

An error the analyser found in a binding no output reads does not stop anything at all: it is
reported, the binding is pruned, and the outputs run. Only a lost `required` output fails a program
outright.

## The levels beneath

An instance is the top of four levels. Most hosts only ever touch the top one, but each exists for
a reason, and the lower ones are there when you need less.

| Level | Remembers | Reach for it when |
| --- | --- | --- |
| `run(program, descriptor, inputs)` | nothing | you evaluate once, in a test or a script |
| `createProgramRunner(program, descriptor)` | one program's cache | one program, evaluated repeatedly, no other state |
| `createRuntime()` | many programs, shared global inputs | an application's whole set of programs |
| `createInstance(runtime, …)` | one program on a runtime, its own layers and observables | a program somebody edits, saves, or watches |

The lower two take a compiled program directly:

```ts
const { environment } = env.forProgram([], [layer]); // after checking `.ok`
const parsed = environment.parse("output doubled = $n * 2");
const program = environment.analyse(parsed.program).program; // after checking `parsed.ok`

run(program, environment.descriptor, { n: 4 }).get("doubled"); // 8

const runner = createProgramRunner(program, environment.descriptor);
runner.run({ n: 5 }).get("doubled"); // 10, and only what `n` reaches recomputes next time
```

They are deliberately separate rather than one object with options. Each is the smallest thing that
does its job, and a host that needs a runner does not carry a runtime's state.

**Next:** [Extending the language](../extending-the-language/).
