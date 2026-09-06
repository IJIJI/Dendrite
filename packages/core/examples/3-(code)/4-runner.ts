/**
 * Stage 4: Runner. The whole pipeline: source → lex → parse → analyse →
 * evaluate. Runs the analysed program against several host input sets.
 *
 * This is the code-editor counterpart of examples/1-grade-(core_program), which
 * hand-builds the same CoreProgram. Here it is derived entirely from grade.den.
 */

import { readFileSync } from "fs";
import { tokenise } from "../../src/language/parser/lexer";
import { parse } from "../../src/language/parser/parser";
import { createStdlib } from "../../src/language/stdlib";
import { createEnvironment } from "../../src/language/environment";
import { type PortLayer, Policy } from "../../src/language/infra/ports";
import { Type } from "../../src/language/infra/types";
import type { SourceRef } from "../../src/language/infra/nodes";

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

// --- source → CoreProgram ---------------------------------------------------
const source = readFileSync(new URL("./grade.den", import.meta.url), "utf8");
const { tokens } = tokenise(source, [...lang.grammar.operatorTokens]);

const loc = (s?: SourceRef): string =>
  s ? (s.kind === "code" ? `${s.line}:${s.column}` : s.nodeId) : "?";

const parsed = parse(tokens, env.descriptor, lang.grammar);
if (!parsed.ok) {
  for (const e of parsed.errors) console.log(`parse ${e.kind} @ ${loc(e.source)}: ${e.message}`);
  process.exit(1);
}

const analysis = env.analyse(parsed.program);
if (!analysis.ok) {
  for (const e of analysis.errors)
    console.log(`analysis ${e.kind} @ ${loc(e.source)}: ${e.message}`);
  process.exit(1);
}

// --- Evaluate ---------------------------------------------------------------
const runner = env.createRunner(analysis.program);

console.log(
  "Dendrite grader './grade.den' - (pass threshold: > 60, distinction: adjusted > 100)\n",
);

const cases = [
  { score: 45, bonus: 0 },
  { score: 72, bonus: 10 },
  { score: 95, bonus: 20 },
];

for (const inputs of cases) {
  const out = runner.run(inputs);
  console.log(
    `  score=${inputs.score} bonus=${inputs.bonus}  →  result="${out.get("result")}"  finalScore=${out.get("finalScore")}`,
  );
}
