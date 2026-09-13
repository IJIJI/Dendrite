---
title: "Types in practice"
description: "What the checker tells you, and how to read it."
sidebar:
  order: 5
---

Every value in Dendrite has a type, and the checker runs before anything else does. A number
where a boolean belongs is a message with a line and a column, not a surprise halfway through
an evaluation.

```den fails inputs="score:number"
// $score is a number; And wants booleans.
output ok = And($score, true)
```

That is an `op_input_type_mismatch{:den}`. The program above does not run at all.

## The types you will meet

Four primitives, written as you would guess: `number{:den}`, `string{:den}`, `boolean{:den}`,
and the two that behave specially, `any{:den}` and `null{:den}`.

Lists are written with `[]{:den}` after the element type, so `number[]{:den}` is a list of
numbers and `string[][]{:den}` a list of lists of strings. Functions are written with an arrow:
`(number) -> boolean{:den}` is what `Filter{:den}` wants for its predicate. Neither of those is
registered anywhere - they are built out of other types as you need them, which is why there is
no list of "all the array types".

An application can add named types of its own, with fields and with a parent type they extend.
Those arrive alongside the inputs that use them, and the editor shows you what they hold.

## A list knows what is in it

You never write the element type of a literal list. It is read off the contents:

```den
let numbers = [4, 8, 15]
output total = Average(numbers)
```

`numbers{:den}` is a `number[]{:den}`, so `Average{:den}` accepts it. Hand it a list of strings
and it will not.

A list of mixed contents falls back to `any[]{:den}`, which still works but tells the checker
less, and you will notice the difference the first time you pass it somewhere fussy.

## `any` accepts anything, and asks nothing

`any{:den}` is the type an application uses when it genuinely does not know what a value will
be. A value of any data type flows into it, and a value of type `any` flows into any data type,
which means:

```den
output length = Length($whatever)
```

That compiles whatever `$whatever{:den}` is declared as, `any{:den}` included. If it turns out
to hold a number at runtime, `Length{:den}` fails then, and the failure is reported as a
runtime error on the outputs rather than as a diagnostic.

So `any` is an escape hatch with a cost: you trade the check for the flexibility. When you see
an `implicit_any_cast{:den}` warning, that is the checker telling you where the trade happened,
in case you did not mean it.

The one thing `any` will **not** accept is a function. That single exception is what keeps the
language total, and it is explained in
[the type system](../../../how-it-works/types/) under How it works.

## `null` goes anywhere

An input with no value yet holds `null{:den}`, and `null` is accepted wherever a data value is
expected. A program over unset inputs therefore still compiles and still runs, rather than
refusing to start.

It will not produce sensible numbers, which is what `Default{:den}` and `IsSet{:den}` are for -
see [Inputs](../inputs/).

## Reading a message

Diagnostics come in two severities and they mean different things.

- An **error** stops the output that depends on it. The rest of the program still runs: this
  language checks each output on its own, so one broken result does not take the others with it.
- A **warning** changes nothing. It is telling you something is pointless or lossy: a binding
  nothing reads, an op input that does not exist, a value going into `any{:den}`.

Every message names its kind, and every kind has an entry with an example that triggers it in
[the diagnostics catalogue](../../../how-it-works/diagnostics/). When you meet one you do not
recognise, that is where it is written down.

**Next:** [How a program runs](../../how-a-program-runs/), which puts the whole chain in one
picture.
