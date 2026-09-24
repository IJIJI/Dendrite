---
title: "Extending the language"
description: "Register a type, an op, an evaluator, a symbol; let an input convert; make an op's types follow its inputs."
sidebar:
  order: 3
---

A language is a set of registrations. The standard library is one; yours is the standard library
plus whatever your application needs its programs to say. This page builds three additions end to
end, and a test typechecks every snippet on it against the language it extends.

```ts
import {
  BP,
  Convert,
  createEnvironment,
  createStdlib,
  elementOf,
  operationNode,
  Type,
} from "@dendrite-lang/core";

const language = createStdlib();
```

Start from `createStdlib(){:ts}` to build on the standard library, or `createLanguage(){:ts}` for the bare
grammar with no ops at all. Register before you create an environment from it.

## A type with fields

```ts
language.registerType("Reading", {
  fields: { celsius: Type.number, room: Type.string },
});
```

Now an input can be declared as a `Reading`, and the analyser checks field access against those
fields. A program reading `$reading.room{:den}` gets a `string{:den}`. A program reading `$reading.nope{:den}` gets
`unknown_field{:den}` before it runs.

A type may also `extends{:ts}` another named type, which makes it compatible wherever its parent is
expected, and may narrow a field it inherits but not change it to something incompatible. And it
may carry a `schema{:ts}`, a zod validator for its values, with one restriction explained in
[persistence](../../how-it-works/persistence/): a type declared in a saved program's own layer
cannot carry one, because a function does not survive being saved.

## An op, and what runs it

An op is two registrations: its **definition**, which is what the analyser checks, and its
**evaluator**, which is what runs.

```ts
language.registerOp({
  name: "Mod",
  category: "arithmetic",
  description: "The remainder of a divided by b.",
  inputs: [
    { name: "a", type: Type.number },
    { name: "b", type: Type.number },
  ],
  output: Type.number,
});

language.registerEvaluator({
  op: "Mod",
  evaluate: ({ a, b }) => (a as number) % (b as number),
});
```

`Mod(7, 2){:den}` now works in any program on this language, with the same checking, the same call
syntax, and the same named arguments as anything in the standard library. A program cannot tell
where an op came from.

Keep the two halves in step. An op with no evaluator, or an evaluator for an op that does not exist,
makes the language itself invalid, and composing it **throws** rather than reporting: there is no
program to blame. Catch that in a test of your own language, not in production.

Worth filling in while you are here: `category{:ts}` groups the op in a generated reference,
`description{:ts}` is one plain sentence for that reference and for editor hover, and `examples{:ts}` are
complete programs a test can load, written with the `den{:ts}` tag. (That tag is a JavaScript
template literal, so an example that itself contains a Dendrite template, with its backticks, is
written with `serialiseSource{:ts}` instead.) The standard library's own reference is generated from
exactly these fields.

An input a caller may leave out is declared `required: false{:ts}`. The analyser then raises no
`missing_op_input{:den}` for it, and the evaluator is handed `undefined{:ts}`, so it supplies its own
default. The standard library's `Join{:den}` does this for its separator:

```ts sketch
inputs: [
  { name: "parts", type: Type.array(Type.string), convert: true },
  { name: "separator", type: Type.string, required: false },
],
```

Without that flag a missing input is a warning, and the type's own default stands in (`0`, the
empty string, `false`), which is why a half-written call still runs.

### An input that converts

The other flag in that declaration, `convert: true{:ts}`, is why `Join([1, 2], ", "){:den}` is `"1, 2"`
with no `ToString{:den}` and no warning. The language converts nothing on its own; an op can
declare that it does, one input at a time. The analyser then accepts a value of the declared
**shape** with any data at the leaves (a list of anything for `string[]{:ts}`), and before the op
runs, the evaluator converts each leaf with the same rules `ToString{:den}`, `ToNumber{:den}` and
`ToBool{:den}` use, so your evaluator sees the type it declared. The reference marks such an input
`parts~{:den}` and writes a sentence under the signature, generated from the flag.

```ts
language.registerOp({
  name: "Twice",
  category: "arithmetic",
  inputs: [{ name: "n", type: Type.number, convert: true }],
  output: Type.number,
  description: "n, doubled; text that reads as a number is accepted.",
});

language.registerEvaluator({
  op: "Twice",
  // n arrives as a number, or as null when the value had no reading as one.
  evaluate: ({ n }) => (n === null ? null : (n as number) * 2),
});
```

`Twice("12"){:den}` is `24`, and so is `Twice(t){:den}` where `t{:den}` is text an input holds. Two things
to know before you reach for it:

- **A caller's mistake on that input is converted, not reported.** That is what the flag means,
  and why it is opt-in per input. It is free for text: every value has a text form, and the worst
  case is a list printed as JSON. Take care with `number{:ts}`: a value with no reading as a number
  becomes `null{:den}`, so the evaluator has to handle a null, as the one above does. The standard
  library converts to text only, on `Join{:den}`, and converts nothing to a boolean: a number read as
  a condition is the coercion the language turned down first, and `ToBool{:den}` stays explicit.
- **Only `string{:ts}`, `number{:ts}`, `boolean{:ts}` or a list of them can carry the flag**, since
  those are the types with a rule. A struct, a function or `any{:ts}` cannot, and neither can a
  variadic input (nothing needs it) nor an optional one (an absent value would arrive converted,
  as `""{:den}`, rather than absent). A declaration that breaks this is an
  `invalid_convert_input{:den}`, and like a missing evaluator it throws when the language composes.

### Converting the way the language does

The three rules are exported as `Convert{:ts}`, for an evaluator that wants them on an input it did
not flag, typically one declared `any{:ts}`:

```ts
language.registerOp({
  name: "Shout",
  category: "string",
  inputs: [{ name: "value", type: Type.any }],
  output: Type.string,
  description: "The value as text, in capitals, with an exclamation mark.",
});

language.registerEvaluator({
  op: "Shout",
  evaluate: ({ value }) => Convert.toString(value).toUpperCase() + "!",
});
```

`Convert.toString{:ts}` gives `""{:ts}` for a null, writes a number or a boolean out, and gives a list
or a struct its JSON. `Convert.toNumber{:ts}` reads a plain decimal and gives `null{:ts}` for anything
else, `"0x10"{:ts}` and `"Infinity"{:ts}` included. `Convert.toBool{:ts}` is false for `false{:ts}`, `0{:ts}`,
the empty string, null and an empty list. Using them, rather than `String(){:ts}` or `Number(){:ts}`,
is what keeps a host op's idea of a value in step with the language's.

An evaluator gets its inputs already evaluated and returns a value. It should not throw for ordinary
bad input (return something sensible instead), because a throw becomes a `host_error{:den}` on the program's
outputs.

## A symbol as sugar

```ts
language.registerInfix("%", BP.MULTIPLY, (left, right) =>
  operationNode("Mod", { a: left, b: right }),
);
```

`7 % 2{:den}` now parses, and it becomes `Mod(7, 2){:den}` during parsing. There is no symbol
node: the build function returns an op node, and nothing after the parser can tell which spelling
was used. The lexer needs no edit, because it takes its symbol vocabulary from the grammar.

`BP{:ts}` is the precedence ladder, and using its tiers is what keeps independent additions agreeing
with each other: `BP.MULTIPLY{:ts}` binds tighter than `BP.ADD{:ts}`, which binds tighter than comparison, and
so on. A build function can return a whole tree, which is how the standard library's `>={:den}` becomes
`Not(LessThan(…)){:den}`. `registerPrefix{:ts}` does the same for a prefix symbol.

A symbol can be a word. The language's own `as{:den}` is one, registered with `registerWordLed{:ts}`,
which takes a binding power and a parse function like any infix handler and fires only after an
expression, so the word stays an ordinary name everywhere else. The lexer reads letters as an
identifier before it reads the symbol list, which is why `registerInfix("plus", …){:ts}` is refused
at registration, with a message that names `registerWordLed{:ts}`.

## Types that follow the inputs

A signature is the general case. When an op can say something more specific about a particular
call, give its evaluator an `inferOutput{:ts}`:

```ts
language.registerOp({
  name: "Last",
  category: "array",
  inputs: [{ name: "list", type: Type.array(Type.any) }],
  output: Type.any,
});

language.registerEvaluator({
  op: "Last",
  evaluate: ({ list }) => (list as unknown[]).at(-1) ?? null,
  inferOutput: ({ list }) => (list ? elementOf(list) : undefined),
});
```

`Last([10, 20, 30]){:den}` is now a `number{:den}`, not an `any{:den}`. `inferOutput{:ts}` is handed the resolved type
of each input and returns the output type, or `undefined{:ts}` to fall back to the declared `output`.

Its partner is `inferInputTypes{:ts}`, for an input whose expected type depends on the others. It is how
`Filter{:den}` tells your lambda its parameter is the list's element type: it returns the expected types,
overriding the static ones, for inputs declared **after** the ones they depend on. Use it whenever
an op takes a function over something else it was given.

## Using it

Nothing else changes. Build an environment from the extended language, and every program on it can
use what you added:

```ts
const env = createEnvironment(language);
```

```
output odd    = 7 % 2 == 1
output latest = Last([10, 20, 30])
```

(Shown plain rather than highlighted: the site highlights and checks samples against the standard
library, which has neither `%` nor `Last`. Your own editor, built from your language, knows both.)

The editor highlights your ops like its own, because it reads the same language. The diagnostics
catalogue covers your additions too, since a mistake in a call to `Mod` is the same
`op_input_type_mismatch{:den}` as a mistake in a call to `Add{:den}`.
