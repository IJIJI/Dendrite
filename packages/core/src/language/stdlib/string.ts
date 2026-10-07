import { Convert } from "../infra/convert";
import { type ASTNode, operationNode } from "../infra/nodes";
import { den } from "../infra/serialise";
import { BP, type Language } from "../language";
import { Type } from "../infra/types";
import { toList } from "./shared";

//? The string segment: building text and asking about it, with the two spellings that are
// sugar over Join, `++` and the template. Every op reads its text through Convert.toString,
// so a null is the empty string and no op throws. Case is `toUpperCase` / `toLowerCase`, never
// the locale variants: the same program has to give the same text on every host.
export function installString(lang: Language): void {
  // `separator` is the first optional op input in the library: `required: false` means the
  // analyser raises no missing_op_input for it, and the evaluator is handed `undefined`.
  lang.registerOp({
    name: "Join",
    inputs: [
      // `convert`: a number or a boolean in the list becomes text before Join sees it, so
      // `Join([1, 2], ", ")` is "1, 2" with no ToString and no warning (the evaluator converts;
      // the reference shows it as `parts~`).
      { name: "parts", type: Type.array(Type.string), convert: true },
      { name: "separator", type: Type.string, required: false },
    ],
    output: Type.string,
    category: "string",
    description:
      "The parts as one text, with separator between them. Without a separator they are run together.",
    examples: [
      den`output label = Join(["Bus", "7"], " ")`,
      den`output code = Join(["A", "B", "C"])`,
    ],
  });
  lang.registerEvaluator({
    op: "Join",
    // `parts` arrives converted (the flag); a null separator still reads as "".
    evaluate: ({ parts, separator }) => toList(parts).join(Convert.toString(separator)),
  });

  lang.registerOp({
    name: "Upper",
    inputs: [{ name: "text", type: Type.string }],
    output: Type.string,
    category: "string",
    description: "The text in upper case.",
    examples: [den`output shout = Upper("live")`],
  });
  lang.registerEvaluator({
    op: "Upper",
    evaluate: ({ text }) => Convert.toString(text).toUpperCase(),
  });

  lang.registerOp({
    name: "Lower",
    inputs: [{ name: "text", type: Type.string }],
    output: Type.string,
    category: "string",
    description: "The text in lower case.",
    examples: [den`output quiet = Lower("LIVE")`],
  });
  lang.registerEvaluator({
    op: "Lower",
    evaluate: ({ text }) => Convert.toString(text).toLowerCase(),
  });

  lang.registerOp({
    name: "Trim",
    inputs: [{ name: "text", type: Type.string }],
    output: Type.string,
    category: "string",
    description: "The text without the spaces at its start and end.",
    examples: [den`output name = Trim("  cam 1  ")`],
  });
  lang.registerEvaluator({
    op: "Trim",
    evaluate: ({ text }) => Convert.toString(text).trim(),
  });

  // `Contains`, not `Includes`: Includes asks whether a LIST holds an item, and the two stay
  // apart so that text can one day be read as a list of letters without changing this one.
  lang.registerOp({
    name: "Contains",
    inputs: [
      { name: "text", type: Type.string },
      { name: "part", type: Type.string },
    ],
    output: Type.boolean,
    category: "string",
    description: "True when part appears in text. An empty part always does.",
    examples: [den`output isCamera = Contains("CAM 1", "CAM")`],
  });
  lang.registerEvaluator({
    op: "Contains",
    evaluate: ({ text, part }) => Convert.toString(text).includes(Convert.toString(part)),
  });

  lang.registerOp({
    name: "StartsWith",
    inputs: [
      { name: "text", type: Type.string },
      { name: "part", type: Type.string },
    ],
    output: Type.boolean,
    category: "string",
    description: "True when text begins with part. An empty part always matches.",
    examples: [den`output isCamera = StartsWith("CAM 1", "CAM")`],
  });
  lang.registerEvaluator({
    op: "StartsWith",
    evaluate: ({ text, part }) => Convert.toString(text).startsWith(Convert.toString(part)),
  });

  lang.registerOp({
    name: "EndsWith",
    inputs: [
      { name: "text", type: Type.string },
      { name: "part", type: Type.string },
    ],
    output: Type.boolean,
    category: "string",
    description: "True when text ends with part. An empty part always matches.",
    examples: [den`output isFirst = EndsWith("CAM 1", "1")`],
  });
  lang.registerEvaluator({
    op: "EndsWith",
    evaluate: ({ text, part }) => Convert.toString(text).endsWith(Convert.toString(part)),
  });

  // -------------------------------------------------------------------------
  // Symbols - surface sugar over Join.
  // -------------------------------------------------------------------------

  // `++` joins two values as text: sugar over Join, as a template is. Join converts its parts
  // (`convert`), so `"n = " ++ 1` needs no ToString and the analyser inserts nothing. A chain
  // nests, the way `+` does: a Join the author wrote may carry a separator, so the parser
  // cannot fold one into another. The list takes the left operand's position, so a problem
  // with the list itself points at the expression rather than nowhere.
  lang.registerInfix("++", BP.ADD, (l, r) =>
    operationNode("Join", {
      parts: { kind: "array", items: [l, r], type: Type.any, source: l.source },
    }),
  );

  // A template, `text {hole} text`: sugar over Join, the way `>=` is sugar over LessThan, and
  // registered here for the same reason - it names an op the core grammar does not have. The
  // lexer has already cut it into string tokens and holes between `{` `}`; each part, text or
  // hole, becomes an item of one list, and Join converts every item to text itself (its `parts`
  // declares `convert`), so a hole needs no ToString and the analyser inserts no node.
  lang.registerNud("`", (p, open) => {
    // Between the backticks the lexer leaves only two things, a hole `{ … }` or a string token,
    // so the second branch needs no check of its own. Every turn consumes at least one token
    // (`expect` on a miss records an error and stays put), so the loop always reaches the
    // closing backtick or the end.
    const items: ASTNode[] = [];
    while (!p.check("punct", "`") && !p.atEnd()) {
      if (p.match("punct", "{")) {
        items.push(p.parseExpr(0));
        p.expect("punct", "}");
      } else {
        const text = p.expect("string");
        items.push({ kind: "literal", value: text.value, source: text.source });
      }
    }
    p.expect("punct", "`");
    const parts: ASTNode = { kind: "array", items, type: Type.any, source: open.source };
    return operationNode("Join", { parts }, { output: Type.string, source: open.source });
  });
}
