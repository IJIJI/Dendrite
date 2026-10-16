import { operationNode } from "../infra/nodes";
import { den } from "../infra/serialise";
import { BP, type Language } from "../language";
import { type Thunk } from "../infra/thunk";
import { Type } from "../infra/types";
import { bin, variadic } from "./shared";

// The three-valued read And and Or share: the first node equal to `decider` decides (a false
// for And, a true for Or). A node that is no boolean (a null, or a value of another kind,
// which a lazy input hands over unread by the evaluator's rule) decides nothing, and with no
// deciding node the answer is then no value. So `false && null` and `null && false` are both
// false, and `true && null` is null, as SQL, R, pandas and C# have it (0.8.0, option B).
function decide(nodes: readonly Thunk[], decider: boolean): boolean | null {
  let missing = false;
  for (const node of nodes) {
    const value = node.value;
    if (value === decider) return decider;
    if (value !== !decider) missing = true;
  }
  return missing ? null : !decider;
}

//? The logic segment: the ops that combine booleans, the ops that make one by comparing, and
// their symbols. The two groups are one segment because `>=` and `<=` are sugar over
// Not(LessThan / GreaterThan): every symbol here names ops this file registers. Every output
// type is fixed, so no evaluator needs an inferOutput.
export function installLogic(lang: Language): void {
  // -------------------------------------------------------------------------
  // Combining booleans
  // -------------------------------------------------------------------------

  // Both read their nodes lazily, so they stop at the first node that decides them (`decide`).
  const And = lang.registerOp({
    name: "And",
    inputs: [{ name: "nodes", type: Type.boolean, variadic: true, lazy: true }],
    output: Type.boolean,
    category: "logic",
    description:
      "True when every node is true, false when any node is false, and no value otherwise.",
    examples: [den`output ok = And(true, 1 > 0)`],
  });
  lang.registerEvaluator({ op: And, evaluate: ({ nodes }) => decide(nodes, false) });

  const Or = lang.registerOp({
    name: "Or",
    inputs: [{ name: "nodes", type: Type.boolean, variadic: true, lazy: true }],
    output: Type.boolean,
    category: "logic",
    description:
      "True when any node is true, false when every node is false, and no value otherwise.",
    examples: [den`output ok = Or(false, 1 > 0)`],
  });
  lang.registerEvaluator({ op: Or, evaluate: ({ nodes }) => decide(nodes, true) });

  const Not = lang.registerOp({
    name: "Not",
    inputs: [{ name: "a", type: Type.boolean }],
    output: Type.boolean,
    category: "logic",
    description: "The opposite of a.",
    examples: [den`output off = Not(true)`],
  });
  lang.registerEvaluator({ op: Not, evaluate: ({ a }) => !a });

  const Xor = lang.registerOp({
    name: "Xor",
    inputs: [{ name: "nodes", type: Type.boolean, variadic: true }],
    output: Type.boolean,
    category: "logic",
    description: "True when an odd number of nodes are true.",
    examples: [den`output one = Xor(true, false)`],
  });
  lang.registerEvaluator({
    op: Xor,
    evaluate: ({ nodes }) => nodes.filter(Boolean).length % 2 === 1,
  });

  // -------------------------------------------------------------------------
  // Comparing
  // -------------------------------------------------------------------------

  const Equals = lang.registerOp({
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
  lang.registerEvaluator({ op: Equals, evaluate: ({ a, b }) => a === b });

  const NotEquals = lang.registerOp({
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
  lang.registerEvaluator({ op: NotEquals, evaluate: ({ a, b }) => a !== b });

  const GreaterThan = lang.registerOp({
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
    op: GreaterThan,
    evaluate: ({ a, b }) => a > b,
  });

  const LessThan = lang.registerOp({
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
  lang.registerEvaluator({ op: LessThan, evaluate: ({ a, b }) => a < b });

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
