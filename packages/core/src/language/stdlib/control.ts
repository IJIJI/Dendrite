import { operationNode } from "../infra/nodes";
import { den } from "../infra/serialise";
import { BP, type Language } from "../language";
import { Type, isAny, typesEqual } from "../infra/types";

//? The control segment: choosing between values, and falling back when there is none, and
// the two symbols that spell those: `c ? a : b` over If, `a ?? b` over Default.

// The type two branches agree on, else `any`: the language's one rule for two types that meet
// without agreeing (a mixed list is `any[]`). If and Default share it; until 0.8.0 Default took
// the value's type on faith and never looked at the fallback, so `$n ?? "none"` was `number`.
const agreed = (a: Type | undefined, b: Type | undefined): Type =>
  a && b && typesEqual(a, b) && !isAny(a) ? a : Type.any;

export function installControl(lang: Language): void {
  const If = lang.registerOp({
    name: "If",
    inputs: [
      { name: "condition", type: Type.boolean },
      { name: "then", type: Type.any, lazy: true },
      { name: "else", type: Type.any, lazy: true },
    ],
    output: Type.any,
    category: "control",
    description:
      "Picks then or else by condition. Only the branch taken is evaluated. No condition is no value, and neither branch is read.",
    examples: [den`output label = If(72 >= 60, "Pass", "Fail")`],
  });
  lang.registerEvaluator({
    op: If,
    evaluate: ({ condition, then, else: otherwise }) => (condition ? then.value : otherwise.value),
    inferOutput: (inputTypes) => agreed(inputTypes["then"], inputTypes["else"]),
  });

  lang.registerOp({
    name: "IsSet",
    inputs: [{ name: "value", type: Type.any }],
    output: Type.boolean,
    category: "control",
    description: "True when value is not null.",
    examples: [den`output found = IsSet(Find([1, 2, 3], item => item > 5))`],
  });
  lang.registerEvaluator({
    op: "IsSet",
    evaluate: ({ value }) => value !== null && value !== undefined,
    // Always boolean - no inferOutput needed
  });

  const Default = lang.registerOp({
    name: "Default",
    inputs: [
      { name: "value", type: Type.any },
      { name: "fallback", type: Type.any, lazy: true },
    ],
    output: Type.any,
    category: "control",
    description: "The value, or fallback when the value is null.",
    examples: [den`output first = Default(Find([1, 2, 3], item => item > 5), 0)`],
  });
  lang.registerEvaluator({
    op: Default,
    evaluate: ({ value, fallback }) =>
      value !== null && value !== undefined ? value : fallback.value,
    inferOutput: (inputTypes) => agreed(inputTypes["value"], inputTypes["fallback"]),
  });

  // -------------------------------------------------------------------------
  // Symbols - surface sugar over the ops above.
  // -------------------------------------------------------------------------

  // `a ?? b` is Default(a, b). Below `||` and above `? :`, as C#, PHP and JS have it: so
  // `$x ?? 0 > 5` reads `$x ?? (0 > 5)`, and a default before arithmetic takes brackets,
  // `($x ?? 0) + 1`.
  lang.registerInfix("??", BP.COALESCE, (l, r) =>
    operationNode("Default", { value: l, fallback: r }),
  );

  // `c ? a : b` is If(c, a, b), with C's grammar. The then branch reads at power 0 and ends at
  // the colon, which is no operator, so a lambda body, a named argument `f(x: 1)` and a typed
  // parameter `(x: number) => x` inside it all read. The else branch reads just below `?`, so
  // `a ? b : c ? d : e` chains to the right, and a lambda there needs brackets, as in C:
  // `c ? a : (x => x)`. A led with two operands to read, so it is written out.
  lang.registerLed("?", {
    bp: BP.CONDITIONAL,
    parse: (p, left, token) => {
      const then = p.parseExpr(0);
      p.expect("punct", ":");
      const otherwise = p.parseExpr(BP.CONDITIONAL - 1);
      return operationNode(
        "If",
        { condition: left, then, else: otherwise },
        { source: token.source },
      );
    },
  });
}
