import { den } from "../infra/serialise";
import { type Language } from "../language";
import { Type, isAny, typesEqual } from "../infra/types";

//? The control segment: choosing between values, and falling back when there is none.
export function installControl(lang: Language): void {
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
  lang.registerEvaluator({
    op: "Default",
    evaluate: ({ value, fallback }) => (value !== null && value !== undefined ? value : fallback),
    // Output type = value's type when known, else fallback's type
    inferOutput: (inputTypes) => {
      const v = inputTypes["value"];
      return v && !isAny(v) ? v : (inputTypes["fallback"] ?? Type.any);
    },
  });
}
