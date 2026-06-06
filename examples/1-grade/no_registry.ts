import { createCoreLanguage } from "../../src/language/core";
import type { ASTNode } from "../../src/language/nodes";
import {
  createEvalState,
  initializeProgram,
  updateInput,
  evaluateProgram,
  type CoreProgram,
} from "../../src/language/program";

// --- Language ---------------------------------------------------------------
const lang = createCoreLanguage();
lang.registerInput({ name: "score", type: "number" });

// --- Program ----------------------------------------------------------------
// Equivalent to:
//   Set isPassing = GreaterThan(score, 60)
//   Set grade     = If(isPassing, "Pass", "Fail")
//   return result: grade

const isPassing: ASTNode = {
  kind: "operation",
  op: "GreaterThan",
  inputs: {
    a: { kind: "input", name: "score", type: "number" },
    b: { kind: "literal", type: "number", value: 60 },
  },
  output: "boolean",
};

const grade: ASTNode = {
  kind: "operation",
  op: "If",
  inputs: {
    condition: { kind: "ref", name: "isPassing", type: "boolean" },
    then: { kind: "literal", type: "string", value: "Pass" },
    else: { kind: "literal", type: "string", value: "Fail" },
  },
  output: "any",
};

const program: CoreProgram = {
  bindings: new Map<string, ASTNode>([
    ["isPassing", isPassing],
    ["grade", grade],
  ]),

  outputs: new Map<string, ASTNode>([
    ["result", { kind: "ref", name: "grade", type: "any" }],
  ]),

  usedBindings: new Set(["isPassing", "grade"]),
  evalOrder: ["isPassing", "grade"],
  dependents: new Map([
    ["score", new Set(["isPassing"])],
    ["isPassing", new Set(["grade"])],
  ]),
  outputDependencies: new Map([["result", new Set(["score"])]]),
};

// --- Evaluate ---------------------------------------------------------------
const state = createEvalState();
initializeProgram(program, state);

const testCases = [45, 60, 85];

console.log("Dendrite score grader (passing threshold: > 60)\n");

for (const score of testCases) {
  const t0 = performance.now();
  updateInput("score", score, state, program);
  const outputs = evaluateProgram(program, state, lang.descriptor);
  const elapsed = performance.now() - t0;
  console.log(
    `  score=${score}  →  result="${outputs.get("result")}"  (${elapsed.toFixed(3)}ms)`,
  );
}
