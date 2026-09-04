import { createStdlib } from "../../src/language/stdlib";
import { createProgramRunner } from "../../src/language/runtime/runner";
import { Type } from "../../src/language/infra/types";
import type { CNode } from "../../src/language/infra/nodes";
import { CoreProgram } from "../../src/language/infra/program";

// --- Language ---------------------------------------------------------------
const lang = createStdlib();
lang.registerInput({ name: "score", type: Type.number });

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
// createProgramRunner initialises inputs from descriptor defaults and maintains
// EvalState across calls — subsequent iterations reuse cached values for nodes
// whose dependsOn does not intersect changedInputs.
//
// For a one-shot evaluation, use run(program, lang.descriptor, { score: 45 })
// from "../../src/language/runtime/runner" instead.
const runner = createProgramRunner(program, lang.descriptor);

const testCases = [45, 60, 85];

console.log("Dendrite score grader (passing threshold: > 60)\n");

for (const score of testCases) {
  const t0 = performance.now();
  const outputs = runner.run({ score });
  const elapsed = performance.now() - t0;
  console.log(`  score=${score}  →  result="${outputs.get("result")}"  (${elapsed.toFixed(3)}ms)`);
}
