---
title: "Ports and layers"
description: "What a program reads and produces, declared in layers whose order is authority."
sidebar:
  order: 3
---

A language in Dendrite declares **no inputs and no outputs**. It has types, ops, evaluators and
operators - a vocabulary - and nothing about what any particular program talks to.

What a program reads and produces arrives separately, as **port layers**, and they compose onto
the vocabulary to make the descriptor the analyser actually checks against.

## Why they are separate

Because one language serves many programs, and each of them talks to something different.

An application embedding Dendrite has one vocabulary: its ops, its types, the standard library
underneath. But the program watching a camera reads different inputs from the program totting up
a tally, and both are the same language. Put the inputs on the language and you need a language
per program.

There is a second reason, which is that declarations have owners. Some come from the host in
code and are regenerated on every mount. Some belong to the document and are saved with it. A
layer is how "who declared this" survives into the editor, where it decides what a user is
allowed to rename.

## A layer is data

```ts
{ id: "host", ports: { types?, inputs, outputs }, policy: { editable, feeds, persisted } }
```

Three fields of policy, and core reads them as fields. It never branches on a layer's *kind*:

- **`editable`** - may a UI change these declarations?
- **`feeds`** - who supplies the values, host code or a user typing them?
- **`persisted`** - is the layer saved with the program, or rebuilt by the host?

Two combinations are common enough to have names. `Policy.host` is not editable, host-fed and
not persisted: a contract made in code. `Policy.user` is editable, user-fed and persisted: the
document's own declarations. Anything else is a `Policy.custom` away, and core will not notice
the difference. A capability a host feeds but a user may not rename is just a policy, not a new
concept.

## Order is authority, and there is no override

Layers stack, and composition walks them in order. **The first layer to claim a name keeps it.**
A later layer claiming the same name is a problem, and the problem is blamed on the *later*
layer - it is the one that arrived to find the name taken.

That is `shadowed_name{:den}`, and the absence of an override rule is the decision. If a later
layer could win, nothing would be able to rely on what it declared: a host's contract could be
taken out from under it by a document. Instead the earlier declaration stands and the newcomer
is told.

Two other names go wrong at this stage. `duplicate_name{:den}` is one layer declaring something
twice, which is a mistake rather than a conflict. `invalid_name{:den}` is a name that is not an
identifier, checked against the same rule the lexer uses, so a declared name is always something
a program could actually write.

## Two levels

Layers hang at two places, and the difference is what they are shared with.

**Global layers** sit on the runtime. Every program registered on it sees them, and their values
are shared: one host input, one value, every program reading the same number. This is where an
application's own state goes.

**Program layers** sit on one instance. Its own inputs, its own outputs, its own values. This is
where the document's declarations go, and where a capability meant for one program alone goes.

A program's own values have exactly one owner, the instance, and a global value has exactly one
owner, the runtime. Nothing can be set in two places.

## At most one persisted layer

An instance refuses more than one layer with `persisted: true`. There is only one document, so
there is only one place a saved program's declarations can come from; two would mean a save had
to choose, and choosing silently is worse than refusing.

The same rule is why a persisted layer may not declare a type with a `schema`: see
[persistence](../persistence/).

## Composition can fail, and then nothing runs

`composeLayers` either produces a descriptor or a list of problems. It also runs the descriptor's
own integrity check, which is where a declaration naming an unregistered type
(`unknown_type{:den}`) or a struct field clashing with the one it inherits
(`incompatible_field_override{:den}`) is caught.

That check also catches two things that are not a layer's fault at all: an op registered with no
evaluator, and an evaluator registered for no op. Those mean the *language* is broken before any
program exists, so composition throws rather than reporting - there is no program to blame, and
no document to fix.

## What the editor shows you

Provenance comes out of composition: for every name, which layer placed it. That is what lets
the editor grey out the declarations a user may not touch, attribute a refused rename to the
right row, and tell you that `score` came from the host rather than from your document.

**Next:** [Evaluation](../evaluation/).
