import { Convert } from "../infra/convert";
import { den } from "../infra/serialise";
import { type Language } from "../language";
import { Type } from "../infra/types";

//? The conversion segment. The language converts nothing on its own, so a program converts
// where it means to, in the open. Each rule is decided in Convert rather than inherited from
// JavaScript (whose `[]` is true, whose `Number("")` is 0 and whose `Number("0x10")` is 16).
export function installConversion(lang: Language): void {
  lang.registerOp({
    name: "ToString",
    inputs: [{ name: "value", type: Type.any }],
    output: Type.string,
    category: "conversion",
    description: "The value as text. Null gives the empty string, and a list or a struct its JSON.",
    examples: [den`output label = ToString(42)`],
  });
  lang.registerEvaluator({
    op: "ToString",
    evaluate: ({ value }) => Convert.toString(value),
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
  lang.registerEvaluator({
    op: "ToNumber",
    evaluate: ({ value }) => Convert.toNumber(value),
  });

  lang.registerOp({
    name: "ToBool",
    inputs: [{ name: "value", type: Type.any }],
    output: Type.boolean,
    category: "conversion",
    description: "False for false, 0, the empty string, null and an empty list. True otherwise.",
    examples: [den`output hasItems = ToBool([4, 8])`],
  });
  lang.registerEvaluator({
    op: "ToBool",
    evaluate: ({ value }) => Convert.toBool(value),
  });
}
