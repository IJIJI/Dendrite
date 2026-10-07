import { den } from "../infra/serialise";
import { type Language } from "../language";
import { Type } from "../infra/types";
import { toList } from "./shared";

//? The array segment: the ops over a list as a whole - measuring it, combining lists, asking
// what it holds. The ops that take a function over a list are the list segment.
export function installArray(lang: Language): void {
  lang.registerOp({
    name: "Length",
    inputs: [{ name: "list", type: Type.array(Type.any) }],
    output: Type.number,
    category: "array",
    description: "How many items list holds.",
    examples: [den`output count = Length([4, 8, 15])`],
  });
  lang.registerEvaluator({
    op: "Length",
    evaluate: ({ list }) => toList(list).length,
  });

  // Variadic: each argument is ONE array (the per-arg type), collected into an
  // array-of-arrays at eval time and joined one level.
  lang.registerOp({
    name: "Concat",
    inputs: [{ name: "arrays", type: Type.array(Type.any), variadic: true }],
    output: Type.array(Type.any),
    category: "array",
    description: "One array of every given array's items, in order.",
    examples: [den`output all = Concat([1, 2], [3], [4, 5])`],
  });
  lang.registerEvaluator({
    op: "Concat",
    evaluate: ({ arrays }) => toList(arrays).map(toList).flat(),
    // Two `number[]` make a `number[]`; lists of different types stay `any[]`.
    inferOutput: (inputTypes) => {
      const arrays = inputTypes["arrays"];
      return arrays?.kind === "array" ? arrays : undefined;
    },
  });

  lang.registerOp({
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
    op: "Flatten",
    evaluate: ({ array, depth }) => toList(array).flat(depth as number),
  });

  lang.registerOp({
    name: "Average",
    inputs: [{ name: "list", type: Type.array(Type.number) }],
    output: Type.number,
    category: "array",
    description: "The mean of the numbers in list.",
    examples: [den`output mean = Average([4, 8, 15])`],
  });
  lang.registerEvaluator({
    op: "Average",
    evaluate: ({ list }) => {
      const numbers = toList(list) as number[];
      return numbers.reduce((sum, n) => sum + n, 0) / numbers.length || 0;
    },
  });

  lang.registerOp({
    name: "Max",
    inputs: [{ name: "list", type: Type.array(Type.number) }],
    output: Type.number,
    category: "array",
    description: "The largest number in list.",
    examples: [den`output top = Max([4, 8, 15])`],
  });
  lang.registerEvaluator({
    op: "Max",
    // Empty → 0 (matches Average's convention; the natural "none" for non-negative
    // ordinals like TallyState). reduce (no spread) avoids call-stack limits on big lists.
    evaluate: ({ list }) => {
      const numbers = toList(list) as number[];
      return numbers.length === 0 ? 0 : numbers.reduce((m, n) => (n > m ? n : m));
    },
  });

  lang.registerOp({
    name: "Min",
    inputs: [{ name: "list", type: Type.array(Type.number) }],
    output: Type.number,
    category: "array",
    description: "The smallest number in list.",
    examples: [den`output low = Min([4, 8, 15])`],
  });
  lang.registerEvaluator({
    op: "Min",
    // Empty → 0 (matches Average's convention; the natural "none" for non-negative
    // ordinals like TallyState). reduce (no spread) avoids call-stack limits on big lists.
    evaluate: ({ list }) => {
      const numbers = toList(list) as number[];
      return numbers.length === 0 ? 0 : numbers.reduce((m, n) => (n < m ? n : m));
    },
  });

  lang.registerOp({
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
    op: "Includes",
    evaluate: ({ list, value }) => toList(list).includes(value),
  });
}
