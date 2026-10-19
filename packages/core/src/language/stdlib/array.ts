import { den } from "../infra/serialise";
import { type Language } from "../language";
import { elementOf, Type } from "../infra/types";
import { numbersOf, sameListType } from "./shared";

//? The array segment: the ops over a list as a whole - measuring it, reading an item, making
// a list from another, adding it up, asking what it holds. The ops that take a function over a
// list are the list segment. A list input holds a list when an op runs: the evaluator gives
// null for a null, or a value of another kind, before the op is called (the rule of 0.8.0), so
// no op here guards its list. Positions count from 0, and a position with no item gives null,
// never an item counted from the end. The ops that hand items on turn the finite check off:
// what they return was read by the evaluator already.

// Sort's order: numbers by value, then text by code unit, then every other item, which has no
// order of its own and keeps the one it came in (Array.prototype.sort is stable).
const kindRank = (item: unknown): number =>
  typeof item === "number" ? 0 : typeof item === "string" ? 1 : 2;
const within = (a: unknown, b: unknown): number => {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
  return 0;
};

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

  const At = lang.registerOp({
    name: "At",
    inputs: [
      { name: "list", type: Type.array(Type.any) },
      { name: "index", type: Type.number },
    ],
    output: Type.any,
    category: "array",
    description:
      "The item of list at index, counting from 0. A fraction, a negative index or one past the end has no item, and gives null.",
    examples: [den`output second = At([4, 8, 15], 1)`],
  });
  lang.registerEvaluator({
    op: At,
    finiteCheck: false,
    evaluate: ({ list, index }) =>
      Number.isInteger(index) && index >= 0 && index < list.length ? list[index] : null,
    inferOutput: (inputTypes) => elementOf(inputTypes["list"]),
  });

  const First = lang.registerOp({
    name: "First",
    inputs: [{ name: "list", type: Type.array(Type.any) }],
    output: Type.any,
    category: "array",
    description: "The first item of list. An empty list has none, and gives null.",
    examples: [den`output first = First([4, 8, 15])`],
  });
  lang.registerEvaluator({
    op: First,
    finiteCheck: false,
    evaluate: ({ list }) => (list.length > 0 ? list[0] : null),
    inferOutput: (inputTypes) => elementOf(inputTypes["list"]),
  });

  const Last = lang.registerOp({
    name: "Last",
    inputs: [{ name: "list", type: Type.array(Type.any) }],
    output: Type.any,
    category: "array",
    description: "The last item of list. An empty list has none, and gives null.",
    examples: [den`output last = Last([4, 8, 15])`],
  });
  lang.registerEvaluator({
    op: Last,
    finiteCheck: false,
    evaluate: ({ list }) => (list.length > 0 ? list[list.length - 1] : null),
    inferOutput: (inputTypes) => elementOf(inputTypes["list"]),
  });

  // The clamp is written out: JavaScript's slice counts a negative position from the end.
  const Slice = lang.registerOp({
    name: "Slice",
    inputs: [
      { name: "list", type: Type.array(Type.any) },
      { name: "from", type: Type.number },
      { name: "to", type: Type.number, required: false },
    ],
    output: Type.array(Type.any),
    category: "array",
    description:
      "The items of list from position from up to, not including, position to, counting from 0. Without to, up to the end. A position outside the list is moved to its nearest end.",
    examples: [den`output middle = Slice([4, 8, 15, 16, 23], 1, 3)`],
  });
  lang.registerEvaluator({
    op: Slice,
    finiteCheck: false,
    evaluate: ({ list, from, to }) => {
      const inside = (position: number) => Math.min(Math.max(Math.trunc(position), 0), list.length);
      return list.slice(inside(from), to === undefined ? list.length : inside(to));
    },
    inferOutput: sameListType,
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

  const Reverse = lang.registerOp({
    name: "Reverse",
    inputs: [{ name: "list", type: Type.array(Type.any) }],
    output: Type.array(Type.any),
    category: "array",
    description: "The items of list in the opposite order.",
    examples: [den`output backwards = Reverse([4, 8, 15])`],
  });
  lang.registerEvaluator({
    op: Reverse,
    finiteCheck: false,
    evaluate: ({ list }) => [...list].reverse(),
    inferOutput: sameListType,
  });

  const Sort = lang.registerOp({
    name: "Sort",
    inputs: [
      { name: "list", type: Type.array(Type.any) },
      { name: "descending", type: Type.boolean, required: false },
    ],
    output: Type.array(Type.any),
    category: "array",
    description:
      "The items of list in order: numbers by value, then text by code unit, then any other item in the order it came. With descending true, the numbers and the text go the other way, and the other items stay last.",
    examples: [den`output sorted = Sort([15, 4, 8])`],
  });
  lang.registerEvaluator({
    op: Sort,
    finiteCheck: false,
    evaluate: ({ list, descending }) =>
      [...list].sort(
        (a, b) => kindRank(a) - kindRank(b) || (descending ? within(b, a) : within(a, b)),
      ),
    inferOutput: sameListType,
  });

  // Set keeps the first of each and compares as === does for every value a program holds.
  const Unique = lang.registerOp({
    name: "Unique",
    inputs: [{ name: "list", type: Type.array(Type.any) }],
    output: Type.array(Type.any),
    category: "array",
    description:
      "The items of list without repeats, each where it first appears. Two lists, or two structs, are two items even when they hold the same.",
    examples: [den`output once = Unique([4, 8, 4, 15, 8])`],
  });
  lang.registerEvaluator({
    op: Unique,
    finiteCheck: false,
    evaluate: ({ list }) => [...new Set(list)],
    inferOutput: sameListType,
  });

  // ponytail: no limit on the length. The first op that allocates from a number, so a host that
  // feeds a bound owns its size; past about four billion items JavaScript itself refuses.
  const Range = lang.registerOp({
    name: "Range",
    inputs: [
      { name: "from", type: Type.number },
      { name: "to", type: Type.number },
    ],
    output: Type.array(Type.number),
    category: "array",
    description:
      "The whole numbers from from up to, not including, to. A fraction is cut to its whole part, and to at or below from gives the empty list.",
    examples: [den`output counted = Range(1, 5)`],
  });
  lang.registerEvaluator({
    op: Range,
    // Whole numbers between two finite bounds: no item can be a NaN, so a long list is not
    // walked for one.
    finiteCheck: false,
    evaluate: ({ from, to }) => {
      const start = Math.trunc(from);
      return Array.from({ length: Math.max(0, Math.trunc(to) - start) }, (_, i) => start + i);
    },
  });

  const Sum = lang.registerOp({
    name: "Sum",
    inputs: [{ name: "list", type: Type.array(Type.number) }],
    output: Type.number,
    category: "array",
    description: "The total of the numbers in list. A null item is skipped. An empty list gives 0.",
    examples: [den`output total = Sum([4, 8, 15])`],
  });
  lang.registerEvaluator({
    op: Sum,
    evaluate: ({ list }) => numbersOf(list).reduce((total, n) => total + n, 0),
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
