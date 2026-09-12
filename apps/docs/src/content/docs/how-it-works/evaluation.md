---
title: "Evaluation"
description: "Pull-based, incremental, three caches, and what stale means."
sidebar:
  order: 4
---

Nothing in Dendrite is pushed. Asking for an output walks down from it, and every node on the
way decides whether it already knows its answer.

## The recompute rule

Each node in a core program carries `dependsOn`: the set of input names it reaches, computed
statically by the analyser. Evaluation is handed the set of inputs that changed, and the rule is
one line:

> recompute this node if `changedInputs ∩ dependsOn ≠ ∅`, and there is no cache entry for it.

Everything follows from that.

- A node reading no inputs is computed once and never again. A literal, an arithmetic expression
  over literals, a lambda over constants.
- Changing an input recomputes exactly the nodes whose `dependsOn` contains it, and the nodes
  above those, and nothing else.
- `changedInputs` may also be `undefined`, which means "assume everything changed". That is what
  a one-shot `run()` passes, and it disables caching for that pass, because there is nothing to
  reuse.

Because `dependsOn` is a set of *input names*, not of nodes, this is cheap: an intersection of
two small sets per node, and no graph traversal to work out what is dirty.

## Three caches, because there are three lifetimes

The evaluation state holds three separate stores, and they are separate because the things in
them go stale at different times.

| Store | Keyed by | Lives for |
| --- | --- | --- |
| `inputs` | input name | as long as the host keeps pushing values |
| `nodeCache` | the node object | the program, until an input it depends on changes |
| `bodyScope` | the node object | one application of one closure |

`nodeCache` is a `WeakMap` keyed by node identity, which matters: a node is a stable object in
the compiled program, so its cache entry dies with the program and nothing has to be cleared by
hand.

`bodyScope` is the one that is easy to get wrong. A lambda's body is one node, and applying the
lambda to five list items evaluates that same node five times with a different parameter each
time. Caching those in `nodeCache` would give the second item the first item's answer, so a
fresh `bodyScope` is created per application and the body caches into that instead. Inside a
lambda body it is `bodyScope`; outside it is `nodeCache`.

Beside those sits `localBindings`, the lambda's parameters, consulted **before** the program's
own bindings so a parameter shadows a global name of the same name.

## A binding is computed once per evaluation

Two outputs reading the same binding share one computation, because they share the node and the
node caches. This is the difference between a binding and a macro, and it is why naming
intermediate values costs nothing.

## Stale, rather than hidden

When a program stops compiling, the last one that did keeps running.

Its outputs stay on screen and stay available to whatever is acting on them, marked **stale**:
"these are real values, from a program that is no longer the one in front of you". They are not
hidden and not blanked.

That is a deliberate choice about what a half-typed program should do to a running system. An
editor mid-keystroke is nearly always in an invalid state, and a host that switched its outputs
off each time would flicker uselessly. So the values persist and carry a flag, and the host
decides whether to keep acting on them.

The flag clears the moment a compiling program produces a value of its own.

## An evaluation failure is not a diagnostic

Everything checkable was checked before evaluation began. What can still go wrong at this point
is the world not matching its declaration: a host op throwing, a value that was not the shape
its type claimed.

Those arrive on the outputs, as an error beside the values, rather than on the diagnostics list.
The distinction is worth keeping: a diagnostic is something about the program, and a runtime
error is something about this particular run of it. The
[diagnostics catalogue](../diagnostics/) marks which kinds are which.

## Four levels, one evaluator

The same evaluator sits under four entry points, and they differ only in what they remember:

| Level | State | For |
| --- | --- | --- |
| `run()` | none | one program, once, no caching |
| `createProgramRunner()` | one program's cache | one program, evaluated repeatedly |
| `createRuntime()` | many programs, shared global inputs | an application's whole set |
| `createInstance()` | one program on a runtime, with its own layers and observables | what a host actually holds |

They are deliberately not unified into one configurable thing. Each is the smallest surface for
its job, and a host that needs one does not carry the others' state.
[Embedding core](../../host/embedding-core/) is the page for choosing between them.

**Next:** [Every diagnostic](../diagnostics/).
