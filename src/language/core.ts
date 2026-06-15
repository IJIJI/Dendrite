import { z } from "zod";
import { createLanguage, type Language } from "./registry";

/**
 * Creates the base language with primitive types, logical ops,
 * and general-purpose higher-order list ops.
 * No host-specific knowledge - safe to use standalone.
 */
export function createCoreLanguage(): Language {
  const lang = createLanguage();

  // -------------------------------------------------------------------------
  // Primitive types - defaults auto-derived for these four base types.
  // T[] variants are auto-registered with default [] by registerType.
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
    inputs: [{ name: "nodes", type: "boolean", variadic: true }],
    output: "boolean",
    category: "logic",
  });
  lang.registerOp({
    name: "Or",
    inputs: [{ name: "nodes", type: "boolean", variadic: true }],
    output: "boolean",
    category: "logic",
  });
  lang.registerOp({
    name: "Not",
    inputs: [{ name: "a", type: "boolean" }],
    output: "boolean",
    category: "logic",
  });
  lang.registerOp({
    name: "Xor",
    inputs: [{ name: "nodes", type: "boolean", variadic: true }],
    output: "boolean",
    category: "logic",
  });

  // -------------------------------------------------------------------------
  // Comparison ops
  // -------------------------------------------------------------------------

  lang.registerOp({
    name: "Equals",
    inputs: [
      { name: "a", type: "any" },
      { name: "b", type: "any" },
    ],
    output: "boolean",
    category: "comparison",
  });
  lang.registerOp({
    name: "NotEquals",
    inputs: [
      { name: "a", type: "any" },
      { name: "b", type: "any" },
    ],
    output: "boolean",
    category: "comparison",
  });
  lang.registerOp({
    name: "GreaterThan",
    inputs: [
      { name: "a", type: "number" },
      { name: "b", type: "number" },
    ],
    output: "boolean",
    category: "comparison",
  });
  lang.registerOp({
    name: "LessThan",
    inputs: [
      { name: "a", type: "number" },
      { name: "b", type: "number" },
    ],
    output: "boolean",
    category: "comparison",
  });

  // -------------------------------------------------------------------------
  // Control flow
  // -------------------------------------------------------------------------

  lang.registerOp({
    name: "If",
    inputs: [
      { name: "condition", type: "boolean" },
      { name: "then", type: "any" },
      { name: "else", type: "any" },
    ],
    output: "any",
    category: "control",
  });

  lang.registerOp({
    name: "IsSet",
    inputs: [{ name: "value", type: "any" }],
    output: "boolean",
    category: "control",
  });

  lang.registerOp({
    name: "Default",
    inputs: [
      { name: "value", type: "any" },
      { name: "fallback", type: "any" },
    ],
    output: "any",
    category: "control",
  });

  // -------------------------------------------------------------------------
  // Higher-order list ops
  // -------------------------------------------------------------------------

  lang.registerOp({
    name: "Filter",
    inputs: [{ name: "list", type: "any" }],
    output: "any[]",
    category: "list",
    higherOrder: true,
    bodyBindings: ["item"],
  });
  lang.registerOp({
    name: "Map",
    inputs: [{ name: "list", type: "any" }],
    output: "any[]",
    category: "list",
    higherOrder: true,
    bodyBindings: ["item"],
  });
  lang.registerOp({
    name: "Find",
    inputs: [{ name: "list", type: "any" }],
    output: "any",
    category: "list",
    higherOrder: true,
    bodyBindings: ["item"],
  });
  lang.registerOp({
    name: "Every",
    inputs: [{ name: "list", type: "any" }],
    output: "boolean",
    category: "list",
    higherOrder: true,
    bodyBindings: ["item"],
  });
  lang.registerOp({
    name: "Some",
    inputs: [{ name: "list", type: "any" }],
    output: "boolean",
    category: "list",
    higherOrder: true,
    bodyBindings: ["item"],
  });
  lang.registerOp({
    name: "Reduce",
    inputs: [
      { name: "list", type: "any" },
      { name: "initial", type: "any" },
    ],
    output: "any",
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
    // Output type = branch type when both branches match, else any
    inferOutput: (inputTypes) => {
      const t = inputTypes["then"],
        e = inputTypes["else"];
      return t === e && t !== "any" ? t : "any";
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
      return v && v !== "any" ? v : (inputTypes["fallback"] ?? "any");
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
    // Output element type = input list element type (e.g. Source[] → Source[])
    inferOutput: (inputTypes) => {
      const listType = inputTypes["list"];
      return listType?.endsWith("[]") ? listType : "any[]";
    },
  });

  lang.registerEvaluator({
    op: "Map",
    evaluate: ({ list }, apply) => (list as unknown[]).map((item) => apply!(item)),
    // Output type = body output type as array (e.g. body → TallyState means TallyState[])
    inferOutput: (inputTypes, bodyOutputType) => {
      if (bodyOutputType && bodyOutputType !== "any") return `${bodyOutputType}[]`;
      const listType = inputTypes["list"];
      return listType?.endsWith("[]") ? listType : "any[]";
    },
  });

  lang.registerEvaluator({
    op: "Find",
    evaluate: ({ list }, apply) =>
      (list as unknown[]).find((item) => Boolean(apply!(item))) ?? null,
    // Output type = element type of input list (not array - Find returns one item or null)
    inferOutput: (inputTypes) => {
      const listType = inputTypes["list"];
      return listType?.endsWith("[]") ? listType.slice(0, -2) : "any";
    },
  });

  lang.registerEvaluator({
    op: "Every",
    evaluate: ({ list }, apply) => (list as unknown[]).every((item) => Boolean(apply!(item))),
    // Always boolean - no inferOutput needed
  });

  lang.registerEvaluator({
    op: "Some",
    evaluate: ({ list }, apply) => (list as unknown[]).some((item) => Boolean(apply!(item))),
    // Always boolean - no inferOutput needed
  });

  lang.registerEvaluator({
    op: "Reduce",
    evaluate: ({ list, initial }, apply) =>
      (list as unknown[]).reduce((acc, item) => apply!(acc, item), initial),
    // Output type = accumulator type = type of the initial value
    inferOutput: (inputTypes) => {
      const initialType = inputTypes["initial"];
      return initialType && initialType !== "any" ? initialType : "any";
    },
  });

  return lang;
}
