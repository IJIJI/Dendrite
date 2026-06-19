/**
 * Lexer example — tokenise grade.den and print the token stream.
 *
 * grade.den uses >= as its only operator beyond structural punctuation,
 * so we pass it explicitly so the lexer recognises it as a single token
 * instead of two separate punct tokens (> and =).
 */

import { readFileSync } from "fs";
import { tokenise } from "../../src/language/parser/lexer";

const source = readFileSync(new URL("./grade.den", import.meta.url), "utf8");

const { tokens, errors, warnings } = tokenise(source, [">="]);

console.log("=== Tokens ===");
for (const tok of tokens) {
  const loc = `${tok.source.line}:${tok.source.column}`;
  console.log(`  [${tok.kind.padEnd(7)}] ${JSON.stringify(tok.value).padEnd(12)}  @ ${loc}`);
}

if (warnings.length > 0) {
  console.log("\n=== Warnings ===");
  for (const w of warnings) {
    const loc = w.source ? `${w.source.line}:${w.source.column}` : "?";
    console.log(`  ${w.kind} @ ${loc}: ${w.message}`);
  }
}

if (errors.length > 0) {
  console.log("\n=== Errors ===");
  for (const e of errors) {
    const loc = e.source ? `${e.source.line}:${e.source.column}` : "?";
    console.log(`  ${e.kind} @ ${loc}: ${e.message}`);
  }
}
