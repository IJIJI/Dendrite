import { createCoreLanguage } from "../../src/language/core/core";
import { createProgramRunner } from "../../src/language/runtime/runner";
import type { CoreProgram } from "../../src/language/program";
import type { CNode } from "../../src/language/infra/nodes";

// --- Language ---------------------------------------------------------------
const lang = createCoreLanguage();
lang.registerInput({ name: "score", type: "number" });

// --- Program ----------------------------------------------------------------
// Set isPassing = GreaterThan(score, 60)
// Set grade     = If(isPassing, "Pass", "Fail")
// output result = grade
//
// dependsOn is computed by the analyser in production — set manually here
// since the analyser is not yet implemented.

const isPassing: CNode = {
  kind: "operation",
  op: "GreaterThan",
  inputs: {
    a: { kind: "input", name: "score", type: "number", dependsOn: new Set(["score"]) },
    b: { kind: "literal", type: "number", value: 60, dependsOn: new Set() },
  },
  output: "boolean",
  dependsOn: new Set(["score"]),
};

const grade: CNode = {
  kind: "operation",
  op: "If",
  inputs: {
    // RefNode.dependsOn === the referenced binding's dependsOn — analyser invariant
    condition: { kind: "ref", name: "isPassing", type: "boolean", dependsOn: new Set(["score"]) },
    then: { kind: "literal", type: "string", value: "Pass", dependsOn: new Set() },
    else: { kind: "literal", type: "string", value: "Fail", dependsOn: new Set() },
  },
  // inferOutput: both branches are "string" → analyser would infer "string" here
  output: "string",
  dependsOn: new Set(["score"]),
};

const program: CoreProgram = {
  bindings: new Map<string, CNode>([
    ["isPassing", isPassing],
    ["grade", grade],
  ]),
  outputs: new Map<string, CNode>([
    // RefNode to "grade" — dependsOn mirrors the grade binding's dependsOn
    ["result", { kind: "ref", name: "grade", type: "string", dependsOn: new Set(["score"]) }],
  ]),
};

// --- Evaluate ---------------------------------------------------------------
// createProgramRunner initialises inputs from descriptor defaults and maintains
// EvalState across calls — subsequent iterations reuse cached values for nodes
// whose dependsOn does not intersect changedInputs.
//
// For a one-shot evaluation, use run(program, lang.descriptor, { score: 45 })
// from "../../src/core/runner" instead.
const runner = createProgramRunner(program, lang.descriptor);

const testCases = [45, 60, 85];

console.log("Dendrite score grader (passing threshold: > 60)\n");

for (const score of testCases) {
  const t0 = performance.now();
  const outputs = runner.run({ score });
  const elapsed = performance.now() - t0;
  console.log(`  score=${score}  →  result="${outputs.get("result")}"  (${elapsed.toFixed(3)}ms)`);
}
