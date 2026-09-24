import { type ASTNode, operationNode } from "../infra/nodes";
import { type FnValue } from "../infra/registry";
import { den } from "../infra/serialise";
import { BP, createLanguage, extendLanguage, type Language } from "../language";
import { Type, elementOf, isAny, typesEqual } from "../infra/types";
import { Convert } from "../infra/convert";

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

// A value as a list: the one rule every list op shares, so a null (or anything that is not a
// list, reaching the op through `any`) reads as the empty list and no op throws on it. It is
// the list counterpart of Convert.toString, and Join uses both.
const toList = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

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
    name: "Negate",
    inputs: [{ name: "a", type: Type.number }],
    output: Type.number,
    category: "arithmetic",
    description: "a with its sign flipped. The `-` in front of a value is its symbol.",
    examples: [den`output below = Negate(14)`, den`output alsoBelow = -14`],
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
  // Conversion ops
  // -------------------------------------------------------------------------

  // The language converts nothing on its own, so a program converts where it means to, in
  // the open. Each rule is decided here rather than inherited from JavaScript (whose `[]` is
  // true, whose `Number("")` is 0 and whose `Number("0x10")` is 16).

  lang.registerOp({
    name: "ToString",
    inputs: [{ name: "value", type: Type.any }],
    output: Type.string,
    category: "conversion",
    description: "The value as text. Null gives the empty string, and a list or a struct its JSON.",
    examples: [den`output label = ToString(42)`],
  });

  lang.registerOp({
    name: "ToNumber",
    inputs: [{ name: "value", type: Type.any }],
    output: Type.number,
    category: "conversion",
    description:
      "The value as a number: true is 1, false is 0, and text is read as a decimal number. Anything that is not a number gives null.",
    examples: [den`output count = ToNumber("42")`, den`output count = Default(ToNumber("n/a"), 0)`],
  });

  lang.registerOp({
    name: "ToBool",
    inputs: [{ name: "value", type: Type.any }],
    output: Type.boolean,
    category: "conversion",
    description: "False for false, 0, the empty string, null and an empty list. True otherwise.",
    examples: [den`output hasItems = ToBool([4, 8])`],
  });

  // -------------------------------------------------------------------------
  // String ops
  // -------------------------------------------------------------------------

  // `separator` is the first optional op input in the library: `required: false` means the
  // analyser raises no missing_op_input for it, and the evaluator is handed `undefined`.
  lang.registerOp({
    name: "Join",
    inputs: [
      // `convert`: a number or a boolean in the list becomes text before Join sees it, so
      // `Join([1, 2], ", ")` is "1, 2" with no ToString and no warning (the evaluator converts;
      // the reference shows it as `parts~`).
      { name: "parts", type: Type.array(Type.string), convert: true },
      { name: "separator", type: Type.string, required: false },
    ],
    output: Type.string,
    category: "string",
    description:
      "The parts as one text, with separator between them. Without a separator they are run together.",
    examples: [
      den`output label = Join(["Bus", "7"], " ")`,
      den`output code = Join(["A", "B", "C"])`,
    ],
  });

  lang.registerOp({
    name: "Upper",
    inputs: [{ name: "text", type: Type.string }],
    output: Type.string,
    category: "string",
    description: "The text in upper case.",
    examples: [den`output shout = Upper("live")`],
  });

  lang.registerOp({
    name: "Lower",
    inputs: [{ name: "text", type: Type.string }],
    output: Type.string,
    category: "string",
    description: "The text in lower case.",
    examples: [den`output quiet = Lower("LIVE")`],
  });

  lang.registerOp({
    name: "Trim",
    inputs: [{ name: "text", type: Type.string }],
    output: Type.string,
    category: "string",
    description: "The text without the spaces at its start and end.",
    examples: [den`output name = Trim("  cam 1  ")`],
  });

  // `Contains`, not `Includes`: Includes asks whether a LIST holds an item, and the two stay
  // apart so that text can one day be read as a list of letters without changing this one.
  lang.registerOp({
    name: "Contains",
    inputs: [
      { name: "text", type: Type.string },
      { name: "part", type: Type.string },
    ],
    output: Type.boolean,
    category: "string",
    description: "True when part appears in text. An empty part always does.",
    examples: [den`output isCamera = Contains("CAM 1", "CAM")`],
  });

  lang.registerOp({
    name: "StartsWith",
    inputs: [
      { name: "text", type: Type.string },
      { name: "part", type: Type.string },
    ],
    output: Type.boolean,
    category: "string",
    description: "True when text begins with part. An empty part always matches.",
    examples: [den`output isCamera = StartsWith("CAM 1", "CAM")`],
  });

  lang.registerOp({
    name: "EndsWith",
    inputs: [
      { name: "text", type: Type.string },
      { name: "part", type: Type.string },
    ],
    output: Type.boolean,
    category: "string",
    description: "True when text ends with part. An empty part always matches.",
    examples: [den`output isFirst = EndsWith("CAM 1", "1")`],
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
    evaluate: ({ list }) => toList(list).length,
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

  lang.registerEvaluator({
    op: "Flatten",
    evaluate: ({ array, depth }) => toList(array).flat(depth as number),
  });

  lang.registerEvaluator({
    op: "Average",
    evaluate: ({ list }) => {
      const numbers = toList(list) as number[];
      return numbers.reduce((sum, n) => sum + n, 0) / numbers.length || 0;
    },
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

  lang.registerEvaluator({
    op: "Min",
    // Empty → 0 (matches Average's convention; the natural "none" for non-negative
    // ordinals like TallyState). reduce (no spread) avoids call-stack limits on big lists.
    evaluate: ({ list }) => {
      const numbers = toList(list) as number[];
      return numbers.length === 0 ? 0 : numbers.reduce((m, n) => (n < m ? n : m));
    },
  });

  lang.registerEvaluator({
    op: "Includes",
    evaluate: ({ list, value }) => toList(list).includes(value),
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
      toList(list).filter((item) => Boolean((predicate as FnValue)(item))),
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
    evaluate: ({ list, transform }) => toList(list).map((item) => (transform as FnValue)(item)),
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
      toList(list).find((item) => Boolean((predicate as FnValue)(item))) ?? null,
    inferInputTypes: (inputTypes) => ({
      predicate: Type.fn([elementOf(inputTypes["list"])], Type.boolean),
    }),
    inferOutput: (inputTypes) => elementOf(inputTypes["list"]),
  });

  lang.registerEvaluator({
    op: "Every",
    evaluate: ({ list, predicate }) =>
      toList(list).every((item) => Boolean((predicate as FnValue)(item))),
    inferInputTypes: (inputTypes) => ({
      predicate: Type.fn([elementOf(inputTypes["list"])], Type.boolean),
    }),
  });

  lang.registerEvaluator({
    op: "Some",
    evaluate: ({ list, predicate }) =>
      toList(list).some((item) => Boolean((predicate as FnValue)(item))),
    inferInputTypes: (inputTypes) => ({
      predicate: Type.fn([elementOf(inputTypes["list"])], Type.boolean),
    }),
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
    op: "Negate",
    evaluate: ({ a }) => -(a as number),
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
  // Evaluators - conversion ops
  // -------------------------------------------------------------------------

  lang.registerEvaluator({
    op: "ToString",
    evaluate: ({ value }) => Convert.toString(value),
  });

  lang.registerEvaluator({
    op: "ToNumber",
    evaluate: ({ value }) => Convert.toNumber(value),
  });

  lang.registerEvaluator({
    op: "ToBool",
    evaluate: ({ value }) => Convert.toBool(value),
  });

  // -------------------------------------------------------------------------
  // Evaluators - string ops
  // -------------------------------------------------------------------------

  // Case is `toUpperCase` / `toLowerCase`, never the locale variants: the same program has to
  // give the same text on every host.
  lang.registerEvaluator({
    op: "Join",
    // `parts` arrives converted (the flag); a null separator still reads as "".
    evaluate: ({ parts, separator }) => toList(parts).join(Convert.toString(separator)),
  });
  lang.registerEvaluator({
    op: "Upper",
    evaluate: ({ text }) => Convert.toString(text).toUpperCase(),
  });
  lang.registerEvaluator({
    op: "Lower",
    evaluate: ({ text }) => Convert.toString(text).toLowerCase(),
  });
  lang.registerEvaluator({
    op: "Trim",
    evaluate: ({ text }) => Convert.toString(text).trim(),
  });
  lang.registerEvaluator({
    op: "Contains",
    evaluate: ({ text, part }) => Convert.toString(text).includes(Convert.toString(part)),
  });
  lang.registerEvaluator({
    op: "StartsWith",
    evaluate: ({ text, part }) => Convert.toString(text).startsWith(Convert.toString(part)),
  });
  lang.registerEvaluator({
    op: "EndsWith",
    evaluate: ({ text, part }) => Convert.toString(text).endsWith(Convert.toString(part)),
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
  // `-` in front of a value, as `!` is: the parser tells it from the infix `-` by position, so
  // `1 - -14` is Subtract(1, Negate(14)). Without it the language had no negative numbers.
  lang.registerPrefix("-", BP.PREFIX, (operand) => operationNode("Negate", { a: operand }));

  // A template, `text {hole} text`: sugar over Join, the way `>=` is sugar over LessThan, and
  // registered here for the same reason - it names an op the core grammar does not have. The
  // lexer has already cut it into string tokens and holes between `{` `}`; each part, text or
  // hole, becomes an item of one list, and Join converts every item to text itself (its `parts`
  // declares `convert`), so a hole needs no ToString and the analyser inserts no node.
  lang.registerNud("`", (p, open) => {
    // Between the backticks the lexer leaves only two things, a hole `{ … }` or a string token,
    // so the second branch needs no check of its own. Every turn consumes at least one token
    // (`expect` on a miss records an error and stays put), so the loop always reaches the
    // closing backtick or the end.
    const items: ASTNode[] = [];
    while (!p.check("punct", "`") && !p.atEnd()) {
      if (p.match("punct", "{")) {
        items.push(p.parseExpr(0));
        p.expect("punct", "}");
      } else {
        const text = p.expect("string");
        items.push({ kind: "literal", value: text.value, source: text.source });
      }
    }
    p.expect("punct", "`");
    const parts: ASTNode = { kind: "array", items, type: Type.any, source: open.source };
    return operationNode("Join", { parts }, { output: Type.string, source: open.source });
  });

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
