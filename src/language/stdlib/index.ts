import { z } from "zod";
import { createLanguage, extendLanguage, type Language } from "../infra/registry";
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

  lang.registerOp({
    name: "Filter",
    inputs: [{ name: "list", type: Type.any }],
    output: Type.array(Type.any),
    category: "list",
    higherOrder: true,
    bodyBindings: ["item"],
  });
  lang.registerOp({
    name: "Map",
    inputs: [{ name: "list", type: Type.any }],
    output: Type.array(Type.any),
    category: "list",
    higherOrder: true,
    bodyBindings: ["item"],
  });
  lang.registerOp({
    name: "Find",
    inputs: [{ name: "list", type: Type.any }],
    output: Type.any,
    category: "list",
    higherOrder: true,
    bodyBindings: ["item"],
  });
  lang.registerOp({
    name: "Every",
    inputs: [{ name: "list", type: Type.any }],
    output: Type.boolean,
    category: "list",
    higherOrder: true,
    bodyBindings: ["item"],
  });
  lang.registerOp({
    name: "Some",
    inputs: [{ name: "list", type: Type.any }],
    output: Type.boolean,
    category: "list",
    higherOrder: true,
    bodyBindings: ["item"],
  });
  lang.registerOp({
    name: "Reduce",
    inputs: [
      { name: "list", type: Type.any },
      { name: "initial", type: Type.any },
    ],
    output: Type.any,
    category: "list",
    higherOrder: true,
    bodyBindings: ["acc", "item"],
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
  // apply! is safe - always defined when called from the higher_order case.
  // inferOutput propagates concrete types through generic list operations.
  // -------------------------------------------------------------------------

  lang.registerEvaluator({
    op: "Filter",
    evaluate: ({ list }, apply) => (list as unknown[]).filter((item) => Boolean(apply!(item))),
    inferOutput: (inputTypes) => {
      const listType = inputTypes["list"];
      return listType?.kind === "array" ? listType : Type.array(Type.any);
    },
    inferBodyBindings: (inputTypes) => ({ item: elementOf(inputTypes["list"]) }),
  });

  lang.registerEvaluator({
    op: "Map",
    evaluate: ({ list }, apply) => (list as unknown[]).map((item) => apply!(item)),
    inferOutput: (inputTypes, bodyOutputType) => {
      if (bodyOutputType && !isAny(bodyOutputType)) return Type.array(bodyOutputType);
      const listType = inputTypes["list"];
      return listType?.kind === "array" ? listType : Type.array(Type.any);
    },
    inferBodyBindings: (inputTypes) => ({ item: elementOf(inputTypes["list"]) }),
  });

  lang.registerEvaluator({
    op: "Find",
    evaluate: ({ list }, apply) =>
      (list as unknown[]).find((item) => Boolean(apply!(item))) ?? null,
    inferOutput: (inputTypes) => elementOf(inputTypes["list"]),
    inferBodyBindings: (inputTypes) => ({ item: elementOf(inputTypes["list"]) }),
  });

  lang.registerEvaluator({
    op: "Every",
    evaluate: ({ list }, apply) => (list as unknown[]).every((item) => Boolean(apply!(item))),
    inferBodyBindings: (inputTypes) => ({ item: elementOf(inputTypes["list"]) }),
  });

  lang.registerEvaluator({
    op: "Some",
    evaluate: ({ list }, apply) => (list as unknown[]).some((item) => Boolean(apply!(item))),
    inferBodyBindings: (inputTypes) => ({ item: elementOf(inputTypes["list"]) }),
  });

  lang.registerEvaluator({
    op: "Reduce",
    evaluate: ({ list, initial }, apply) =>
      (list as unknown[]).reduce((acc, item) => apply!(acc, item), initial),
    inferOutput: (inputTypes) => {
      const initialType = inputTypes["initial"];
      return initialType && !isAny(initialType) ? initialType : Type.any;
    },
    inferBodyBindings: (inputTypes) => ({
      acc: inputTypes["initial"] ?? Type.any,
      item: elementOf(inputTypes["list"]),
    }),
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
