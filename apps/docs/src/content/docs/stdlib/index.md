---
title: "The standard library"
description: "What `stdlib` is, how its ops are called, and the conventions every page beside this one assumes."
sidebar:
  order: 1
---

_These pages are for writing programs. Building on the library, or replacing parts of it, is under [Host developers](../host/extending-the-language/)._

The standard library is a language: the primitive types, the ops every application has, and the
operators that are sugar over them. It is what you get before your application adds anything of
its own.

The pages beside this one are **generated from the library itself**, one per segment, each op
with its real signature and an example that was run to produce the value shown. They cannot
drift from the code, because they are read out of it at build time.

This page is the part that is not generated: the conventions all of them assume.

## Reading a signature

Every entry leads with one, and it is the real one, printed from the op:

`Filter(list: any[], predicate: (any) -> boolean) -> any[]{:den}`

The name, then each input with its type, then what comes out. Those input names are the ones you
use when you pass arguments by name rather than in order, which
[Operators and ops](../learn/writing/operators-and-ops/) covers. The rest of this page is the
parts of a signature that are not obvious on sight.

## Variadic inputs

A signature ending in `...{:den}` takes as many values as you give it:

```den
output sum   = Add(1, 2, 3, 4)
output any   = Or($a, $b, $c)
output joined = Concat([1, 2], [3], [4, 5])
```

`Add(nodes...: number){:den}` means one input called `nodes` that swallows every argument. Six
ops work this way: `And{:den}`, `Or{:den}`, `Xor{:den}`, `Add{:den}`, `Multiply{:den}` and
`Concat{:den}`.

The operator form of a variadic op takes two at a time, so `1 + 2 + 3{:den}` nests where
`Add(1, 2, 3){:den}` does not. Same answer; the op form says "sum these" more directly.

## `any` in a signature

An input typed `any{:den}` accepts any data value. `Length(list: any[]){:den}` takes a list of
anything, `Equals(a: any, b: any){:den}` compares anything with anything.

This is not the op being careless. It is the op saying it does not care, which is true:
`Length{:den}` counts without looking inside. What you lose is the check. Pass `Length{:den}` a
list of strings and nothing complains, because nothing needed to.

Where an op *can* be more precise, it is - which is the next convention.

## Some output types depend on the inputs

A signature is the general shape. Several ops narrow it for the particular call:

```den
let numbers = [4, 8, 15]
output kept = Filter(numbers, n => n > 10)
```

`Filter{:den}`'s signature says `-> any[]{:den}`, but this call produces a `number[]{:den}`,
because the list it was given was one. The same holds for `Map{:den}` (from its function's
return type), `Find{:den}` (the element type), `Reduce{:den}` (from the starting value) and
`If{:den}`, which gives you the branch type when both branches agree and `any{:den}` when they
do not.

So the reference tells you what an op accepts, and the editor tells you what your call
produced. When they differ, the editor is right.

## Function-typed inputs

An input written `(number) -> boolean{:den}` wants a function. Six list ops have one, and
between them they are how iteration is expressed:

```den
let items = [4, 8, 15, 16, 23]
output big = Filter(items, item => item > 10)
```

There is nothing special about those ops. A function is a value in this language, so an op
taking one is an ordinary op, and you can hand it a lambda written in place or a name bound
earlier. What the signature does not show is that the parameter type is worked out for you: the
`item{:den}` above is a `number` because `items` is a list of numbers, so you rarely need to
annotate it.

[Lambdas and lists](../learn/writing/lambdas-and-lists/) covers writing them.

## The segments

The ops are grouped, and the grouping is real: it is a field on each op, which is what splits
these pages up.

| Segment | What is in it |
| --- | --- |
| [logic](./logic/) | `And`, `Or`, `Xor`, `Not` |
| [comparison](./comparison/) | `Equals`, `NotEquals`, `LessThan`, `GreaterThan` |
| [control](./control/) | `If`, `Default`, `IsSet` |
| [array](./array/) | `Length`, `Concat`, `Includes`, `Average`, `Min`, `Max`, `Flatten` |
| [arithmetic](./arithmetic/) | `Add`, `Subtract`, `Multiply`, `Divide` |
| [list](./list/) | `Filter`, `Map`, `Reduce`, `Find`, `Some`, `Every` |

Today an application takes the whole library or none of it. The segments are the seam along
which that will change, so that an application which never touches a list need not carry the
list ops, and these pages can tell you which segments *your* application has. Until then, if
you are reading this inside somebody's product, assume all of them and check the editor's own
lists for anything extra.

## What your application adds

Everything here is the floor, not the ceiling. An application embedding Dendrite registers its
own types and its own ops, and those behave exactly like these: same call syntax, same checking,
same reference format if it generates one. You cannot tell from a program whether `Filter{:den}`
came from the standard library or from the application, and that is the point.

**Next:** the segment pages beside this one, or [How it works](../how-it-works/the-chain/) for
what happens to a program that uses them.
