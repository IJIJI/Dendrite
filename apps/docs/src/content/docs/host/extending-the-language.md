---
title: "Extending the language"
description: "Register a type, an op, an evaluator, an operator - and make an op's types follow its inputs."
sidebar:
  order: 3
---

A language is a set of registrations. The standard library is one; yours is the standard library
plus whatever your application needs its programs to say. This page builds three additions end to
end, and every snippet on it was run against the language before it was written down.

```ts
import { BP, createStdlib, elementOf, operationNode, Type } from "@dendrite-lang/core";

const language = createStdlib();
```

Start from `createStdlib()` to build on the standard library, or `createLanguage()` for the bare
grammar with no ops at all. Register before you create an environment from it.

## A type with fields

```ts
language.registerType("Reading", {
  fields: { celsius: Type.number, room: Type.string },
});
```

Now an input can be declared as a `Reading`, and the analyser checks field access against those
fields. A program reading `$reading.room` gets a `string`. A program reading `$reading.nope` gets
`unknown_field` before it runs.

A type may also `extends` another named type, which makes it compatible wherever its parent is
expected, and may narrow a field it inherits but not change it to something incompatible. And it
may carry a `schema`, a zod validator for its values, with one restriction explained in
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

Worth filling in while you are here: `category` groups the op in a generated reference,
`description` is one plain sentence for that reference and for editor hover, and `examples` are
complete programs a test can load. The standard library's own reference is generated from exactly
these fields.

An evaluator gets its inputs already evaluated and returns a value. It should not throw for ordinary
bad input - return something sensible - because a throw becomes a `host_error` on the program's
outputs.

## An operator as sugar

```ts
language.registerInfix("%", BP.MULTIPLY, (left, right) =>
  operationNode("Mod", { a: left, b: right }),
);
```

`7 % 2{:den}` now parses, and it becomes `Mod(7, 2){:den}` during parsing. There is no operator
node: the build function returns an op node, and nothing after the parser can tell which spelling
was used. The lexer needs no edit, because it takes its operator vocabulary from the grammar.

`BP` is the precedence ladder, and using its tiers is what keeps independent additions agreeing
with each other: `BP.MULTIPLY` binds tighter than `BP.ADD`, which binds tighter than comparison, and
so on. A build function can return a whole tree, which is how the standard library's `>=` becomes
`Not(LessThan(…))`. `registerPrefix` does the same for a unary operator.

## Types that follow the inputs

A signature is the general case. When an op can say something more specific about a particular
call, give its evaluator an `inferOutput`:

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

`Last([10, 20, 30]){:den}` is now a `number`, not an `any`. `inferOutput` is handed the resolved type
of each input and returns the output type, or `undefined` to fall back to the declared `output`.

Its partner is `inferInputTypes`, for an input whose expected type depends on the others. It is how
`Filter` tells your lambda its parameter is the list's element type: it returns the expected types,
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
`op_input_type_mismatch` as a mistake in a call to `Add`.

**Next:** [the packages](../packages/core/).
