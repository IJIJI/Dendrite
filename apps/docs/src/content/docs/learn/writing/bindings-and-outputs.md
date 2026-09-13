---
title: "Bindings and outputs"
description: "let, output, and why there is no sequencing."
sidebar:
  order: 1
---

A program is a set of names. `let{:den}` makes a name for your own use; `output{:den}` makes one
the outside world can read.

```den
let subtotal = 12.5 * 2
let shipping = 4.95
output total = subtotal + shipping
```

Three names, one of them public. Whoever runs this program asks for `total{:den}` and gets
`29.95`. They cannot ask for `subtotal{:den}`: that is working, not a result.

## A binding is a value, not a recipe

`subtotal{:den}` is computed at most once per evaluation, no matter how many names read it.

```den
let base    = 100
let withTax = base * 1.2
let shipping = base * 0.1
output total = withTax + shipping
```

`base{:den}` is one number that two names share, not an expression pasted into both. This
matters more than it looks: a binding that reads an input is recomputed only when that input
changes, and everything reading the binding gets the cached value.

## Declare before you use

The order of the lines is not what makes the program work. The analyser reads the dependencies
and sorts the names itself, so nothing in the machinery needs `items{:den}` to come before the
name that reads it.

Written as code, though, you do have to put it first:

```den fails
output report = summary
let summary   = Length(items)
let items     = [4, 8, 15]
```

That is a `forward_reference{:den}` error, and it is a rule about your *text*, not about the
language: code is read top to bottom, so it should be written that way. The same program built
in the graph editor, where there is no top and no bottom, carries no such rule. Turn it the
right way up and it is fine:

```den
let items     = [4, 8, 15]
let summary   = Length(items)
output report = summary
```

A **cycle** is a different matter and always an error. If `a{:den}` reads `b{:den}` and `b`
reads `a`, neither has a value in any order, and you get a `binding_cycle{:den}` before
anything runs. That is also why a name cannot refer to itself, and why every Dendrite program
finishes.

## Nothing changes under you

There is no assignment in Dendrite, so a name cannot be updated. This is not a restriction the
language imposes for tidiness, it is what makes the caching sound: if `subtotal{:den}` could be
28 on one line and 30 on the next, nothing could be reused.

The consequences are worth stating plainly:

- **No `;`** and no statements. The lines of a program are declarations, in any order.
- **No mutation**, so no `x = x + 1{:den}`. Name the new value instead.
- **No side effects.** Evaluating a program produces values and changes nothing else.

## An unused binding is a warning

A `let{:den}` that no output can reach does nothing, so the analyser says so and drops it from
the program it hands the evaluator:

```den
let used   = 1 + 1
let unused = 99
output answer = used
```

`unused{:den}` gets an `unused_binding{:den}` warning and is pruned. Nothing breaks; you are
just told, because an unreachable binding is usually a typo or a leftover.

## Outputs the host asked for

A program does not decide what outputs exist on its own. The application embedding the language
declares which names it wants, and how much it wants them: some are **required**, and a program
missing one fails to load; some are **desired**, and a program missing one gets a warning; the
rest are optional. Declare an output nobody asked for and it is dropped with a warning.

That contract is the subject of [Ports and layers](../../../how-it-works/ports-and-layers/), under
How it works. For now: the names you may produce come from outside, and the editor shows you
which ones.

**Next:** [Inputs](../inputs/), the values that arrive from outside.
