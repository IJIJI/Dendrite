import { readFileSync } from "fs";
import {
  createEnvironment,
  createStdlib,
  Language,
  Policy,
  type PortLayer,
  type ProgramEnvironment,
  Type,
} from "../../src/index";

const lang: Language = createStdlib();

// Everything the program reads and produces, as one host layer on top of the language.
const host: PortLayer = {
  id: "host",
  ports: {
    inputs: [
      { name: "heights_men", type: Type.array(Type.number) },
      { name: "heights_woman", type: Type.array(Type.number) },
      { name: "heights_unknown", type: Type.array(Type.number) },
      { name: "treshold", type: Type.number },
    ],
    outputs: [
      { name: "pass_men", type: Type.number },
      { name: "pass_woman", type: Type.number },
      { name: "pass_unknown", type: Type.number },
      { name: "pass_total", type: Type.number, mode: "required" },
      { name: "avg_height_men", type: Type.number },
      { name: "avg_height_woman", type: Type.number },
      { name: "avg_height_unknown", type: Type.number },
      { name: "avg_height_total", type: Type.number, mode: "required" },
    ],
  },
  policy: Policy.host,
};

const composed = createEnvironment(lang).forProgram([host], []);
if (!composed.ok) {
  console.error("Ports do not compose:");
  for (const problem of composed.problems) console.error(` - ${problem.where}: ${problem.message}`);
  process.exit(1);
}
const env: ProgramEnvironment = composed.environment;

const source = readFileSync(new URL("./heights.den", import.meta.url), "utf8");

const compile_result = env.compile(source);

// CompileResult carries errors + warnings uniformly on every failure arm (parse
// warnings survive into the analyse stage), so one branch handles both stages.
if (!compile_result.ok) {
  console.error(`Compilation failed at ${compile_result.stage}:`);
  for (const error of compile_result.errors) {
    console.error(` - ${error.message}`);
  }
  for (const warning of compile_result.warnings) {
    console.warn(` - ${warning.message}`);
  }
  process.exit(1);
}

const outputs: Map<string, unknown> = env.run(compile_result.program, {
  heights_men: [180, 175, 190],
  heights_woman: [165, 170, 160],
  heights_unknown: [170, 175, 180],
  treshold: 170,
});

for (const [name, value] of outputs) {
  console.log(`${name}: ${value}`);
}
