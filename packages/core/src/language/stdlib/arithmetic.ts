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

// Round's rule, apart because it is the one op here that is more than a line. Two things are
// decided rather than inherited from Math.round. A half goes away from zero, the way a person
// rounds (Math.round sends -2.5 to -2), so the magnitude is rounded and the sign put back. And
// the decimal point moves through the exponent, never by multiplying: 1.005 * 100 is
// 100.49999999999999, which would round 1.005 to 1 at two decimals instead of 1.01.
function roundTo(value: number, digits: number): number {
  // `1.5e2` for (1.5, 2). A number that already prints with an exponent (1e-7) keeps its own.
  const shift = (n: number, by: number): number => {
    const [mantissa, exponent = "0"] = String(n).split("e");
    return Number(`${mantissa}e${Number(exponent) + by}`);
  };
  const shifted = shift(Math.abs(value), digits);
  // More decimals asked for than a number holds: there is nothing to round away.
  if (!Number.isFinite(shifted)) return value;
  return Math.sign(value) * shift(Math.round(shifted), -digits);
}

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

  // The sign is the first number's, as `%` has it in JavaScript and C: Mod(-7, 3) is -1, not
  // the 2 that Python and a spreadsheet give. Chosen 2026-10-08, with both tables in view.
  lang.registerOp({
    name: "Mod",
    inputs: [
      { name: "a", type: Type.number },
      { name: "b", type: Type.number },
    ],
    output: Type.number,
    category: "arithmetic",
    description:
      "The remainder of a divided by b, with the sign of a. By zero there is no answer, and it gives null.",
    examples: [den`output left = Mod(7, 3)`, den`output below = Mod(-7, 3)`],
  });
  lang.registerEvaluator({
    op: "Mod",
    // By zero the remainder is NaN, which the evaluator reads as null.
    evaluate: ({ a, b }) => (a as number) % (b as number),
  });

  lang.registerOp({
    name: "Pow",
    inputs: [
      { name: "base", type: Type.number },
      { name: "exponent", type: Type.number },
    ],
    output: Type.number,
    category: "arithmetic",
    description:
      "base raised to exponent. A result that is no real number, or too large to hold, gives null.",
    examples: [den`output kilo = Pow(2, 10)`, den`output root = Pow(9, 0.5)`],
  });
  lang.registerEvaluator({
    op: "Pow",
    // A negative base with a fraction is NaN and an overflow is an infinity: null, both.
    evaluate: ({ base, exponent }) => Math.pow(base as number, exponent as number),
  });

  lang.registerOp({
    name: "Abs",
    inputs: [{ name: "value", type: Type.number }],
    output: Type.number,
    category: "arithmetic",
    description: "value without its sign.",
    examples: [den`output distance = Abs(-14)`],
  });
  lang.registerEvaluator({
    op: "Abs",
    evaluate: ({ value }) => Math.abs(value as number),
  });

  // `digits` is optional, as Join's separator is: left out, the result is a whole number.
  lang.registerOp({
    name: "Round",
    inputs: [
      { name: "value", type: Type.number },
      { name: "digits", type: Type.number, required: false },
    ],
    output: Type.number,
    category: "arithmetic",
    description:
      "value rounded to a whole number, or to digits decimals. A half goes away from zero: 2.5 is 3 and -2.5 is -3. A negative digits rounds to tens, hundreds and so on.",
    examples: [
      den`output whole = Round(2.5)`,
      den`output price = Round(7.3333, 2)`,
      den`output hundreds = Round(1234, -2)`,
    ],
  });
  lang.registerEvaluator({
    op: "Round",
    evaluate: ({ value, digits }) => roundTo(value as number, Math.trunc((digits as number) ?? 0)),
  });

  lang.registerOp({
    name: "Floor",
    inputs: [{ name: "value", type: Type.number }],
    output: Type.number,
    category: "arithmetic",
    description: "The largest whole number that is not above value.",
    examples: [den`output down = Floor(7.8)`, den`output further = Floor(-7.2)`],
  });
  lang.registerEvaluator({
    op: "Floor",
    evaluate: ({ value }) => Math.floor(value as number),
  });

  lang.registerOp({
    name: "Ceil",
    inputs: [{ name: "value", type: Type.number }],
    output: Type.number,
    category: "arithmetic",
    description: "The smallest whole number that is not below value.",
    examples: [den`output up = Ceil(7.2)`],
  });
  lang.registerEvaluator({
    op: "Ceil",
    evaluate: ({ value }) => Math.ceil(value as number),
  });

  // The bounds work in either order, so there is no wrong way round to answer for: the value
  // is held between the smaller and the larger of the two.
  lang.registerOp({
    name: "Clamp",
    inputs: [
      { name: "value", type: Type.number },
      { name: "low", type: Type.number },
      { name: "high", type: Type.number },
    ],
    output: Type.number,
    category: "arithmetic",
    description: "value held between low and high. The two bounds work in either order.",
    examples: [den`output level = Clamp(15, 0, 10)`, den`output floor = Clamp(-3, 0, 10)`],
  });
  lang.registerEvaluator({
    op: "Clamp",
    evaluate: ({ value, low, high }) => {
      const [a, b] = [low as number, high as number];
      return Math.min(Math.max(value as number, Math.min(a, b)), Math.max(a, b));
    },
  });

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
