import { den } from "../infra/serialise";
import { type Language } from "../language";
import { Type } from "../infra/types";
import { numbersOf } from "./shared";

//? The array segment: the ops over a list as a whole - measuring it, combining lists, asking
// what it holds. The ops that take a function over a list are the list segment. A list input
// holds a list when an op runs: the evaluator gives null for a null, or a value of another
// kind, before the op is called (the rule of 0.8.0), so no op here guards its list.
export function installArray(lang: Language): void {
  const Length = lang.registerOp({
    name: "Length",
    inputs: [{ name: "list", type: Type.array(Type.any) }],
    output: Type.number,
    category: "array",
    description: "How many items list holds.",
    examples: [den`output count = Length([4, 8, 15])`],
  });
  lang.registerEvaluator({
    op: Length,
    evaluate: ({ list }) => list.length,
  });

  // Variadic: each argument is ONE array (the per-arg type), collected into an
  // array-of-arrays at eval time and joined one level.
  const Concat = lang.registerOp({
    name: "Concat",
    inputs: [{ name: "arrays", type: Type.array(Type.any), variadic: true }],
    output: Type.array(Type.any),
    category: "array",
    description: "One array of every given array's items, in order.",
    examples: [den`output all = Concat([1, 2], [3], [4, 5])`],
  });
  lang.registerEvaluator({
    op: Concat,
    finiteCheck: false,
    evaluate: ({ arrays }) => arrays.flat(),
    // Two `number[]` make a `number[]`; lists of different types stay `any[]`.
    inferOutput: (inputTypes) => {
      const arrays = inputTypes["arrays"];
      return arrays?.kind === "array" ? arrays : undefined;
    },
  });

  const Flatten = lang.registerOp({
    name: "Flatten",
    inputs: [
      { name: "array", type: Type.array(Type.array(Type.any)) },
      { name: "depth", type: Type.number },
    ],
    output: Type.array(Type.any),
    category: "array",
    description: "The nested array with depth levels of nesting removed.",
    examples: [den`output flat = Flatten([[1, 2], [3, 4]], 1)`],
  });
  lang.registerEvaluator({
    op: Flatten,
    finiteCheck: false,
    evaluate: ({ array, depth }) => array.flat(depth),
  });

  const Average = lang.registerOp({
    name: "Average",
    inputs: [{ name: "list", type: Type.array(Type.number) }],
    output: Type.number,
    category: "array",
    description:
      "The mean of the numbers in list. A null item is skipped. An empty list has none, and gives null.",
    examples: [den`output mean = Average([4, 8, 15])`],
  });
  lang.registerEvaluator({
    op: Average,
    // A null item is skipped (numbersOf). Of nothing this is 0 / 0, NaN, which the evaluator
    // reads as null.
    evaluate: ({ list }) => {
      const numbers = numbersOf(list);
      return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
    },
  });

  // Max and Min start from the infinity that every number beats, so an empty list leaves it
  // standing and the evaluator reads it as null: nothing is the largest of nothing. A null item
  // is skipped, as Average skips it (numbersOf). reduce (no spread) avoids call-stack limits on
  // big lists.
  const Max = lang.registerOp({
    name: "Max",
    inputs: [{ name: "list", type: Type.array(Type.number) }],
    output: Type.number,
    category: "array",
    description:
      "The largest number in list. A null item is skipped. An empty list has none, and gives null.",
    examples: [den`output top = Max([4, 8, 15])`],
  });
  lang.registerEvaluator({
    op: Max,
    evaluate: ({ list }) => numbersOf(list).reduce((largest, n) => Math.max(largest, n), -Infinity),
  });

  const Min = lang.registerOp({
    name: "Min",
    inputs: [{ name: "list", type: Type.array(Type.number) }],
    output: Type.number,
    category: "array",
    description:
      "The smallest number in list. A null item is skipped. An empty list has none, and gives null.",
    examples: [den`output low = Min([4, 8, 15])`],
  });
  lang.registerEvaluator({
    op: Min,
    evaluate: ({ list }) =>
      numbersOf(list).reduce((smallest, n) => Math.min(smallest, n), Infinity),
  });

  const Includes = lang.registerOp({
    name: "Includes",
    inputs: [
      { name: "list", type: Type.array(Type.any) },
      { name: "value", type: Type.any },
    ],
    output: Type.boolean,
    category: "array",
    description: "True when list holds value.",
    examples: [den`output has = Includes(["a", "b"], "b")`],
  });
  lang.registerEvaluator({
    op: Includes,
    evaluate: ({ list, value }) => list.includes(value),
  });
}
