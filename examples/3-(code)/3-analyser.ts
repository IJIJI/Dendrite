/**
 * Stage 3: Analyser. Lex + parse + analyse grade.den, printing the inferred
 * output type of every binding and output, plus any diagnostics.
 *
 * This is the first stage that needs the full descriptor: declared inputs AND
 * declared outputs. This way, output type-checking has something to check against.
 * In this example the stdlib language is used.
 */

import { readFileSync } from "fs";
import { tokenise } from "../../src/language/parser/lexer";
import { parse } from "../../src/language/parser/parser";
import { analyse, getOutputType } from "../../src/language/analyser/analyser";
import { createCoreLanguage } from "../../src/language/stdlib";
import { Type, typeToString } from "../../src/language/infra/types";
import type { SourceRef } from "../../src/language/infra/nodes";

// Format a source ref as line:column (or the rete node id), "?" when absent.
const loc = (s?: SourceRef): string =>
  s ? (s.kind === "code" ? `${s.line}:${s.column}` : s.nodeId) : "?";

// --- Language ---------------------------------------------------------------
const lang = createCoreLanguage();
lang.registerInput({ name: "score", type: Type.number });
lang.registerInput({ name: "bonus", type: Type.number });
lang.registerOutput({ name: "result", type: Type.string });
lang.registerOutput({ name: "finalScore", type: Type.number });

// --- Lex + parse ------------------------------------------------------------
const source = readFileSync(new URL("./grade.den", import.meta.url), "utf8");
const { tokens } = tokenise(source, [...lang.grammar.operatorTokens]);
const parsed = parse(tokens, lang.descriptor, lang.grammar);

if (!parsed.ok) {
  console.log("=== Parse failed ===");
  for (const e of parsed.errors) console.log(`  ${e.kind} @ ${loc(e.source)}: ${e.message}`);
  process.exit(1);
}

// --- Analyse ----------------------------------------------------------------
const analysis = analyse(parsed.program, lang.descriptor);

console.log(`=== Analysis: ${analysis.ok ? "OK" : "FAILED"} ===\n`);

console.log("=== Binding types ===");
for (const [name, node] of analysis.program.bindings) {
  console.log(
    `  ${name.padEnd(10)} : ${typeToString(getOutputType(node))}  (dependsOn: ${[...node.dependsOn].join(", ") || "—"})`,
  );
}

console.log("\n=== Output types ===");
for (const [name, node] of analysis.program.outputs) {
  console.log(`  ${name.padEnd(10)} : ${typeToString(getOutputType(node))}`);
}

if (analysis.errors.length > 0) {
  console.log("\n=== Errors ===");
  for (const e of analysis.errors) console.log(`  ${e.kind} @ ${loc(e.source)}: ${e.message}`);
}
if (analysis.warnings.length > 0) {
  console.log("\n=== Warnings ===");
  for (const w of analysis.warnings) console.log(`  ${w.kind} @ ${loc(w.source)}: ${w.message}`);
}
