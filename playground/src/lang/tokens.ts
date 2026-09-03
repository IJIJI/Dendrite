import { tokenise, type Language } from "@dendrite-lang/core";

//? Token classification for highlighting - driven by the language's OWN lexer, so the
// operator vocabulary (grammar.operatorTokens), statement keywords (grammar.statements)
// and op names (descriptor.ops) can never drift from what actually parses.
// Framework-free: returns plain styled ranges; cm.ts maps them onto CodeMirror.

export type TokenClass =
  | "keyword" // let / output (registered statement keywords)
  | "op" // registered op names (And, Filter, ...)
  | "ident" // plain identifiers (bindings, lambda params)
  | "input" // the $ sigil and the input name after it
  | "number"
  | "string"
  | "literal" // true / false / null
  | "operator" // registered operators + the core arrows => ->
  | "punct"; // structural punctuation ( ) [ ] , . : =

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

export function styledRanges(source: string, language: Language): StyledRange[] {
  const starts = lineStartOffsets(source);
  const { tokens } = tokenise(source, [...language.grammar.operatorTokens]);
  const ranges: StyledRange[] = [];
  let afterSigil = false;

  for (const token of tokens) {
    if (token.kind === "eof" || token.source.kind !== "code") continue;
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
  return ranges;
}
