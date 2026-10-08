import { type FnValue } from "../infra/registry";
import { den } from "../infra/serialise";
import { type Language } from "../language";
import { Type, elementOf } from "../infra/types";
import { toList } from "./shared";

//? The list segment: the higher-order ops, which are how iteration is written. Each is an
// ordinary op with a function-typed input (declared last, so its generic element type is
// refined from the resolved `list`). The predicate/transform/reducer's element-type params are
// filled by inferInputTypes on the evaluator; the static type on the op is used only if that
// is absent. The function input arrives as a resolved closure, and the evaluator calls it
// directly; inferOutput propagates concrete types through the generic list operation.
export function installList(lang: Language): void {
  lang.registerOp({
    name: "Filter",
    inputs: [
      { name: "list", type: Type.array(Type.any) },
      { name: "predicate", type: Type.fn([Type.any], Type.boolean) },
    ],
    output: Type.array(Type.any),
    category: "list",
    description: "The items of list for which predicate holds, in order.",
    examples: [den`output big = Filter([4, 8, 15, 16], item => item > 10)`],
  });
  lang.registerEvaluator({
    op: "Filter",
    evaluate: ({ list, predicate }) =>
      toList(list).filter((item) => Boolean((predicate as FnValue)(item))),
    inferInputTypes: (inputTypes) => ({
      predicate: Type.fn([elementOf(inputTypes["list"])], Type.boolean),
    }),
    inferOutput: (inputTypes) => {
      const listType = inputTypes["list"];
      return listType?.kind === "array" ? listType : Type.array(Type.any);
    },
  });

  lang.registerOp({
    name: "Map",
    inputs: [
      { name: "list", type: Type.array(Type.any) },
      { name: "transform", type: Type.fn([Type.any], Type.any) },
    ],
    output: Type.array(Type.any),
    category: "list",
    description: "Each item of list passed through transform.",
    examples: [den`output doubled = Map([1, 2, 3], item => item * 2)`],
  });
  lang.registerEvaluator({
    op: "Map",
    evaluate: ({ list, transform }) => toList(list).map((item) => (transform as FnValue)(item)),
    inferInputTypes: (inputTypes) => ({
      transform: Type.fn([elementOf(inputTypes["list"])], Type.any),
    }),
    inferOutput: (inputTypes) => {
      const t = inputTypes["transform"];
      return t?.kind === "function" ? Type.array(t.returns) : Type.array(Type.any);
    },
  });

  lang.registerOp({
    name: "Find",
    inputs: [
      { name: "list", type: Type.array(Type.any) },
      { name: "predicate", type: Type.fn([Type.any], Type.boolean) },
    ],
    output: Type.any,
    category: "list",
    description: "The first item of list for which predicate holds, or null.",
    examples: [den`output first = Find([4, 8, 15, 16], item => item > 10)`],
  });
  lang.registerEvaluator({
    op: "Find",
    evaluate: ({ list, predicate }) =>
      toList(list).find((item) => Boolean((predicate as FnValue)(item))) ?? null,
    inferInputTypes: (inputTypes) => ({
      predicate: Type.fn([elementOf(inputTypes["list"])], Type.boolean),
    }),
    inferOutput: (inputTypes) => elementOf(inputTypes["list"]),
  });

  lang.registerOp({
    name: "Every",
    inputs: [
      { name: "list", type: Type.array(Type.any) },
      { name: "predicate", type: Type.fn([Type.any], Type.boolean) },
    ],
    output: Type.boolean,
    category: "list",
    description: "True when predicate holds for every item of list.",
    examples: [den`output allBig = Every([15, 16, 23], item => item > 10)`],
  });
  lang.registerEvaluator({
    op: "Every",
    evaluate: ({ list, predicate }) =>
      toList(list).every((item) => Boolean((predicate as FnValue)(item))),
    inferInputTypes: (inputTypes) => ({
      predicate: Type.fn([elementOf(inputTypes["list"])], Type.boolean),
    }),
  });

  lang.registerOp({
    name: "Some",
    inputs: [
      { name: "list", type: Type.array(Type.any) },
      { name: "predicate", type: Type.fn([Type.any], Type.boolean) },
    ],
    output: Type.boolean,
    category: "list",
    description: "True when predicate holds for at least one item of list.",
    examples: [den`output anyBig = Some([4, 8, 15], item => item > 10)`],
  });
  lang.registerEvaluator({
    op: "Some",
    evaluate: ({ list, predicate }) =>
      toList(list).some((item) => Boolean((predicate as FnValue)(item))),
    inferInputTypes: (inputTypes) => ({
      predicate: Type.fn([elementOf(inputTypes["list"])], Type.boolean),
    }),
  });

  lang.registerOp({
    name: "Reduce",
    inputs: [
      { name: "list", type: Type.array(Type.any) },
      { name: "initial", type: Type.any },
      { name: "reducer", type: Type.fn([Type.any, Type.any], Type.any) },
    ],
    output: Type.any,
    category: "list",
    description: "Folds list into one value, left to right, starting from initial.",
    examples: [
      den`output total = Reduce([1, 2, 3], 0, (acc, item) => acc + item)`,
      den`
        let scores = [4, 8, 15, 16, 23]
        output best = Reduce(scores, 0, (acc, item) => If(item > acc, item, acc))
      `,
    ],
  });
  lang.registerEvaluator({
    op: "Reduce",
    evaluate: ({ list, initial, reducer }) =>
      toList(list).reduce((acc, item) => (reducer as FnValue)(acc, item), initial),
    inferInputTypes: (inputTypes) => {
      const acc = inputTypes["initial"] ?? Type.any;
      return { reducer: Type.fn([acc, elementOf(inputTypes["list"])], acc) };
    },
    inferOutput: (inputTypes) => {
      const r = inputTypes["reducer"];
      return r?.kind === "function" ? r.returns : (inputTypes["initial"] ?? Type.any);
    },
  });
}
