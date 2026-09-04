/**
 * Stage 1: Lexer. Tokenise grade.den and print the token stream.
 *
 * The lexer's operator vocabulary is single-sourced from the language's grammar:
 * the core arrows (=>, ->) are always recognised, and registered operators (+, >=,
 * &&, …) come from `lang.grammar.operatorTokens`. Structural punctuation (parens,
 * commas, the $ input sigil, …) is always recognised.
 */

import { readFileSync } from "fs";
import { tokenise } from "../../src/language/parser/lexer";
import { createStdlib } from "../../src/language/stdlib";

const lang = createStdlib();
const source = readFileSync(new URL("./grade.den", import.meta.url), "utf8");

const { tokens, errors, warnings } = tokenise(source, [...lang.grammar.operatorTokens]);

console.log("=== Tokens ===");
function loc(source: import("../../src/language/infra/nodes").SourceRef): string {
  return source.kind === "code" ? `${source.line}:${source.column}` : source.nodeId;
}

for (const tok of tokens) {
  console.log(
    `  [${tok.kind.padEnd(7)}] ${JSON.stringify(tok.value).padEnd(12)}  @ ${loc(tok.source)}`,
  );
}

if (warnings.length > 0) {
  console.log("\n=== Warnings ===");
  for (const w of warnings) {
    console.log(`  ${w.kind} @ ${w.source ? loc(w.source) : "?"}:  ${w.message}`);
  }
}

if (errors.length > 0) {
  console.log("\n=== Errors ===");
  for (const e of errors) {
    console.log(`  ${e.kind} @ ${e.source ? loc(e.source) : "?"}:  ${e.message}`);
  }
}
