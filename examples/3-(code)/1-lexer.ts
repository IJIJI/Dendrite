/**
 * Stage 1: Lexer. Tokenise grade.den and print the token stream.
 *
 * grade.den is written in function form, so it needs no operators beyond the
 * core structural punctuation the lexer always recognises (parentheses, commas,
 * the $ input sigil, …). When infix operators land (slice 4) they are passed in
 * here as the second argument to tokenise().
 */

import { readFileSync } from "fs";
import { tokenise } from "../../src/language/parser/lexer";

const source = readFileSync(new URL("./grade.den", import.meta.url), "utf8");

const { tokens, errors, warnings } = tokenise(source);

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
