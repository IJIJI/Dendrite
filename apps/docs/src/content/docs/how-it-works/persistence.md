---
title: "Persistence"
description: "What gets saved, why it is the text and not the tree, and the two things that carry versions."
sidebar:
  order: 6
---

A saved Dendrite program is the thing its author wrote, not the thing the analyser made of it.

## The authoring form is canonical

Three forms can be stored, and they are the three ways a program can be authored:

| Form | Holds | Written by |
| --- | --- | --- |
| `code` | the source text | the code editor |
| `rete` | an opaque graph blob | the graph editor, when it lands |
| `ast` | the raw program as plain records | code that builds a program directly |

The one that is *not* on that list is the core program, and that is the decision. An AST loses
the comments, the whitespace and the operator surface: reload `$score >= 60{:den}` from a tree
and you get `Not(LessThan($score, 60)){:den}` back, which is the same program and not the same
document. So the authoring artefact is what is kept, and the analysed form is rebuilt.

## Loading re-analyses, always

`load` never trusts what it is given. It parses and analyses from scratch, against the
descriptor as it is *now*.

That is the point. A host that adds an op, renames an input, or tightens a type does not have to
migrate anything: the next load of every stored program checks it against the new world and
reports what no longer fits. A program cannot silently drift away from the language it was
written in, because nothing about its analysis was stored to drift.

The cost is that loading is not free. It is a parse and an analysis, which is why a host holds
a compiled program while it is in use rather than reloading per evaluation.

## A program carries its own declarations

A saved program has an optional `ports` key: the inputs, outputs and types the *document*
declares for itself, as opposed to the ones its host declares. That is the persisted layer from
[ports and layers](../ports-and-layers/), travelling with the program it belongs to.

One thing does not survive the trip. A type's `schema`, its runtime validator, is a function,
and a function does not go through JSON: `JSON.stringify` turns a zod schema into an object that
revives as nothing, dropping any `.refine` predicate silently. So a layer that is persisted may
not declare a schema at all, and an instance refuses one rather than saving something that will
come back broken. A layer type that *extends* a language type inherits the validator without
carrying it, which is the way round.

## Two version axes

Two different things can change shape, so there are two versions and they are independent.

**The format version** is on the saved program, and it belongs to core. When the shape of a
`SavedProgram` changes, the number goes up and `migrate` brings older blobs forward. A blob
from a newer version than the running build fails with `unsupported_version` rather than being
guessed at.

**The envelope version** belongs to whoever wraps a program in their own document. The editor
has one, on `EditorDocument`, over the same generic migration chain, because what an editor
saves is a program *plus* its input values plus whatever else that host needs. Core knows
nothing about it.

Keeping them apart means a host can change its own document shape without touching the language,
and core can change the program format without knowing what anyone wrapped it in.

**Next:** [the glossary](../glossary/), for anything above that was a word you had to take on
trust.
