---
title: "The type system"
description: "Named and structural types, any, null, extends, and the guard that keeps programs total."
sidebar:
  order: 2
---

A type in Dendrite is a small structure, never a string. Three shapes, and only the first is
ever registered anywhere:

```ts
{ kind: "name", name: "number" }                          // number, string, Bus, …
{ kind: "array", element: Type }                          // number[]
{ kind: "function", params: Type[], returns: Type }       // (number) -> boolean
```

## Named types are registered; arrays and functions are built

A language has a table of named types. `number{:den}`, `string{:den}`, `boolean{:den}`,
`any{:den}` and `null{:den}` are in it from the start; a host adds its own.

Arrays and functions are not in any table. They are **structural**: `number[]{:den}` means
exactly "array whose element is `number`", and two of them are the same type if their elements
are. There is no registration step, no `T[]` generated per `T`, and no list of "all the array
types" - which is what makes `string[][]{:den}` and
`((number) -> boolean)[]{:den}` cost nothing to have.

It also means a type's identity is structural all the way down for those two, and nominal for
named types. `Bus{:den}` is `Bus` because it is called `Bus`.

## One function decides compatibility

Everything that asks "does this value fit there" calls `isCompatible`, and nothing re-implements
it. It is the single extension point for subtyping, and its rules are these.

**`any` is data-only, in both directions.** A data value flows into `any{:den}`, and an `any`
flows into any data type. The second direction is the unsound one and it is deliberate: it is
what lets a host say "I do not know what this is" without stopping the program. Each crossing
raises an `implicit_any_cast{:den}` warning so you can see where you traded the check away.

**A function is never `any`.** This is the one exception to the rule above and it carries a lot
of weight. See below.

**`null` flows anywhere a data value is expected.** An unset input holds `null{:den}`, so a
program over unset inputs still compiles. It is the same trade as `any` and it is why
`Default{:den}` and `IsSet{:den}` exist.

**Arrays are covariant.** `number[]{:den}` fits `any[]{:den}`, because reading is all you can do
with a list here: there is no mutation, so the usual unsoundness of covariant arrays has nothing
to bite on.

**Functions are contravariant in their parameters and covariant in their return.** A function
accepting `any{:den}` fits where one accepting `number{:den}` is wanted, because it accepts
more; one returning `number` fits where `any` is wanted, because it promises more. The ordinary
rule, and the reason `Filter{:den}` can hand your lambda a `number` when its signature says
`any`.

**`extends` makes a chain.** A named type may extend another, and compatibility walks up the
chain. A struct field may be narrowed in the extending type but not made incompatible, which is
what `incompatible_field_override{:den}` catches.

## Why a function is never `any`

This single rule is what makes every Dendrite program terminate.

Self-application is the shape recursion needs - a function that takes itself. To type it, you
need somewhere for "a function" to fit loosely, and the only candidate is `any{:den}`. Close
that door and the shape is untypable: there is no way to write the fixed-point combinator that
would let a lambda reach itself.

The other door is a name referring to itself, and that is a `binding_cycle{:den}`.

Both shut, and what you get is a language that is **strongly normalising**: every program
finishes, in time bounded by the program's own size and its data. Which matters most when you
are the one embedding it, because it means no program a user writes can hang your application.
You pay for it with no user-written recursion, and you get the list ops instead.

## A literal's type is read off it

You never annotate a list:

```den
let numbers = [4, 8, 15]
output total = Average(numbers)
```

`numbers{:den}` is `number[]{:den}`, inferred from the elements. Mixed contents fall back to
`any[]{:den}`. An empty list is `any[]{:den}` too, since there is nothing to read.

## Ops can be more precise than their signature

A signature is the general case. An op may narrow it for a particular call, through two hooks a
host can use as well:

- **`inferInputTypes`** refines what an op expects *from* what it was given. `Filter{:den}` uses
  it to tell you its predicate takes the element type of the list you passed, which is why the
  lambda parameter needs no annotation.
- **`inferOutput`** computes the concrete output type. `Filter{:den}` returns the list's own
  type, `Map{:den}` the return type of your function, `If{:den}` the branch type when both
  branches agree and `any{:den}` when they do not.

So the reference tells you what an op accepts, and the analyser tells you what your call
produced. Where those differ, the analyser is right.

## What is not here

No generics, no unions, no intersections, no optional fields. The type system is as small as it
can be while checking what programs in this language actually do, and every rule above exists
because something needed it.

**Next:** [Ports and layers](../ports-and-layers/), which is where the types a program may use
come from.
