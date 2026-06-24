/**
 * Shared definitions for the core large_dataset language examples.
 */

import { createStdlib } from "../../src/language/stdlib";
import { CoreProgram } from "../../src/language/program";
import {
  CInputNode,
  CRefNode,
  CLiteralNode,
  COperationNode,
  CHigherOrderNode,
} from "../../src/language/infra/nodes";

// ---------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------

export const lang = createStdlib();
lang.registerInput({ name: "values", type: "any", default: [] });
lang.registerInput({ name: "threshold", type: "number", default: 50 });
lang.registerOutput({ name: "passing", type: "any", mode: "required" });
lang.registerOutput({ name: "anyPassed", type: "boolean", mode: "required" });
lang.registerOutput({ name: "anyCumLaude", type: "boolean", mode: "desired" });

export const { descriptor } = lang;

// ---------------------------------------------------------------------------
// Shared nodes
// ---------------------------------------------------------------------------

const valuesInput: CInputNode = {
  kind: "input",
  name: "values",
  type: "any",
  dependsOn: new Set(["values"]),
};
const thresholdInput: CInputNode = {
  kind: "input",
  name: "threshold",
  type: "number",
  dependsOn: new Set(["threshold"]),
};
const itemRef: CRefNode = {
  kind: "ref",
  name: "n",
  type: "number",
  dependsOn: new Set(),
};
const ninety: CLiteralNode = {
  kind: "literal",
  type: "number",
  value: 90,
  dependsOn: new Set(),
};

const filterBody: COperationNode = {
  kind: "operation",
  op: "GreaterThan",
  inputs: { a: itemRef, b: thresholdInput },
  output: "boolean",
  dependsOn: new Set(["threshold"]),
};
const somePassBody: COperationNode = {
  kind: "operation",
  op: "GreaterThan",
  inputs: { a: itemRef, b: thresholdInput },
  output: "boolean",
  dependsOn: new Set(["threshold"]),
};
const cumLaudeBody: COperationNode = {
  kind: "operation",
  op: "GreaterThan",
  inputs: { a: itemRef, b: ninety },
  output: "boolean",
  dependsOn: new Set(),
};

// ---------------------------------------------------------------------------
// Program — single program for run() and ProgramRunner
//
// Set passing     = Filter(values, n => GreaterThan(n, threshold))
// Set anyPassed   = Some(values,   n => GreaterThan(n, threshold))
// Set anyCumLaude = Some(values,   n => GreaterThan(n, 90))
// ---------------------------------------------------------------------------

export const program: CoreProgram = {
  bindings: new Map([
    [
      "passing",
      {
        kind: "higher_order",
        op: "Filter",
        inputs: { list: valuesInput },
        bindings: ["n"],
        body: filterBody,
        dependsOn: new Set(["values", "threshold"]),
      } as CHigherOrderNode,
    ],
    [
      "anyPassed",
      {
        kind: "higher_order",
        op: "Some",
        inputs: { list: valuesInput },
        bindings: ["n"],
        body: somePassBody,
        dependsOn: new Set(["values", "threshold"]),
      } as CHigherOrderNode,
    ],
    [
      "anyCumLaude",
      {
        kind: "higher_order",
        op: "Some",
        inputs: { list: valuesInput },
        bindings: ["n"],
        body: cumLaudeBody,
        dependsOn: new Set(["values"]),
      } as CHigherOrderNode,
    ],
  ]),
  outputs: new Map([
    [
      "passing",
      {
        kind: "ref",
        name: "passing",
        type: "any",
        dependsOn: new Set(["values", "threshold"]),
      } as CRefNode,
    ],
    [
      "anyPassed",
      {
        kind: "ref",
        name: "anyPassed",
        type: "boolean",
        dependsOn: new Set(["values", "threshold"]),
      } as CRefNode,
    ],
    [
      "anyCumLaude",
      {
        kind: "ref",
        name: "anyCumLaude",
        type: "boolean",
        dependsOn: new Set(["values"]),
      } as CRefNode,
    ],
  ]),
};

// ---------------------------------------------------------------------------
// Programs: split by dependency boundary for Runtime
//
// 'filtering'  dependsOn: values, threshold  →  passing, anyPassed
// 'honors'     dependsOn: values only         →  anyCumLaude
// ---------------------------------------------------------------------------

export const filteringProgram: CoreProgram = {
  bindings: new Map([
    [
      "passing",
      {
        kind: "higher_order",
        op: "Filter",
        inputs: { list: valuesInput },
        bindings: ["n"],
        body: filterBody,
        dependsOn: new Set(["values", "threshold"]),
      } as CHigherOrderNode,
    ],
    [
      "anyPassed",
      {
        kind: "higher_order",
        op: "Some",
        inputs: { list: valuesInput },
        bindings: ["n"],
        body: somePassBody,
        dependsOn: new Set(["values", "threshold"]),
      } as CHigherOrderNode,
    ],
  ]),
  outputs: new Map([
    [
      "passing",
      {
        kind: "ref",
        name: "passing",
        type: "any",
        dependsOn: new Set(["values", "threshold"]),
      } as CRefNode,
    ],
    [
      "anyPassed",
      {
        kind: "ref",
        name: "anyPassed",
        type: "boolean",
        dependsOn: new Set(["values", "threshold"]),
      } as CRefNode,
    ],
  ]),
};

export const honorsProgram: CoreProgram = {
  bindings: new Map([
    [
      "anyCumLaude",
      {
        kind: "higher_order",
        op: "Some",
        inputs: { list: valuesInput },
        bindings: ["n"],
        body: cumLaudeBody,
        dependsOn: new Set(["values"]),
      } as CHigherOrderNode,
    ],
  ]),
  outputs: new Map([
    [
      "anyCumLaude",
      {
        kind: "ref",
        name: "anyCumLaude",
        type: "boolean",
        dependsOn: new Set(["values"]),
      } as CRefNode,
    ],
  ]),
};

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
