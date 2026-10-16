import { Convert } from "../infra/convert";
import { den } from "../infra/serialise";
import { type Language } from "../language";
import { Type } from "../infra/types";

//? The conversion segment. The language converts nothing on its own, so a program converts
// where it means to, in the open. Each rule is decided in Convert rather than inherited from
// JavaScript (whose `[]` is true, whose `Number("")` is 0 and whose `Number("0x10")` is 16).
// A conversion of no value is no value (0.8.0): the three ops take `any`, so the evaluator's
// rule does not read their input, and each tests the null itself. `Convert` keeps its own
// answers for a null ("", false), which a converting input and a template still use.
const none = (value: unknown): boolean => value === null || value === undefined;

export function installConversion(lang: Language): void {
  const ToString = lang.registerOp({
    name: "ToString",
    inputs: [{ name: "value", type: Type.any }],
    output: Type.string,
    category: "conversion",
    description: "The value as text: a list or a struct gives its JSON. No value gives no value.",
    examples: [den`output label = ToString(42)`],
  });
  lang.registerEvaluator({
    op: ToString,
    evaluate: ({ value }) => (none(value) ? null : Convert.toString(value)),
  });

  const ToNumber = lang.registerOp({
    name: "ToNumber",
    inputs: [{ name: "value", type: Type.any }],
    output: Type.number,
    category: "conversion",
    description:
      "The value as a number: true is 1, false is 0, and text is read as a decimal number. Anything that is not a number gives null, and so does no value.",
    examples: [den`output count = ToNumber("42")`, den`output count = Default(ToNumber("n/a"), 0)`],
  });
  lang.registerEvaluator({
    op: ToNumber,
    evaluate: ({ value }) => (none(value) ? null : Convert.toNumber(value)),
  });

  const ToBool = lang.registerOp({
    name: "ToBool",
    inputs: [{ name: "value", type: Type.any }],
    output: Type.boolean,
    category: "conversion",
    description:
      "False for false, 0, the empty string and an empty list, true otherwise. No value gives no value.",
    examples: [den`output hasItems = ToBool([4, 8])`],
  });
  lang.registerEvaluator({
    op: ToBool,
    evaluate: ({ value }) => (none(value) ? null : Convert.toBool(value)),
  });
}
