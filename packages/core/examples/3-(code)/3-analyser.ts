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
import { getOutputType } from "../../src/language/analyser/analyser";
import { createStdlib } from "../../src/language/stdlib";
import { createEnvironment } from "../../src/language/environment";
import { type PortLayer, Policy } from "../../src/language/infra/ports";
import { Type, typeToString } from "../../src/language/infra/types";
import type { SourceRef } from "../../src/language/infra/nodes";

// Format a source ref as line:column (or the rete node id), "?" when absent.
const loc = (s?: SourceRef): string =>
  s ? (s.kind === "code" ? `${s.line}:${s.column}` : s.nodeId) : "?";

// --- Language + ports -------------------------------------------------------
// The analyser needs the composed descriptor: the language's vocabulary plus the inputs
// and outputs a program is checked against, which arrive as port layers.
const lang = createStdlib();
const host: PortLayer = {
  id: "host",
  ports: {
    inputs: [
      { name: "score", type: Type.number },
      { name: "bonus", type: Type.number },
    ],
    outputs: [
      { name: "result", type: Type.string },
      { name: "finalScore", type: Type.number },
    ],
  },
  policy: Policy.host,
};

const composed = createEnvironment(lang).forProgram([host], []);
if (!composed.ok) throw new Error(JSON.stringify(composed.problems));
const env = composed.environment;

// --- Lex + parse ------------------------------------------------------------
const source = readFileSync(new URL("./grade.den", import.meta.url), "utf8");
const { tokens } = tokenise(source, [...lang.grammar.operatorTokens]);
const parsed = parse(tokens, env.descriptor, lang.grammar);

if (!parsed.ok) {
  console.log("=== Parse failed ===");
  for (const e of parsed.errors) console.log(`  ${e.kind} @ ${loc(e.source)}: ${e.message}`);
  process.exit(1);
}

// --- Analyse ----------------------------------------------------------------
const analysis = env.analyse(parsed.program);

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
