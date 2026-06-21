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
import { analyse } from "../../src/language/analyser/analyser";
import { createProgramRunner } from "../../src/language/runtime/runner";
import { createCoreLanguage } from "../../src/language/stdlib";
import { Type } from "../../src/language/infra/types";

// --- Language ---------------------------------------------------------------
const lang = createCoreLanguage();
lang.registerInput({ name: "score", type: Type.number });
lang.registerInput({ name: "bonus", type: Type.number });
lang.registerOutput({ name: "result", type: Type.string });
lang.registerOutput({ name: "finalScore", type: Type.number });

// --- source → CoreProgram ---------------------------------------------------
const source = readFileSync(new URL("./grade.den", import.meta.url), "utf8");
const { tokens } = tokenise(source);

const parsed = parse(tokens, lang.descriptor);
if (!parsed.ok) {
  for (const e of parsed.errors) console.log(`parse ${e.kind}: ${e.message}`);
  process.exit(1);
}

const analysis = analyse(parsed.program, lang.descriptor);
if (!analysis.ok) {
  for (const e of analysis.errors) console.log(`analysis ${e.kind}: ${e.message}`);
  process.exit(1);
}

// --- Evaluate ---------------------------------------------------------------
const runner = createProgramRunner(analysis.program, lang.descriptor);

console.log("Dendrite grader './grade.den' - (pass threshold: > 60, distinction: adjusted > 100)\n");

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
