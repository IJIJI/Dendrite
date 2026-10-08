import { operationNode } from "../infra/nodes";
import { den } from "../infra/serialise";
import { BP, type Language } from "../language";
import { Type } from "../infra/types";
import { bin, variadic } from "./shared";

//? The arithmetic segment: the ops over numbers, and their symbols. Negative numbers live here
// too: `-14` is the prefix symbol over Negate, so a language without this segment has none.
// A null in a number input reads as zero, as a null reads as "" in a text op and as [] in a
// list op. An op that has no answer (a division by zero) computes NaN or an infinity and
// leaves it: the evaluator gives null for either, for every op.
export function installArithmetic(lang: Language): void {
  lang.registerOp({
    name: "Add",
    inputs: [{ name: "nodes", type: Type.number, variadic: true }],
    output: Type.number,
    category: "arithmetic",
    description: "The sum of the nodes.",
    examples: [den`output sum = Add(1, 2, 3)`],
  });
  lang.registerEvaluator({
    op: "Add",
    evaluate: ({ nodes }) => (nodes as number[]).reduce((a, b) => a + b, 0),
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
  lang.registerEvaluator({
    op: "Subtract",
    evaluate: ({ a, b }) => (a as number) - (b as number),
  });

  lang.registerOp({
    name: "Negate",
    inputs: [{ name: "a", type: Type.number }],
    output: Type.number,
    category: "arithmetic",
    description: "a with its sign flipped. The `-` in front of a value is its symbol.",
    examples: [den`output below = Negate(14)`, den`output alsoBelow = -14`],
  });
  lang.registerEvaluator({
    op: "Negate",
    evaluate: ({ a }) => -(a as number),
  });

  lang.registerOp({
    name: "Multiply",
    inputs: [{ name: "nodes", type: Type.number, variadic: true }],
    output: Type.number,
    category: "arithmetic",
    description: "The product of the nodes.",
    examples: [den`output area = Multiply(3, 4)`],
  });
  lang.registerEvaluator({
    op: "Multiply",
    evaluate: ({ nodes }) => (nodes as number[]).reduce((a, b) => a * b, 1),
  });

  lang.registerOp({
    name: "Divide",
    inputs: [
      { name: "a", type: Type.number },
      { name: "b", type: Type.number },
    ],
    output: Type.number,
    category: "arithmetic",
    description: "a divided by b. Dividing by zero has no answer, and gives null.",
    examples: [den`output half = Divide(9, 2)`, den`output none = Divide(9, 0)`],
  });
  lang.registerEvaluator({
    op: "Divide",
    // By zero the quotient is an infinity or NaN, which the evaluator reads as null.
    evaluate: ({ a, b }) => (a as number) / (b as number),
  });

  //TODO: Add more math operations.

  // -------------------------------------------------------------------------
  // Symbols - surface sugar over the ops above.
  // -------------------------------------------------------------------------
  lang.registerInfix("+", BP.ADD, variadic("Add"));
  lang.registerInfix("-", BP.ADD, bin("Subtract"));
  lang.registerInfix("*", BP.MULTIPLY, variadic("Multiply"));
  lang.registerInfix("/", BP.MULTIPLY, bin("Divide"));
  // `-` in front of a value, as `!` is: the parser tells it from the infix `-` by position, so
  // `1 - -14` is Subtract(1, Negate(14)). Without it the language had no negative numbers.
  lang.registerPrefix("-", BP.PREFIX, (operand) => operationNode("Negate", { a: operand }));
}
