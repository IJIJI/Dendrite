---
title: "Evaluation"
description: "Pull-based, incremental, three caches, and what stale means."
sidebar:
  order: 4
---

Nothing in Dendrite is pushed. Asking for an output walks down from it, and every node on the
way decides whether it already knows its answer.

## The recompute rule

Each node in a core program carries `dependsOn{:ts}`: the set of input names it reaches, computed
statically by the analyser. Evaluation is handed the set of inputs that changed, and the rule is
one line:

> recompute this node if `changedInputs ∩ dependsOn ≠ ∅`, and there is no cache entry for it.

Everything follows from that.

- A node reading no inputs is computed once and never again. A literal, an arithmetic expression
  over literals, a lambda over constants.
- Changing an input recomputes exactly the nodes whose `dependsOn{:ts}` contains it, and the nodes
  above those, and nothing else.
- `changedInputs{:ts}` may also be `undefined{:ts}`, which means "assume everything changed". That is what
  a one-shot `run(){:ts}` passes, and it disables caching for that pass, because there is nothing to
  reuse.

Because `dependsOn{:ts}` is a set of *input names*, not of nodes, this is cheap: an intersection of
two small sets per node, and no graph traversal to work out what is dirty.

## Three caches, because there are three lifetimes

The evaluation state holds three separate stores, and they are separate because the things in
them go stale at different times.

| Store | Keyed by | Lives for |
| --- | --- | --- |
| `inputs{:ts}` | input name | as long as the host keeps pushing values |
| `nodeCache{:ts}` | the node object | the program, until an input it depends on changes |
| `bodyScope{:ts}` | the node object | one application of one closure |

`nodeCache{:ts}` is a `WeakMap{:ts}` keyed by node identity, which matters: a node is a stable object in
the compiled program, so its cache entry dies with the program and nothing has to be cleared by
hand.

`bodyScope{:ts}` is the one that is easy to get wrong. A lambda's body is one node, and applying the
lambda to five list items evaluates that same node five times with a different parameter each
time. Caching those in `nodeCache{:ts}` would give the second item the first item's answer, so a
fresh `bodyScope{:ts}` is created per application and the body caches into that instead. Inside a
lambda body it is `bodyScope{:ts}`; outside it is `nodeCache{:ts}`.

Beside those sits `localBindings{:ts}`, the lambda's parameters, consulted **before** the program's
own bindings so a parameter shadows a global name of the same name.

## A binding is computed once per evaluation

Two outputs reading the same binding share one computation, and so do three reads in one
expression and a read inside a lambda body, once per evaluation and not once per item. The
evaluator records which bindings it computed in the evaluation under way, and every later
reference reads that value. Between evaluations the node cache decides: a binding whose
inputs did not change is not computed at all. This is the difference between a binding and a
macro, and it is why naming intermediate values costs nothing.

## A lazy input is a node read on demand

An op input declared lazy (`If{:den}`'s two branches, `Default{:den}`'s fallback, the nodes of
`And{:den}` and `Or{:den}`) is not evaluated before the op runs. The op receives a thunk over the
node and reads it when it wants it, or never, so a branch not taken is never computed, and a run
error in it never happens. The node under the thunk is the same memoised node as anywhere else:
read twice, it is computed once, and when the condition flips, the branch that was skipped is
computed then and cached from then on. A converting input converts inside the thunk. The op's own
cache entry still depends on every input it has, so a change inside the skipped branch recomputes
the op, which then re-reads the branch it takes.

## An op receives what it declared, or does not run

Before an op's evaluator is called, each of its inputs is read against the declaration: an input
that names a type and holds `null{:den}`, or a value of another kind, is no value, and the op's
result is `null{:den}` without the evaluator running. Four inputs take what comes: an `any{:den}`
input, an optional one (a `null{:den}` reads as absent), a converting one (its leaves go through
the conversion first) and a lazy one (the op's to read). On the way out, a number that is not
finite is `null{:den}` and a negative zero is `0{:den}`; a list or a struct is walked for the same
unless the evaluator says `finiteCheck: false{:ts}`. A value a host pushes is read the same way at
the door. The rule is one function in the evaluator, so a host's op is under it too
([Extending the language](../../host/extending-the-language/#what-your-evaluator-receives)).

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
| `run(){:ts}` | none | one program, once, no caching |
| `createProgramRunner(){:ts}` | one program's cache | one program, evaluated repeatedly |
| `createRuntime(){:ts}` | many programs, shared global inputs | an application's whole set |
| `createInstance(){:ts}` | one program on a runtime, with its own layers and observables | what a host actually holds |

They are deliberately not unified into one configurable thing. Each is the smallest surface for
its job, and a host that needs one does not carry the others' state.
[Embedding core](../../host/embedding-core/) is the page for choosing between them.
