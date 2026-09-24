import { type Language, type Token, tokenise } from "@dendrite-lang/core";

//? Token classification for highlighting - driven by the language's OWN lexer, so the
// operator vocabulary (grammar.operatorTokens), statement keywords (grammar.statements)
// and op names (descriptor.ops) can never drift from what actually parses.
// Framework-free: returns plain styled ranges; cm.ts maps them onto CodeMirror.

export type TokenClass =
  | "keyword" // let / output (registered statement keywords)
  | "op" // registered op names (And, Filter, ...)
  | "ident" // plain identifiers (bindings, lambda params)
  | "type" // a registered type's name where a type is written: `(n: number)`, `-> boolean`
  | "input" // the $ sigil and the input name after it
  | "number"
  | "string"
  | "literal" // true / false / null
  | "operator" // registered operators + the core arrows => ->
  | "punct" // structural punctuation ( ) [ ] , . : =
  | "comment"; // // line and /* block */ trivia (from LexResult.comments)

export interface StyledRange {
  from: number;
  to: number;
  cls: TokenClass;
}

// Offset of each line start - shared by highlighting and diagnostics mapping.
export function lineStartOffsets(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

// 1-based line/column → 0-based character offset.
export const toOffset = (starts: number[], line: number, column: number): number =>
  (starts[Math.min(line, starts.length) - 1] ?? 0) + column - 1;

const isPunct = (token: Token | undefined, value: string): boolean =>
  token?.kind === "punct" && token.value === value;

// The punctuation a type expression is written with: `number[]`, `(any, string) -> boolean`.
const TYPE_PUNCT = new Set(["[", "]", "(", ")", ",", "->"]);

/**
 * Which tokens stand where a TYPE is written rather than a value. A name there that is a
 * registered type is coloured as one; the same name anywhere else is a binding that happens to
 * share it, and stays an identifier. Three places:
 *   - right after `:` or `->`: a parameter's annotation, a signature's return;
 *   - inside a parenthesised group followed by `->`: the parameters of a function type;
 *   - everywhere, when the whole source is nothing but type names and type punctuation - a
 *     type written on its own, as the docs do in prose (`number[]`). No program is only that.
 * Known ceiling: a named argument's `:` looks the same as an annotation's, so in
 * `If(then: number)` a BINDING called `number` is coloured as the type. Telling the two apart
 * needs the parser; tokens.test.ts pins the behaviour so a fix shows up there.
 */
function typePositions(tokens: readonly Token[], isType: (name: string) => boolean): Set<number> {
  const positions = new Set<number>();
  const onlyTypes =
    tokens.some((token) => token.kind === "ident") &&
    tokens.every((token) =>
      token.kind === "ident" ? isType(token.value) : TYPE_PUNCT.has(token.value),
    );
  tokens.forEach((token, index) => {
    if (onlyTypes || isPunct(tokens[index - 1], ":") || isPunct(tokens[index - 1], "->")) {
      positions.add(index);
    }
    // Walk back from `) ->` to the matching `(`: every name in between is a parameter type.
    if (!isPunct(token, "->") || !isPunct(tokens[index - 1], ")")) return;
    for (let depth = 0, at = index - 1; at >= 0; at--) {
      if (isPunct(tokens[at], ")")) depth++;
      else if (isPunct(tokens[at], "(") && --depth === 0) break;
      else positions.add(at);
    }
  });
  return positions;
}

export function styledRanges(source: string, language: Language): StyledRange[] {
  const starts = lineStartOffsets(source);
  const lexed = tokenise(source, [...language.grammar.operatorTokens]);
  const tokens = lexed.tokens.filter(
    (token) => token.kind !== "eof" && token.source.kind === "code",
  );
  const isType = (name: string): boolean => language.descriptor.types.has(name);
  const types = typePositions(tokens, isType);
  const ranges: StyledRange[] = [];
  let afterSigil = false;

  for (const [index, token] of tokens.entries()) {
    if (token.source.kind !== "code") continue; // filtered above; this narrows `source` for TS
    const from = toOffset(starts, token.source.line, token.source.column);
    const to = from + token.source.length;

    let cls: TokenClass;
    switch (token.kind) {
      case "number":
        cls = "number";
        break;
      case "string":
        cls = "string";
        break;
      case "boolean":
      case "null":
        cls = "literal";
        break;
      case "ident":
        cls = afterSigil
          ? "input"
          : language.grammar.statements.has(token.value)
            ? "keyword"
            : language.descriptor.ops.has(token.value)
              ? "op"
              : types.has(index) && isType(token.value)
                ? "type"
                : "ident";
        break;
      default: // punct
        cls =
          token.value === "$"
            ? "input"
            : language.grammar.operatorTokens.has(token.value) ||
                token.value === "=>" ||
                token.value === "->"
              ? "operator"
              : "punct";
    }

    afterSigil = token.kind === "punct" && token.value === "$";
    if (to > from) ranges.push({ from, to, cls });
  }

  // Comments live on a separate lexer channel and interleave with the tokens, so the
  // combined list must be re-sorted (CodeMirror's RangeSetBuilder requires ordered adds).
  for (const comment of lexed.comments) {
    if (comment.source.kind !== "code") continue;
    const from = toOffset(starts, comment.source.line, comment.source.column);
    const to = from + comment.source.length;
    if (to > from) ranges.push({ from, to, cls: "comment" });
  }
  return ranges.sort((a, b) => a.from - b.from);
}
