---
title: "Glossary"
description: "The words this documentation uses, and what each one means precisely."
sidebar:
  order: 7
---

Every term the rest of the documentation leans on. Written last, from the words the other pages
actually needed.

## The language

**Binding** - a name for a value, written `let{:den}`. Computed at most once per evaluation
however many names read it. Private to the program.

**Output** - a name whose value leaves the program, written `output{:den}`. Which names may be
outputs is declared outside the program; see *port layer*.

**Input** - a value the program reads but does not compute, written `$name{:den}`. Supplied by
the host, or by a user typing into a pane.

**Op** - a named function with named inputs and one output. Everything that computes is one.
Supplied by the standard library or by the host.

**Operator** - surface syntax for an op, registered alongside it. `+{:den}` is sugar for
`Add{:den}`. Operators are rewritten during parsing and leave no trace afterwards, and one
operator may expand into more than one op call.

**Lambda** - a function written inline, `item => item > 10{:den}`. A value like any other, with
real lexical closure over what surrounded it.

**Higher-order op** - an op with a function-typed input, such as `Filter{:den}`. Not a special
kind of op; just an op whose input happens to be a function.

**Strongly normalising** - every program finishes. Guaranteed by two rules: a name cannot refer
to itself, and a function is never accepted where `any{:den}` is expected. See
[the type system](../types/).

## Types

**Named type** - a type registered in the language's table, identified by its name:
`number{:den}`, `Bus{:den}`.

**Structural type** - an array or a function type, built from other types rather than
registered. Two are the same type when their parts are.

**`any`** - accepts any *data* value, in both directions, and never a function. The escape hatch
a host uses when it does not know a value's type. Each crossing warns.

**`null`** - the value an unset input holds, accepted wherever a data value is expected, so a
program over unset inputs still runs.

**`extends`** - a named type declaring a parent. Compatibility walks the chain.

**Covariant, contravariant** - which way a type may vary and stay compatible. Arrays are
covariant in their element; functions are contravariant in their parameters and covariant in
their return.

## The chain

**Vocabulary** - what a language has: types, ops, evaluators, operators. Deliberately *not*
inputs and outputs.

**Descriptor** - what a program is actually checked against: a vocabulary with port layers
composed onto it. Built per program.

**Raw program** - the parsed program: bindings and outputs as untyped AST nodes. The form that
gets stored.

**Core program** - the analysed program: types resolved, `dependsOn` computed, unreachable
bindings pruned. What runs, and rebuilt rather than stored.

**`dependsOn`** - per node, the set of input names it reaches. Computed once during analysis;
the whole basis of incremental evaluation.

**Pruning** - dropping the bindings no output can reach, at the end of analysis. They warn on
the way out.

**Diagnostic** - an error or a warning about a program. An error stops the output that depends
on it; a warning changes nothing. A *runtime* failure is not a diagnostic: it arrives on the
outputs.

## Ports

**Ports** - a bundle of declarations: inputs, outputs, and the types they need.

**Port layer** - ports plus an id plus a policy. Layers stack, and the first to claim a name
keeps it.

**Policy** - three fields on a layer: `editable`, `feeds`, `persisted`. Core reads the fields
and never branches on a layer's kind.

**Persisted layer** - the one layer saved with the program: the document's own declarations. At
most one per instance.

**Provenance** - which layer placed each name. What lets an editor say where a declaration came
from and who may change it.

**Global versus program level** - a layer on the runtime, shared by every program on it, versus
a layer on one instance.

## Running it

**Environment** - a language wrapped with its pipeline. A *program* environment is one bound to
a composed descriptor, and only that one can analyse.

**Runtime** - many programs over one language and one set of global layers, with shared input
values.

**Instance** - one program on a runtime, with its own layers, its own values, and the
observables a host watches. The front door for a host.

**Stale** - the outputs on screen came from a program that is no longer the one in the editor.
Real values, flagged, not hidden.

**Snapshot** - everything a save would capture: the program, its ports, and its input values.

## Around the language

**Host** - the application embedding Dendrite. Declares inputs and outputs, supplies values,
acts on outputs, and may add ops and types.

**Connection** - how an editor reaches a program: its own stack, a runtime the host runs, or an
instance the host already has.

**Replica** - an instance reached across a channel by `@dendrite-lang/link`, indistinguishable
from a local one to the editor.

**Trust boundary** - the serving side of a link. Policy is enforced there, because a replica's
messages are input, not instruction.
