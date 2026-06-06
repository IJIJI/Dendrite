import { createCoreLanguage } from "../../src/language/core";
import type { ASTNode } from "../../src/language/nodes";
import type { CoreProgram } from "../../src/language/program";
import { createRuntime } from "../../src/language/runtime";

// --- Language ---------------------------------------------------------------
const lang = createCoreLanguage();
lang.registerInput({ name: "score", type: "number" });

// --- Programs ---------------------------------------------------------------
// Program A - "grader":
//   Set isPassing = GreaterThan(score, 60)
//   Set grade     = If(isPassing, "Pass", "Fail")
//   return result: grade

const graderProgram: CoreProgram = {
  bindings: new Map<string, ASTNode>([
    [
      "isPassing",
      {
        kind: "operation",
        op: "GreaterThan",
        inputs: {
          a: { kind: "input", name: "score", type: "number" },
          b: { kind: "literal", type: "number", value: 60 },
        },
        output: "boolean",
      },
    ],
    [
      "grade",
      {
        kind: "operation",
        op: "If",
        inputs: {
          condition: { kind: "ref", name: "isPassing", type: "boolean" },
          then: { kind: "literal", type: "string", value: "Pass" },
          else: { kind: "literal", type: "string", value: "Fail" },
        },
        output: "any",
      },
    ],
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

// Program B - "topTier":
//   Set isTop = GreaterThan(score, 90)
//   return topTier: isTop

const topTierProgram: CoreProgram = {
  bindings: new Map<string, ASTNode>([
    [
      "isTop",
      {
        kind: "operation",
        op: "GreaterThan",
        inputs: {
          a: { kind: "input", name: "score", type: "number" },
          b: { kind: "literal", type: "number", value: 90 },
        },
        output: "boolean",
      },
    ],
  ]),
  outputs: new Map<string, ASTNode>([
    ["topTier", { kind: "ref", name: "isTop", type: "boolean" }],
  ]),
  usedBindings: new Set(["isTop"]),
  evalOrder: ["isTop"],
  dependents: new Map([["score", new Set(["isTop"])]]),
  outputDependencies: new Map([["topTier", new Set(["score"])]]),
};

// --- Runtime ----------------------------------------------------------------
const runtime = createRuntime(lang.descriptor);

runtime.onOutput((programId, outputs) => {
  const values = [...outputs.entries()]
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(", ");
  console.log(`  [${programId}] ${values}`);
});

console.log('--- register "grader" ---');
runtime.register("grader", graderProgram);

console.log('\n--- register "topTier" ---');
runtime.register("topTier", topTierProgram);

const scores = [45, 85, 95];
for (const score of scores) {
  console.log(`\n--- updateInput score=${score} ---`);
  const t0 = performance.now();
  runtime.updateInput("score", score);
  console.log(`  (${(performance.now() - t0).toFixed(3)}ms)`);
}

console.log('\n--- unregister "grader" ---');
runtime.unregister("grader");

console.log("\n--- updateInput score=100 (only topTier active) ---");
const t0 = performance.now();
runtime.updateInput("score", 100);
console.log(`  (${(performance.now() - t0).toFixed(3)}ms)`);
