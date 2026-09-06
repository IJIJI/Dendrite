/**
 * Shared definitions for the large_dataset examples.
 *
 * The programs are defined as SOURCE and compiled via parseSource + analyse — the same
 * pipeline the playground and code editor use. (Hand-building analysed CNodes, as this
 * file once did, is an anti-pattern: the analyser derives dependsOn and output types.)
 *
 * Inputs:  values — number[] of scores; threshold — passing bar
 * Outputs: passing (the filtered list), anyPassed, anyCumLaude (> 90)
 *
 * Inputs are GLOBAL (one dataset, shared by every program); each program declares the
 * outputs it owns as its own port layer.
 */

import { createEnvironment, type ProgramEnvironment } from "../../src/language/environment";
import { createLanguage } from "../../src/language/language";
import { extendStdlib } from "../../src/language/stdlib";
import { type PortLayer, Policy } from "../../src/language/infra/ports";
import type { LanguageDescriptor } from "../../src/language/infra/registry";
import { Type } from "../../src/language/infra/types";
import type { CoreProgram } from "../../src/language/infra/program";

// ---------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------

// Vocabulary only: types, ops and evaluators.
export const lang = extendStdlib(createLanguage());
const env = createEnvironment(lang);

// The dataset, global to every program.
export const HOST: PortLayer = {
  id: "host",
  ports: {
    inputs: [
      { name: "values", type: Type.array(Type.number), default: [] },
      { name: "threshold", type: Type.number, default: 50 },
    ],
    outputs: [],
  },
  policy: Policy.host,
};

const layer = (id: string, outputs: PortLayer["ports"]["outputs"]): PortLayer => ({
  id,
  ports: { inputs: [], outputs },
  policy: Policy.host,
});

const PASSING = { name: "passing", type: Type.array(Type.number), mode: "required" as const };
const ANY_PASSED = { name: "anyPassed", type: Type.boolean, mode: "required" as const };
const ANY_CUM_LAUDE = { name: "anyCumLaude", type: Type.boolean, mode: "desired" as const };

const FULL = layer("full", [PASSING, ANY_PASSED, ANY_CUM_LAUDE]);
// Split by dependency boundary for the Runtime.
export const FILTERING = layer("filtering", [PASSING, ANY_PASSED]);
export const HONORS = layer("honors", [{ ...ANY_CUM_LAUDE, mode: "required" as const }]);

function environmentFor(spec: PortLayer): ProgramEnvironment {
  const composed = env.forProgram([HOST], [spec]);
  if (!composed.ok) {
    const msgs = composed.problems.map((p) => `  ${p.where}: ${p.message}`).join("\n");
    throw new Error(`Ports of '${spec.id}' do not compose:\n${msgs}`);
  }
  return composed.environment;
}

/** What run() and ProgramRunner evaluate the full program against. */
export const descriptor: LanguageDescriptor = environmentFor(FULL).descriptor;

// ---------------------------------------------------------------------------
// Programs (source → parse → analyse)
// ---------------------------------------------------------------------------

function compileOrThrow(spec: PortLayer, source: string): CoreProgram {
  const result = environmentFor(spec).compile(source);
  if (!result.ok) {
    const msgs = result.errors.map((e) => `  ${e.kind}: ${e.message}`).join("\n");
    throw new Error(`Compile failed for '${spec.id}' at ${result.stage}:\n${msgs}`);
  }
  return result.program;
}

// Single program for run() and ProgramRunner — all three outputs together.
export const program = compileOrThrow(
  FULL,
  `
let passing     = Filter($values, n => n > $threshold)
let anyPassed   = Some($values, n => n > $threshold)
let anyCumLaude = Some($values, n => n > 90)

output passing     = passing
output anyPassed   = anyPassed
output anyCumLaude = anyCumLaude
`,
);

//   'filtering' dependsOn values+threshold → passing, anyPassed
//   'honors'    dependsOn values only      → anyCumLaude (skipped on threshold-only changes)
export const filteringProgram = compileOrThrow(
  FILTERING,
  `
let passing   = Filter($values, n => n > $threshold)
let anyPassed = Some($values, n => n > $threshold)

output passing   = passing
output anyPassed = anyPassed
`,
);

export const honorsProgram = compileOrThrow(
  HONORS,
  `
output anyCumLaude = Some($values, n => n > 90)
`,
);

// ---------------------------------------------------------------------------
// Scenarios
//
// scores10k/scores100k are pre-allocated so consecutive scenarios sharing the
// same list have the same object reference. delta() uses reference equality to
// detect unchanged values — runner and runtime skip re-evaluating anyCumLaude
// when only threshold changes (scenarios 5→7, 8→9).
// ---------------------------------------------------------------------------

export type Scenario = { label: string; values: number[]; threshold: number };

const scores10k = Array.from({ length: 10_000 }, (_, i) => (i % 100) + 1);
const scores100k = Array.from({ length: 100_000 }, (_, i) => (i % 100) + 1);

export const scenarios: Scenario[] = [
  { label: "mixed", values: [45, 67, 82, 23, 91, 55, 88], threshold: 60 },
  { label: "all fail", values: [10, 20, 30, 40], threshold: 50 },
  { label: "pass, no honors", values: [55, 65, 75, 85], threshold: 50 },
  { label: "all honors", values: [91, 92, 95, 98], threshold: 80 },
  { label: "10k  @ t=70", values: scores10k, threshold: 70 },
  { label: "10k  @ t=80", values: scores10k, threshold: 80 }, // same values
  { label: "10k  @ t=90", values: scores10k, threshold: 90 }, // same values
  { label: "100k @ t=80", values: scores100k, threshold: 80 },
  { label: "100k @ t=90", values: scores100k, threshold: 90 }, // same values
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Describe what changed between two consecutive scenarios. */
export function changesFrom(prev: Scenario | undefined, curr: Scenario): string {
  if (!prev) return "initial";
  const v = prev.values !== curr.values;
  const t = prev.threshold !== curr.threshold;
  if (v && t) return "values+threshold";
  if (v) return "values only";
  if (t) return "threshold only";
  return "unchanged";
}

/** Pass only inputs that actually changed. Enables node-level and program-level caching. */
export function delta(prev: Scenario | undefined, curr: Scenario): Record<string, unknown> {
  const changes: Record<string, unknown> = {};
  if (!prev || prev.values !== curr.values) changes.values = curr.values;
  if (!prev || prev.threshold !== curr.threshold) changes.threshold = curr.threshold;
  return changes;
}

/** Print the standard scenario header line. */
export function logHeader(s: Scenario, note: string): void {
  console.log(`\n[${s.label}] ${s.values.length} inputs, threshold: ${s.threshold}  (${note})`);
}

/** Display outputs from a single program (run / runner). */
export function display(outputs: Map<string, unknown>): void {
  const passing = outputs.get("passing") as unknown[];
  console.log(`  passing:      ${passing.length} items`);
  console.log(`  anyPassed:    ${outputs.get("anyPassed")}`);
  console.log(`  anyCumLaude: ${outputs.get("anyCumLaude")}`);
}

/** Display outputs from the split runtime programs, noting when honors was skipped. */
export function displayRuntime(
  results: Map<string, Map<string, unknown>>,
  lastHonors: Map<string, unknown>,
): void {
  const f = results.get("filtering")!;
  const honorsRan = results.has("honors");
  const h = honorsRan ? results.get("honors")! : lastHonors;
  const passing = f.get("passing") as unknown[];
  console.log(`  passing:      ${passing.length} items`);
  console.log(`  anyPassed:    ${f.get("anyPassed")}`);
  console.log(
    `  anyCumLaude: ${h.get("anyCumLaude")}  ${honorsRan ? "" : "(honors not evaluated — cached)"}`,
  );
}

/** Time a call silently. returns result and duration in ms. */
export function time<T>(fn: () => T): { result: T; ms: number } {
  const t = performance.now();
  const result = fn();
  return { result, ms: performance.now() - t };
}

/** Time a call and log the duration. */
export function timed<T>(label: string, fn: () => T): T {
  const { result, ms } = time(fn);
  console.log(`  Runtime  ${label}: ${ms.toFixed(3)}ms`);
  return result;
}
