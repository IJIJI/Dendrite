import { z } from "zod";
import { type ASTNode, operationNode } from "../infra/nodes";
import { type FnValue } from "../infra/registry";
import { BP, createLanguage, extendLanguage, type Language } from "../language";
import { Type, elementOf, isAny, typesEqual } from "../infra/types";

/**
 * Creates the base language with primitive types, logical ops,
 * and general-purpose higher-order list ops.
 * No host-specific knowledge - safe to use standalone.
 */
// TODO: Rename to stdlib
export function createCoreLanguage(): Language {
  const lang = createLanguage();

  // -------------------------------------------------------------------------
  // Primitive types. Arrays are structural (Type.array), so nothing to register.
  // -------------------------------------------------------------------------

  lang.registerType("boolean", z.boolean(), { default: false });
  lang.registerType("number", z.number(), { default: 0 });
  lang.registerType("string", z.string(), { default: "" });
  lang.registerType("any", z.unknown(), { default: null });

  // -------------------------------------------------------------------------
  // Logic ops
  // -------------------------------------------------------------------------

  lang.registerOp({
    name: "And",
    inputs: [{ name: "nodes", type: Type.boolean, variadic: true }],
    output: Type.boolean,
    category: "logic",
  });
  lang.registerOp({
    name: "Or",
    inputs: [{ name: "nodes", type: Type.boolean, variadic: true }],
    output: Type.boolean,
    category: "logic",
  });
  lang.registerOp({
    name: "Not",
    inputs: [{ name: "a", type: Type.boolean }],
    output: Type.boolean,
    category: "logic",
  });
  lang.registerOp({
    name: "Xor",
    inputs: [{ name: "nodes", type: Type.boolean, variadic: true }],
    output: Type.boolean,
    category: "logic",
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
  });
  lang.registerOp({
    name: "NotEquals",
    inputs: [
      { name: "a", type: Type.any },
      { name: "b", type: Type.any },
    ],
    output: Type.boolean,
    category: "comparison",
  });
  lang.registerOp({
    name: "GreaterThan",
    inputs: [
      { name: "a", type: Type.number },
      { name: "b", type: Type.number },
    ],
    output: Type.boolean,
    category: "comparison",
  });
  lang.registerOp({
    name: "LessThan",
    inputs: [
      { name: "a", type: Type.number },
      { name: "b", type: Type.number },
    ],
    output: Type.boolean,
    category: "comparison",
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
  });

  lang.registerOp({
    name: "IsSet",
    inputs: [{ name: "value", type: Type.any }],
    output: Type.boolean,
    category: "control",
  });

  lang.registerOp({
    name: "Default",
    inputs: [
      { name: "value", type: Type.any },
      { name: "fallback", type: Type.any },
    ],
    output: Type.any,
    category: "control",
  });

  // -------------------------------------------------------------------------
  // Arithmetic ops
  // -------------------------------------------------------------------------

  lang.registerOp({
    name: "Add",
    inputs: [{ name: "nodes", type: Type.number, variadic: true }],
    output: Type.number,
    category: "arithmetic",
  });
  lang.registerOp({
    name: "Subtract",
    inputs: [
      { name: "a", type: Type.number },
      { name: "b", type: Type.number },
    ],
    output: Type.number,
    category: "arithmetic",
  });
  lang.registerOp({
    name: "Multiply",
    inputs: [{ name: "nodes", type: Type.number, variadic: true }],
    output: Type.number,
    category: "arithmetic",
  });
  lang.registerOp({
    name: "Divide",
    inputs: [
      { name: "a", type: Type.number },
      { name: "b", type: Type.number },
    ],
    output: Type.number,
    category: "arithmetic",
  });
  lang.registerOp({
    name: "Length",
    inputs: [{ name: "list", type: Type.any }],
    output: Type.number,
    category: "arithmetic",
  });

  //TODO: Add more math operations like min, max, average(?), etc.

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
  });
  lang.registerOp({
    name: "Map",
    inputs: [
      { name: "list", type: Type.array(Type.any) },
      { name: "transform", type: Type.fn([Type.any], Type.any) },
    ],
    output: Type.array(Type.any),
    category: "list",
  });
  lang.registerOp({
    name: "Find",
    inputs: [
      { name: "list", type: Type.array(Type.any) },
      { name: "predicate", type: Type.fn([Type.any], Type.boolean) },
    ],
    output: Type.any,
    category: "list",
  });
  lang.registerOp({
    name: "Every",
    inputs: [
      { name: "list", type: Type.array(Type.any) },
      { name: "predicate", type: Type.fn([Type.any], Type.boolean) },
    ],
    output: Type.boolean,
    category: "list",
  });
  lang.registerOp({
    name: "Some",
    inputs: [
      { name: "list", type: Type.array(Type.any) },
      { name: "predicate", type: Type.fn([Type.any], Type.boolean) },
    ],
    output: Type.boolean,
    category: "list",
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
  lang.registerEvaluator({
    op: "Length",
    evaluate: ({ list }) => (list as unknown[]).length,
  });

  // -------------------------------------------------------------------------
  // Operators - surface sugar over the ops above (registered by the op's owner).
  // `>=` / `<=` desugar to Not(LessThan/GreaterThan) - no dedicated ops needed.
  // -------------------------------------------------------------------------
  const bin =
    (op: string) =>
    (l: ASTNode, r: ASTNode): ASTNode =>
      operationNode(op, { a: l, b: r });
  const variadic =
    (op: string) =>
    (l: ASTNode, r: ASTNode): ASTNode =>
      operationNode(op, { nodes: [l, r] });

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
 * Shorthand for extendLanguage(extension, createCoreLanguage()).
 * Extension definitions take precedence over core on key conflicts.
 */
export function extendCoreLanguage(extension: Language): Language {
  return extendLanguage(extension, createCoreLanguage());
}
