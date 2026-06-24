import { createStdlib } from "../../src/language/stdlib";
import { createRuntime } from "../../src/language/runtime/runtime";
import type { CNode } from "../../src/language/infra/nodes";
import { CoreProgram } from "../../src/language/infra/program";

// --- Language ---------------------------------------------------------------
const lang = createStdlib();
lang.registerInput({ name: "score", type: "number" });

// --- Programs ----------------------------------------------------------------
// Program A - "grader":
//   Set isPassing = GreaterThan(score, 60)
//   Set grade     = If(isPassing, "Pass", "Fail")
//   output result = grade

const graderProgram: CoreProgram = {
  bindings: new Map<string, CNode>([
    [
      "isPassing",
      {
        kind: "operation",
        op: "GreaterThan",
        inputs: {
          a: { kind: "input", name: "score", type: "number", dependsOn: new Set(["score"]) },
          b: { kind: "literal", type: "number", value: 60, dependsOn: new Set() },
        },
        output: "boolean",
        dependsOn: new Set(["score"]),
      },
    ],
    [
      "grade",
      {
        kind: "operation",
        op: "If",
        inputs: {
          condition: {
            kind: "ref",
            name: "isPassing",
            type: "boolean",
            dependsOn: new Set(["score"]),
          },
          then: { kind: "literal", type: "string", value: "Pass", dependsOn: new Set() },
          else: { kind: "literal", type: "string", value: "Fail", dependsOn: new Set() },
        },
        output: "string",
        dependsOn: new Set(["score"]),
      },
    ],
  ]),
  outputs: new Map<string, CNode>([
    ["result", { kind: "ref", name: "grade", type: "string", dependsOn: new Set(["score"]) }],
  ]),
};

// Program B - "topTier":
//   Set isTop = GreaterThan(score, 90)
//   output topTier = isTop

const topTierProgram: CoreProgram = {
  bindings: new Map<string, CNode>([
    [
      "isTop",
      {
        kind: "operation",
        op: "GreaterThan",
        inputs: {
          a: { kind: "input", name: "score", type: "number", dependsOn: new Set(["score"]) },
          b: { kind: "literal", type: "number", value: 90, dependsOn: new Set() },
        },
        output: "boolean",
        dependsOn: new Set(["score"]),
      },
    ],
  ]),
  outputs: new Map<string, CNode>([
    ["topTier", { kind: "ref", name: "isTop", type: "boolean", dependsOn: new Set(["score"]) }],
  ]),
};

// --- Runtime ----------------------------------------------------------------
const runtime = createRuntime(lang.descriptor);

// Global handler - fires for all programs, including the initial evaluation
// that happens immediately inside register(). score starts as null (no default
// registered), so GreaterThan(null, 60) → false and the first outputs reflect that.
runtime.onOutput((programId, outputs) => {
  const values = [...outputs.entries()].map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ");
  console.log(`  [${programId}] ${values}`);
});

// register() returns a ProgramHandle. Use it for program-scoped subscriptions
// and unregistration. Fires onOutput immediately with the first evaluation.
console.log('--- register "grader" ---');
const graderHandle = runtime.register("grader", graderProgram);

console.log('\n--- register "topTier" ---');
const topTierHandle = runtime.register("topTier", topTierProgram);

const scores = [45, 85, 95];
for (const score of scores) {
  console.log(`\n--- updateInput score=${score} ---`);
  const t0 = performance.now();
  runtime.updateInput("score", score);
  console.log(`  (${(performance.now() - t0).toFixed(3)}ms)`);
}

// Unregister via handle. Clears all per-program handlers automatically.
// runtime.unregister("grader") also works if the handle is unavailable.
console.log('\n--- unregister "grader" ---');
graderHandle.unregister();

console.log("\n--- updateInput score=100 (only topTier active) ---");
const t0 = performance.now();
runtime.updateInput("score", 100);
console.log(`  (${(performance.now() - t0).toFixed(3)}ms)`);

// topTierHandle.unregister() would clean up if continuing
