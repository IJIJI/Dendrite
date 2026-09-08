import { type ASTNode, operationNode } from "../infra/nodes";
import { type FnValue } from "../infra/registry";
import { den } from "../infra/serialise";
import { BP, createLanguage, extendLanguage, type Language } from "../language";
import { Type, elementOf, isAny, typesEqual } from "../infra/types";

// Operator desugar builders (pure - reference only ASTNodes, no `lang`). Module-level so
// they're defined once rather than rebuilt per createStdlib() call. They stay in stdlib:
// they encode stdlib's op-input naming convention (a/b for binary, nodes for variadic),
// which the core has no opinion about. The shared primitive (operationNode) is core
// (infra/nodes); the operator mechanism (registerInfix/Prefix) is the operator-agnostic
// grammar layer - putting these here keeps that convention out of those layers.
const bin =
  (op: string) =>
  (l: ASTNode, r: ASTNode): ASTNode =>
    operationNode(op, { a: l, b: r });
const variadic =
  (op: string) =>
  (l: ASTNode, r: ASTNode): ASTNode =>
    operationNode(op, { nodes: [l, r] });

/**
 * Creates the standard-library language: logic / comparison / control / arithmetic /
 * array ops, general-purpose higher-order list ops, and their operators. Built on the
 * createLanguage() base (which provides the primitive types). No host-specific knowledge
 * - safe to use standalone.
 */
export function createStdlib(): Language {
  const lang = createLanguage();

  // Primitive types (boolean / number / string / any) are registered by createLanguage().

  // -------------------------------------------------------------------------
  // Logic ops
  // -------------------------------------------------------------------------

  lang.registerOp({
    name: "And",
    inputs: [{ name: "nodes", type: Type.boolean, variadic: true }],
    output: Type.boolean,
    category: "logic",
    description: "True when every node is true.",
    examples: [den`output ok = And(true, 1 > 0)`],
  });
  lang.registerOp({
    name: "Or",
    inputs: [{ name: "nodes", type: Type.boolean, variadic: true }],
    output: Type.boolean,
    category: "logic",
    description: "True when any node is true.",
    examples: [den`output ok = Or(false, 1 > 0)`],
  });
  lang.registerOp({
    name: "Not",
    inputs: [{ name: "a", type: Type.boolean }],
    output: Type.boolean,
    category: "logic",
    description: "The opposite of a.",
    examples: [den`output off = Not(true)`],
  });
  lang.registerOp({
    name: "Xor",
    inputs: [{ name: "nodes", type: Type.boolean, variadic: true }],
    output: Type.boolean,
    category: "logic",
    description: "True when an odd number of nodes are true.",
    examples: [den`output one = Xor(true, false)`],
  });

  // -------------------------------------------------------------------------
  // Comparison ops
  // -------------------------------------------------------------------------

  lang.registerOp({
    name: "Equals",
    inputs: [
      { name: "a", type: Type.any },
      { name: "b", type: Type.any },
    ],
    output: Type.boolean,
    category: "comparison",
    description: "True when a and b are the same value.",
    examples: [den`output same = Equals("a", "a")`],
  });
  lang.registerOp({
    name: "NotEquals",
    inputs: [
      { name: "a", type: Type.any },
      { name: "b", type: Type.any },
    ],
    output: Type.boolean,
    category: "comparison",
    description: "True when a and b differ.",
    examples: [den`output differ = NotEquals(1, 2)`],
  });
  lang.registerOp({
    name: "GreaterThan",
    inputs: [
      { name: "a", type: Type.number },
      { name: "b", type: Type.number },
    ],
    output: Type.boolean,
    category: "comparison",
    description: "True when a is greater than b.",
    examples: [den`output bigger = GreaterThan(3, 2)`],
  });
  lang.registerOp({
    name: "LessThan",
    inputs: [
      { name: "a", type: Type.number },
      { name: "b", type: Type.number },
    ],
    output: Type.boolean,
    category: "comparison",
    description: "True when a is less than b.",
    examples: [den`output smaller = LessThan(2, 3)`],
  });

  // -------------------------------------------------------------------------
  // Control flow
  // -------------------------------------------------------------------------

  lang.registerOp({
    name: "If",
    inputs: [
      { name: "condition", type: Type.boolean },
      { name: "then", type: Type.any },
      { name: "else", type: Type.any },
    ],
    output: Type.any,
    category: "control",
    description: "Picks then or else by condition. Both branches are evaluated.",
    examples: [den`output label = If(72 >= 60, "Pass", "Fail")`],
  });

  lang.registerOp({
    name: "IsSet",
    inputs: [{ name: "value", type: Type.any }],
    output: Type.boolean,
    category: "control",
    description: "True when value is not null.",
    examples: [den`output found = IsSet(Find([1, 2, 3], item => item > 5))`],
  });

  lang.registerOp({
    name: "Default",
    inputs: [
      { name: "value", type: Type.any },
      { name: "fallback", type: Type.any },
    ],
    output: Type.any,
    category: "control",
    description: "The value, or fallback when the value is null.",
    examples: [den`output first = Default(Find([1, 2, 3], item => item > 5), 0)`],
  });

  // -------------------------------------------------------------------------
  // Array ops
  // -------------------------------------------------------------------------

  lang.registerOp({
    name: "Length",
    inputs: [{ name: "list", type: Type.array(Type.any) }],
    output: Type.number,
    category: "array",
    description: "How many items list holds.",
    examples: [den`output count = Length([4, 8, 15])`],
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

  lang.registerOp({
    name: "Average",
    inputs: [{ name: "list", type: Type.array(Type.number) }],
    output: Type.number,
    category: "array",
    description: "The mean of the numbers in list.",
    examples: [den`output mean = Average([4, 8, 15])`],
  });

  lang.registerOp({
    name: "Max",
    inputs: [{ name: "list", type: Type.array(Type.number) }],
    output: Type.number,
    category: "array",
    description: "The largest number in list.",
    examples: [den`output top = Max([4, 8, 15])`],
  });

  lang.registerOp({
    name: "Min",
    inputs: [{ name: "list", type: Type.array(Type.number) }],
    output: Type.number,
    category: "array",
    description: "The smallest number in list.",
    examples: [den`output low = Min([4, 8, 15])`],
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

  // -------------------------------------------------------------------------
  // Arithmetic ops
  // -------------------------------------------------------------------------

  lang.registerOp({
    name: "Add",
    inputs: [{ name: "nodes", type: Type.number, variadic: true }],
    output: Type.number,
    category: "arithmetic",
    description: "The sum of the nodes.",
    examples: [den`output sum = Add(1, 2, 3)`],
  });
  lang.registerOp({
    name: "Subtract",
    inputs: [
      { name: "a", type: Type.number },
      { name: "b", type: Type.number },
    ],
    output: Type.number,
    category: "arithmetic",
    description: "a minus b.",
    examples: [den`output diff = Subtract(10, 4)`],
  });
  lang.registerOp({
    name: "Multiply",
    inputs: [{ name: "nodes", type: Type.number, variadic: true }],
    output: Type.number,
    category: "arithmetic",
    description: "The product of the nodes.",
    examples: [den`output area = Multiply(3, 4)`],
  });
  lang.registerOp({
    name: "Divide",
    inputs: [
      { name: "a", type: Type.number },
      { name: "b", type: Type.number },
    ],
    output: Type.number,
    category: "arithmetic",
    description: "a divided by b; dividing by zero gives zero.",
    examples: [den`output half = Divide(9, 2)`],
  });

  //TODO: Add more math operations.

  // -------------------------------------------------------------------------
  // Higher-order list ops
  // -------------------------------------------------------------------------

  // Higher-order list ops are ordinary ops with a function-typed input (declared
  // last, so its generic element type is refined from the resolved `list`). The
  // predicate/transform/reducer's element-type params are filled by inferInputTypes
  // on the evaluator; the static fallback below is used only if that is absent.
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

  // -------------------------------------------------------------------------
  // Evaluators - logic ops (fixed output types, no inferOutput needed)
  // -------------------------------------------------------------------------

  lang.registerEvaluator({
    op: "And",
    evaluate: ({ nodes }) => (nodes as boolean[]).every(Boolean),
  });
  lang.registerEvaluator({ op: "Or", evaluate: ({ nodes }) => (nodes as boolean[]).some(Boolean) });
  lang.registerEvaluator({ op: "Not", evaluate: ({ a }) => !a });
  lang.registerEvaluator({
    op: "Xor",
    evaluate: ({ nodes }) => (nodes as boolean[]).filter(Boolean).length % 2 === 1,
  });

  lang.registerEvaluator({ op: "Equals", evaluate: ({ a, b }) => a === b });
  lang.registerEvaluator({ op: "NotEquals", evaluate: ({ a, b }) => a !== b });
  lang.registerEvaluator({
    op: "GreaterThan",
    evaluate: ({ a, b }) => (a as number) > (b as number),
  });
  lang.registerEvaluator({ op: "LessThan", evaluate: ({ a, b }) => (a as number) < (b as number) });

  // -------------------------------------------------------------------------
  // Evaluators - control flow
  // -------------------------------------------------------------------------

  lang.registerEvaluator({
    op: "If",
    evaluate: ({ condition, then, else: otherwise }) => (condition ? then : otherwise),
    // Output type = branch type when both branches match (and aren't any), else any.
    inferOutput: (inputTypes) => {
      const t = inputTypes["then"],
        e = inputTypes["else"];
      return t && e && typesEqual(t, e) && !isAny(t) ? t : Type.any;
    },
  });

  lang.registerEvaluator({
    op: "IsSet",
    evaluate: ({ value }) => value !== null && value !== undefined,
    // Always boolean - no inferOutput needed
  });

  lang.registerEvaluator({
    op: "Default",
    evaluate: ({ value, fallback }) => (value !== null && value !== undefined ? value : fallback),
    // Output type = value's type when known, else fallback's type
    inferOutput: (inputTypes) => {
      const v = inputTypes["value"];
      return v && !isAny(v) ? v : (inputTypes["fallback"] ?? Type.any);
    },
  });

  // -------------------------------------------------------------------------
  // Evaluators - Arrays
  // -------------------------------------------------------------------------

  lang.registerEvaluator({
    op: "Length",
    evaluate: ({ list }) => (list as unknown[]).length,
  });

  lang.registerEvaluator({
    op: "Concat",
    evaluate: ({ arrays }) => (arrays as unknown[][]).flat(),
  });

  lang.registerEvaluator({
    op: "Flatten",
    evaluate: ({ array, depth }) => (array as unknown[]).flat(depth as number),
  });

  lang.registerEvaluator({
    op: "Average",
    evaluate: ({ list }) => {
      const numbers = list as number[];
      return numbers.reduce((sum, n) => sum + n, 0) / numbers.length || 0;
    },
  });

  lang.registerEvaluator({
    op: "Max",
    // Empty → 0 (matches Average's convention; the natural "none" for non-negative
    // ordinals like TallyState). reduce (no spread) avoids call-stack limits on big lists.
    evaluate: ({ list }) => {
      const numbers = list as number[];
      return numbers.length === 0 ? 0 : numbers.reduce((m, n) => (n > m ? n : m));
    },
  });

  lang.registerEvaluator({
    op: "Min",
    // Empty → 0 (matches Average's convention; the natural "none" for non-negative
    // ordinals like TallyState). reduce (no spread) avoids call-stack limits on big lists.
    evaluate: ({ list }) => {
      const numbers = list as number[];
      return numbers.length === 0 ? 0 : numbers.reduce((m, n) => (n < m ? n : m));
    },
  });

  lang.registerEvaluator({
    op: "Includes",
    evaluate: ({ list, value }) => (list as unknown[]).includes(value),
  });

  // -------------------------------------------------------------------------
  // Evaluators - higher-order list ops
  // The function input arrives as a resolved closure; call it directly.
  // inferInputTypes refines the function's element-type params from the list;
  // inferOutput propagates concrete types through the generic list operation.
  // -------------------------------------------------------------------------

  lang.registerEvaluator({
    op: "Filter",
    evaluate: ({ list, predicate }) =>
      (list as unknown[]).filter((item) => Boolean((predicate as FnValue)(item))),
    inferInputTypes: (inputTypes) => ({
      predicate: Type.fn([elementOf(inputTypes["list"])], Type.boolean),
    }),
    inferOutput: (inputTypes) => {
      const listType = inputTypes["list"];
      return listType?.kind === "array" ? listType : Type.array(Type.any);
    },
  });

  lang.registerEvaluator({
    op: "Map",
    evaluate: ({ list, transform }) =>
      (list as unknown[]).map((item) => (transform as FnValue)(item)),
    inferInputTypes: (inputTypes) => ({
      transform: Type.fn([elementOf(inputTypes["list"])], Type.any),
    }),
    inferOutput: (inputTypes) => {
      const t = inputTypes["transform"];
      return t?.kind === "function" ? Type.array(t.returns) : Type.array(Type.any);
    },
  });

  lang.registerEvaluator({
    op: "Find",
    evaluate: ({ list, predicate }) =>
      (list as unknown[]).find((item) => Boolean((predicate as FnValue)(item))) ?? null,
    inferInputTypes: (inputTypes) => ({
      predicate: Type.fn([elementOf(inputTypes["list"])], Type.boolean),
    }),
    inferOutput: (inputTypes) => elementOf(inputTypes["list"]),
  });

  lang.registerEvaluator({
    op: "Every",
    evaluate: ({ list, predicate }) =>
      (list as unknown[]).every((item) => Boolean((predicate as FnValue)(item))),
    inferInputTypes: (inputTypes) => ({
      predicate: Type.fn([elementOf(inputTypes["list"])], Type.boolean),
    }),
  });

  lang.registerEvaluator({
    op: "Some",
    evaluate: ({ list, predicate }) =>
      (list as unknown[]).some((item) => Boolean((predicate as FnValue)(item))),
    inferInputTypes: (inputTypes) => ({
      predicate: Type.fn([elementOf(inputTypes["list"])], Type.boolean),
    }),
  });

  lang.registerEvaluator({
    op: "Reduce",
    evaluate: ({ list, initial, reducer }) =>
      (list as unknown[]).reduce((acc, item) => (reducer as FnValue)(acc, item), initial),
    inferInputTypes: (inputTypes) => {
      const acc = inputTypes["initial"] ?? Type.any;
      return { reducer: Type.fn([acc, elementOf(inputTypes["list"])], acc) };
    },
    inferOutput: (inputTypes) => {
      const r = inputTypes["reducer"];
      return r?.kind === "function" ? r.returns : (inputTypes["initial"] ?? Type.any);
    },
  });

  // -------------------------------------------------------------------------
  // Evaluators - arithmetic ops
  // -------------------------------------------------------------------------

  lang.registerEvaluator({
    op: "Add",
    evaluate: ({ nodes }) => (nodes as number[]).reduce((a, b) => a + b, 0),
  });
  lang.registerEvaluator({
    op: "Subtract",
    evaluate: ({ a, b }) => (a as number) - (b as number),
  });
  lang.registerEvaluator({
    op: "Multiply",
    evaluate: ({ nodes }) => (nodes as number[]).reduce((a, b) => a * b, 1),
  });
  lang.registerEvaluator({
    op: "Divide",
    evaluate: ({ a, b }) => ((b as number) === 0 ? 0 : (a as number) / (b as number)),
  });

  // -------------------------------------------------------------------------
  // Operators - surface sugar over the ops above (registered by the op's owner).
  // `>=` / `<=` desugar to Not(LessThan/GreaterThan) - no dedicated ops needed.
  // (bin / variadic builders are module-level, above.)
  // -------------------------------------------------------------------------
  lang.registerInfix("||", BP.OR, variadic("Or"));
  lang.registerInfix("&&", BP.AND, variadic("And"));
  lang.registerInfix("==", BP.EQUALITY, bin("Equals"));
  lang.registerInfix("!=", BP.EQUALITY, bin("NotEquals"));
  lang.registerInfix("<", BP.COMPARE, bin("LessThan"));
  lang.registerInfix(">", BP.COMPARE, bin("GreaterThan"));
  lang.registerInfix(">=", BP.COMPARE, (l, r) =>
    operationNode("Not", { a: operationNode("LessThan", { a: l, b: r }) }),
  );
  lang.registerInfix("<=", BP.COMPARE, (l, r) =>
    operationNode("Not", { a: operationNode("GreaterThan", { a: l, b: r }) }),
  );
  lang.registerInfix("+", BP.ADD, variadic("Add"));
  lang.registerInfix("-", BP.ADD, bin("Subtract"));
  lang.registerInfix("*", BP.MULTIPLY, variadic("Multiply"));
  lang.registerInfix("/", BP.MULTIPLY, bin("Divide"));
  lang.registerPrefix("!", BP.PREFIX, (operand) => operationNode("Not", { a: operand }));

  return lang;
}

/**
 * Extend a language with the core language as its base.
 * Shorthand for extendLanguage(extension, createStdlib()).
 * Extension definitions take precedence over core on key conflicts.
 */
export function extendStdlib(extension: Language): Language {
  return extendLanguage(extension, createStdlib());
}
