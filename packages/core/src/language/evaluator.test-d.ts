//? Type-level checks of an evaluator's inputs, typed from the op's declaration (`InputsOf`,
// registry.ts; the lazy keys since 0.7.0, every key since 0.8.1). `yarn typecheck` reads this
// file (the package's tsconfig includes src/**/*) and vitest never runs it (it runs *.test.ts
// only). The shapes above the line compile with no cast; each `@ts-expect-error` below it is a
// mistake an author can make, and the file stops compiling the day the typing stops catching
// one.
import { type OpInput } from "./infra/registry";
import { Type } from "./infra/types";
import { createLanguage } from "./language";

const lang = createLanguage();

export const If = lang.registerOp({
  name: "If",
  inputs: [
    { name: "condition", type: Type.boolean },
    { name: "then", type: Type.any, lazy: true },
    { name: "else", type: Type.any, lazy: true },
  ],
  output: Type.any,
});
export const And = lang.registerOp({
  name: "And",
  inputs: [{ name: "nodes", type: Type.boolean, variadic: true, lazy: true }],
  output: Type.boolean,
});
export const Opt = lang.registerOp({
  name: "Opt",
  inputs: [{ name: "fallback", type: Type.any, lazy: true, required: false }],
  output: Type.any,
});
export const Add = lang.registerOp({
  name: "Add",
  inputs: [{ name: "nodes", type: Type.number, variadic: true }],
  output: Type.number,
});
export const Round = lang.registerOp({
  name: "Round",
  inputs: [
    { name: "value", type: Type.number },
    { name: "digits", type: Type.number, required: false },
  ],
  output: Type.number,
});
export const Join = lang.registerOp({
  name: "Join",
  inputs: [
    { name: "parts", type: Type.array(Type.string), convert: true },
    { name: "separator", type: Type.string, required: false },
  ],
  output: Type.string,
});
export const Filter = lang.registerOp({
  name: "Filter",
  inputs: [
    { name: "list", type: Type.array(Type.any) },
    { name: "predicate", type: Type.fn([Type.any], Type.boolean) },
  ],
  output: Type.array(Type.any),
});
export const Guard = lang.registerOp({
  name: "Guard",
  inputs: [
    { name: "reading", type: Type.name("Reading") },
    { name: "fallback", type: Type.number, lazy: true },
  ],
  output: Type.number,
});
export const IsSet = lang.registerOp({
  name: "IsSet",
  inputs: [{ name: "value", type: Type.any }],
  output: Type.boolean,
});

// A lazy input is a Thunk, a lazy variadic one a Thunk[], a lazy optional one may be absent.
lang.registerEvaluator({
  op: If,
  evaluate: ({ condition, then, else: e }) => (condition ? then.value : e.value),
});
lang.registerEvaluator({ op: And, evaluate: ({ nodes }) => nodes.every((n) => n.value) });
lang.registerEvaluator({ op: Opt, evaluate: ({ fallback }) => fallback?.value });
// A strict key is its declared type: a variadic number is number[], an optional one may be
// absent, a converting string[] is string[], a function is an FnValue, a lazy number is a
// Thunk<number>, and `any` and a host type are unknown.
lang.registerEvaluator({ op: Add, evaluate: ({ nodes }) => nodes.reduce((a, b) => a + b, 0) });
lang.registerEvaluator({ op: Round, evaluate: ({ value, digits }) => value + (digits ?? 0) });
lang.registerEvaluator({
  op: Join,
  evaluate: ({ parts, separator }) => parts.join(separator ?? ""),
});
lang.registerEvaluator({
  op: Filter,
  evaluate: ({ list, predicate }) => list.filter((item) => Boolean(predicate(item))),
});
lang.registerEvaluator({
  op: Guard,
  evaluate: ({ reading, fallback }) => (reading === null ? fallback.value + 1 : reading),
});
lang.registerEvaluator({ op: IsSet, evaluate: ({ value }) => value !== null });
// An op by name keeps every input `unknown`, as before 0.7.0.
lang.registerEvaluator({ op: "Add", evaluate: ({ a }) => a });
// So does an op whose inputs are a variable typed OpInput[] (built in a loop): the names and
// types are not literal then, and `InputsOf` has nothing to read.
const built: OpInput[] = [{ name: "a", type: Type.number }];
export const Loose = lang.registerOp({ name: "Loose", inputs: built, output: Type.number });
lang.registerEvaluator({ op: Loose, evaluate: (inputs) => inputs["a"] });

// @ts-expect-error a strict key is not a Thunk
lang.registerEvaluator({ op: If, evaluate: ({ condition }) => condition.value });
// @ts-expect-error a key the op does not declare does not exist
lang.registerEvaluator({ op: If, evaluate: ({ nope }) => nope.value });
// @ts-expect-error a lazy variadic input is a Thunk[], not one Thunk
lang.registerEvaluator({ op: And, evaluate: ({ nodes }) => nodes.value });
// @ts-expect-error an op by name declares nothing, so `then` is unknown
lang.registerEvaluator({ op: "If", evaluate: ({ then }) => then.value });
// @ts-expect-error a lazy optional input may be absent
lang.registerEvaluator({ op: Opt, evaluate: ({ fallback }) => fallback.value });
// @ts-expect-error a number key has no toUpperCase
lang.registerEvaluator({ op: Round, evaluate: ({ value }) => value.toUpperCase() });
// @ts-expect-error a variadic number is number[], not a number
lang.registerEvaluator({ op: Add, evaluate: ({ nodes }) => nodes + 1 });
// @ts-expect-error an optional input may be undefined
lang.registerEvaluator({ op: Round, evaluate: ({ digits }) => digits + 1 });
// @ts-expect-error a lazy number is a Thunk<number>, read through .value
lang.registerEvaluator({ op: Guard, evaluate: ({ fallback }) => fallback + 1 });
// @ts-expect-error a host type is unknown
lang.registerEvaluator({ op: Guard, evaluate: ({ reading }) => reading + 1 });
// @ts-expect-error an op by name declares nothing, so `nodes` is unknown
lang.registerEvaluator({ op: "Add", evaluate: ({ nodes }) => nodes.length });
