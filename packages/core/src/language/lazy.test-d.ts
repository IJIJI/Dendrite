//? Type-level checks of the lazy input's typing. `yarn typecheck` reads this file (the package's
// tsconfig includes src/**/*) and vitest never runs it (it runs *.test.ts only). The shapes
// above the line compile with no cast; each `@ts-expect-error` below it is a mistake an author
// can make, and the file stops compiling the day the typing stops catching one.
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

// A lazy input is a Thunk, a lazy variadic one a Thunk[], a lazy optional one may be absent.
lang.registerEvaluator({
  op: If,
  evaluate: ({ condition, then, else: e }) => (condition ? then.value : e.value),
});
lang.registerEvaluator({ op: And, evaluate: ({ nodes }) => nodes.every((n) => n.value) });
lang.registerEvaluator({ op: Opt, evaluate: ({ fallback }) => fallback?.value });
// An op by name keeps every input `unknown`, as before 0.7.0.
lang.registerEvaluator({ op: "Add", evaluate: ({ a }) => a });

// @ts-expect-error a strict key is not a Thunk
lang.registerEvaluator({ op: If, evaluate: ({ condition }) => condition.value });
// @ts-expect-error a key the op does not declare is unknown
lang.registerEvaluator({ op: If, evaluate: ({ nope }) => nope.value });
// @ts-expect-error a lazy variadic input is a Thunk[], not one Thunk
lang.registerEvaluator({ op: And, evaluate: ({ nodes }) => nodes.value });
// @ts-expect-error an op by name declares nothing, so `then` is unknown
lang.registerEvaluator({ op: "If", evaluate: ({ then }) => then.value });
// @ts-expect-error a lazy optional input may be absent
lang.registerEvaluator({ op: Opt, evaluate: ({ fallback }) => fallback.value });
