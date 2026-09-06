import { createStdlib } from "../../src/language/stdlib";
import { createEnvironment } from "../../src/language/environment";
import { type PortLayer, Policy } from "../../src/language/infra/ports";
import { Type } from "../../src/language/infra/types";
import type { CNode } from "../../src/language/infra/nodes";
import { CoreProgram } from "../../src/language/infra/program";

// --- Language + ports -------------------------------------------------------
// The language is vocabulary (types, ops, evaluators). What a program reads and produces
// arrives as PORT LAYERS composed on top of it, which is what `forProgram` does below.
const lang = createStdlib();
const host: PortLayer = {
  id: "host",
  ports: { inputs: [{ name: "score", type: Type.number }], outputs: [] },
  policy: Policy.host,
};

const composed = createEnvironment(lang).forProgram([host], []);
if (!composed.ok) throw new Error(JSON.stringify(composed.problems));
const env = composed.environment;

// --- Program ----------------------------------------------------------------
// let isPassing = $score > 60
// let grade     = If(isPassing, "Pass", "Fail")
// output result = grade
//
// This example hand-builds the analysed CoreProgram (CNodes) to show exactly what
// the evaluator consumes. In production the analyser derives all of this - including
// dependsOn - from a RawProgram (see examples/2 for that, and examples/3 for source).

const isPassing: CNode = {
  kind: "operation",
  op: "GreaterThan",
  inputs: {
    a: { kind: "input", name: "score", type: Type.number, dependsOn: new Set(["score"]) },
    b: { kind: "literal", type: Type.number, value: 60, dependsOn: new Set() },
  },
  output: Type.boolean,
  dependsOn: new Set(["score"]),
};

const grade: CNode = {
  kind: "operation",
  op: "If",
  inputs: {
    // RefNode.dependsOn === the referenced binding's dependsOn — analyser invariant
    condition: {
      kind: "ref",
      name: "isPassing",
      type: Type.boolean,
      dependsOn: new Set(["score"]),
    },
    then: { kind: "literal", type: Type.string, value: "Pass", dependsOn: new Set() },
    else: { kind: "literal", type: Type.string, value: "Fail", dependsOn: new Set() },
  },
  // inferOutput: both branches are string → the analyser would infer string here
  output: Type.string,
  dependsOn: new Set(["score"]),
};

const program: CoreProgram = {
  bindings: new Map<string, CNode>([
    ["isPassing", isPassing],
    ["grade", grade],
  ]),
  outputs: new Map<string, CNode>([
    // RefNode to "grade" — dependsOn mirrors the grade binding's dependsOn
    ["result", { kind: "ref", name: "grade", type: Type.string, dependsOn: new Set(["score"]) }],
  ]),
};

// --- Evaluate ---------------------------------------------------------------
// createRunner initialises inputs from their defaults (score has none of its own, so it
// seeds 0, the number type's default) and maintains EvalState across calls — subsequent
// iterations reuse cached values for nodes whose dependsOn does not intersect changedInputs.
//
// For a one-shot evaluation, use env.run(program, { score: 45 }) instead.
const runner = env.createRunner(program);

const testCases = [45, 60, 85];

console.log("Dendrite score grader (passing threshold: > 60)\n");

for (const score of testCases) {
  const t0 = performance.now();
  const outputs = runner.run({ score });
  const elapsed = performance.now() - t0;
  console.log(`  score=${score}  →  result="${outputs.get("result")}"  (${elapsed.toFixed(3)}ms)`);
}
