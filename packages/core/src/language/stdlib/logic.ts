import { operationNode } from "../infra/nodes";
import { den } from "../infra/serialise";
import { BP, type Language } from "../language";
import { Type } from "../infra/types";
import { bin, variadic } from "./shared";

//? The logic segment: the ops that combine booleans, the ops that make one by comparing, and
// their symbols. The two groups are one segment because `>=` and `<=` are sugar over
// Not(LessThan / GreaterThan): every symbol here names ops this file registers. Every output
// type is fixed, so no evaluator needs an inferOutput.
export function installLogic(lang: Language): void {
  // -------------------------------------------------------------------------
  // Combining booleans
  // -------------------------------------------------------------------------

  lang.registerOp({
    name: "And",
    inputs: [{ name: "nodes", type: Type.boolean, variadic: true }],
    output: Type.boolean,
    category: "logic",
    description: "True when every node is true.",
    examples: [den`output ok = And(true, 1 > 0)`],
  });
  lang.registerEvaluator({
    op: "And",
    evaluate: ({ nodes }) => (nodes as boolean[]).every(Boolean),
  });

  lang.registerOp({
    name: "Or",
    inputs: [{ name: "nodes", type: Type.boolean, variadic: true }],
    output: Type.boolean,
    category: "logic",
    description: "True when any node is true.",
    examples: [den`output ok = Or(false, 1 > 0)`],
  });
  lang.registerEvaluator({ op: "Or", evaluate: ({ nodes }) => (nodes as boolean[]).some(Boolean) });

  lang.registerOp({
    name: "Not",
    inputs: [{ name: "a", type: Type.boolean }],
    output: Type.boolean,
    category: "logic",
    description: "The opposite of a.",
    examples: [den`output off = Not(true)`],
  });
  lang.registerEvaluator({ op: "Not", evaluate: ({ a }) => !a });

  lang.registerOp({
    name: "Xor",
    inputs: [{ name: "nodes", type: Type.boolean, variadic: true }],
    output: Type.boolean,
    category: "logic",
    description: "True when an odd number of nodes are true.",
    examples: [den`output one = Xor(true, false)`],
  });
  lang.registerEvaluator({
    op: "Xor",
    evaluate: ({ nodes }) => (nodes as boolean[]).filter(Boolean).length % 2 === 1,
  });

  // -------------------------------------------------------------------------
  // Comparing
  // -------------------------------------------------------------------------

  lang.registerOp({
    name: "Equals",
    inputs: [
      { name: "a", type: Type.any },
      { name: "b", type: Type.any },
    ],
    output: Type.boolean,
    category: "logic",
    description: "True when a and b are the same value.",
    examples: [den`output same = Equals("a", "a")`],
  });
  lang.registerEvaluator({ op: "Equals", evaluate: ({ a, b }) => a === b });

  lang.registerOp({
    name: "NotEquals",
    inputs: [
      { name: "a", type: Type.any },
      { name: "b", type: Type.any },
    ],
    output: Type.boolean,
    category: "logic",
    description: "True when a and b differ.",
    examples: [den`output differ = NotEquals(1, 2)`],
  });
  lang.registerEvaluator({ op: "NotEquals", evaluate: ({ a, b }) => a !== b });

  lang.registerOp({
    name: "GreaterThan",
    inputs: [
      { name: "a", type: Type.number },
      { name: "b", type: Type.number },
    ],
    output: Type.boolean,
    category: "logic",
    description: "True when a is greater than b.",
    examples: [den`output bigger = GreaterThan(3, 2)`],
  });
  lang.registerEvaluator({
    op: "GreaterThan",
    evaluate: ({ a, b }) => (a as number) > (b as number),
  });

  lang.registerOp({
    name: "LessThan",
    inputs: [
      { name: "a", type: Type.number },
      { name: "b", type: Type.number },
    ],
    output: Type.boolean,
    category: "logic",
    description: "True when a is less than b.",
    examples: [den`output smaller = LessThan(2, 3)`],
  });
  lang.registerEvaluator({ op: "LessThan", evaluate: ({ a, b }) => (a as number) < (b as number) });

  // -------------------------------------------------------------------------
  // Symbols - surface sugar over the ops above.
  // `>=` / `<=` desugar to Not(LessThan/GreaterThan) - no dedicated ops needed.
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
  lang.registerPrefix("!", BP.PREFIX, (operand) => operationNode("Not", { a: operand }));
}
