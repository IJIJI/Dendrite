import { readFileSync } from "fs";
import { createEnvironment, createStdlib, Environment, Language, Type } from '../../src/index'

const lang: Language = createStdlib();
lang.registerInput({ name: "heights_men", type: Type.array(Type.number) });
lang.registerInput({ name: "heights_woman", type: Type.array(Type.number) });
lang.registerInput({ name: "heights_unknown", type: Type.array(Type.number) });
lang.registerInput({ name: "treshold", type: Type.number });
lang.registerOutput({ name: "pass_men", type: Type.number });
lang.registerOutput({ name: "pass_woman", type: Type.number });
lang.registerOutput({ name: "pass_unknown", type: Type.number });
lang.registerOutput({ name: "pass_total", type: Type.number, mode: 'required' });
lang.registerOutput({ name: "avg_height_men", type: Type.number });
lang.registerOutput({ name: "avg_height_woman", type: Type.number });
lang.registerOutput({ name: "avg_height_unknown", type: Type.number });
lang.registerOutput({ name: "avg_height_total", type: Type.number, mode: 'required' });

const env: Environment = createEnvironment(lang);

const source = readFileSync(new URL("./heights.den", import.meta.url), "utf8");

const compile_result = env.compile(source);

// export type CompileResult =
//   | { ok: true; program: CoreProgram; warnings: AnalysisWarning[] }
//   | { ok: false; stage: "parse"; errors: ParseError[]; warnings: ParseWarning[] } 
//   | { ok: false; stage: "analyse"; result: AnalysisResult }; 
// export interface AnalysisResult {
//   ok: boolean; // false ONLY when a required output was dropped or missing
//   program: CoreProgram; // always present; outputs = only surviving outputs
//   errors: AnalysisError[];
//   warnings: AnalysisWarning[];
// }

if (!compile_result.ok) {
  // print all errors and warnings
  console.error("Compilation failed:");
  if (compile_result.stage === "parse") {
    for (const error of compile_result.errors) {
      console.error(` - ${error.message}`);
    }
    for (const warning of compile_result.warnings) {
      console.warn(` - ${warning.message}`);
    }
  } else if (compile_result.stage === "analyse") {
    for (const error of compile_result.result.errors) {
      console.error(` - ${error.message}`);
    }
    for (const warning of compile_result.result.warnings) {
      console.warn(` - ${warning.message}`);
    }
  }
  process.exit(1);
}

const outputs: Map<string, unknown> = env.run(compile_result.program, {
  heights_men: [180, 175, 190],
  heights_woman: [165, 170, 160],
  heights_unknown: [170, 175, 180],
  treshold: 170
});

for (const [name, value] of outputs) {
  console.log(`${name}: ${value}`);
}