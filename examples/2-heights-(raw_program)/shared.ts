/**
 * Shared definitions for the heights raw_program examples.
 *
 * Demonstrates the analyser: programs are written as RawPrograms (ASTNode trees)
 * and compiled to CorePrograms via analyse() before evaluation.
 *
 * Inputs:  men, women, unknown — number[] of individual height measurements (cm)
 * Outputs: avgX / countX — per category and total. Declared per-file, not here.
 */

import { analyse } from "../../src/language/analyser";
import { extendCoreLanguage } from "../../src/language/core";
import { createLanguage, type Language } from "../../src/language/registry";
import type { ASTNode, OperationNode, HigherOrderNode } from "../../src/language/nodes";
import type { CoreProgram, RawProgram } from "../../src/language/program";

// ---------------------------------------------------------------------------
// Language factory — inputs only, no outputs (callers register their own)
// ---------------------------------------------------------------------------

export function createHeightsLang(): Language {
  const lang = createLanguage();
  lang.registerInput({ name: "men",     type: "number[]", default: [] });
  lang.registerInput({ name: "women",   type: "number[]", default: [] });
  lang.registerInput({ name: "unknown", type: "number[]", default: [] });
  return extendCoreLanguage(lang);
}

// ---------------------------------------------------------------------------
// AST helpers (descriptor-independent)
// ---------------------------------------------------------------------------

function inp(name: string): ASTNode {
  return { kind: "input", name, type: "number[]" };
}

function lit(value: number): ASTNode {
  return { kind: "literal", value };
}

function ref(name: string): ASTNode {
  return { kind: "ref", name };
}

function add(...nodes: ASTNode[]): OperationNode {
  return { kind: "operation", op: "Add", inputs: { nodes }, output: "number" };
}

function divide(a: ASTNode, b: ASTNode): OperationNode {
  return { kind: "operation", op: "Divide", inputs: { a, b }, output: "number" };
}

function length(list: ASTNode): OperationNode {
  return { kind: "operation", op: "Length", inputs: { list }, output: "number" };
}

function sumList(list: ASTNode): HigherOrderNode {
  return {
    kind: "higher_order",
    op: "Reduce",
    inputs: { list, initial: lit(0) },
    bindings: ["acc", "item"],
    body: add(ref("acc"), ref("item")),
  };
}

function filterAbove(list: ASTNode, threshold: number): HigherOrderNode {
  return {
    kind: "higher_order",
    op: "Filter",
    inputs: { list },
    bindings: ["item"],
    body: {
      kind: "operation",
      op: "GreaterThan",
      inputs: { a: ref("item"), b: lit(threshold) },
      output: "boolean",
    },
  };
}

// ---------------------------------------------------------------------------
// Raw programs (pure ASTNode trees — no descriptor dependency)
// ---------------------------------------------------------------------------

// Full program — all 8 outputs in one program, used by run() and ProgramRunner.
//
// avgX     = sumX / Length(x)
// countX   = Length(Filter(x, item => item > 185))
// avgTotal = (sumMen + sumWomen + sumUnknown) / (len(men) + len(women) + len(unknown))
// countTotal = countMen + countWomen + countUnknown

export const fullRaw: RawProgram = {
  bindings: new Map<string, ASTNode>([
    ["sumMen",       sumList(inp("men"))],
    ["sumWomen",     sumList(inp("women"))],
    ["sumUnknown",   sumList(inp("unknown"))],

    ["avgMen",       divide(ref("sumMen"),    length(inp("men")))],
    ["avgWomen",     divide(ref("sumWomen"),  length(inp("women")))],
    ["avgUnknown",   divide(ref("sumUnknown"), length(inp("unknown")))],

    ["totalSum",     add(ref("sumMen"), ref("sumWomen"), ref("sumUnknown"))],
    ["totalLen",     add(length(inp("men")), length(inp("women")), length(inp("unknown")))],
    ["avgTotal",     divide(ref("totalSum"), ref("totalLen"))],

    ["menAbove",     filterAbove(inp("men"), 185)],
    ["womenAbove",   filterAbove(inp("women"), 185)],
    ["unknownAbove", filterAbove(inp("unknown"), 185)],

    ["countMen",     length(ref("menAbove"))],
    ["countWomen",   length(ref("womenAbove"))],
    ["countUnknown", length(ref("unknownAbove"))],
    ["countTotal",   add(ref("countMen"), ref("countWomen"), ref("countUnknown"))],
  ]),
  outputs: new Map<string, ASTNode>([
    ["avgMen",      ref("avgMen")],
    ["avgWomen",    ref("avgWomen")],
    ["avgUnknown",  ref("avgUnknown")],
    ["avgTotal",    ref("avgTotal")],
    ["countMen",    ref("countMen")],
    ["countWomen",  ref("countWomen")],
    ["countUnknown", ref("countUnknown")],
    ["countTotal",  ref("countTotal")],
  ]),
};

// Per-category raw programs — used by Runtime.
// Each depends only on its own input; split programs are analysed separately
// with scoped descriptors in 3-runtime.ts.

function makeCategoryRaw(cat: string): RawProgram {
  const C = cat.charAt(0).toUpperCase() + cat.slice(1);
  return {
    bindings: new Map<string, ASTNode>([
      [`sum${C}`,    sumList(inp(cat))],
      [`avg${C}`,    divide(ref(`sum${C}`), length(inp(cat)))],
      [`${cat}Above`, filterAbove(inp(cat), 185)],
      [`count${C}`,  length(ref(`${cat}Above`))],
    ]),
    outputs: new Map<string, ASTNode>([
      [`avg${C}`,   ref(`avg${C}`)],
      [`count${C}`, ref(`count${C}`)],
    ]),
  };
}

export const menRaw     = makeCategoryRaw("men");
export const womenRaw   = makeCategoryRaw("women");
export const unknownRaw = makeCategoryRaw("unknown");

export const totalsRaw: RawProgram = {
  bindings: new Map<string, ASTNode>([
    ["tSumMen",     sumList(inp("men"))],
    ["tSumWomen",   sumList(inp("women"))],
    ["tSumUnknown", sumList(inp("unknown"))],
    ["totalSum",    add(ref("tSumMen"), ref("tSumWomen"), ref("tSumUnknown"))],
    ["totalLen",    add(length(inp("men")), length(inp("women")), length(inp("unknown")))],
    ["avgTotal",    divide(ref("totalSum"), ref("totalLen"))],
    ["tMenAbove",     filterAbove(inp("men"), 185)],
    ["tWomenAbove",   filterAbove(inp("women"), 185)],
    ["tUnknownAbove", filterAbove(inp("unknown"), 185)],
    ["countTotal",  add(length(ref("tMenAbove")), length(ref("tWomenAbove")), length(ref("tUnknownAbove")))],
  ]),
  outputs: new Map<string, ASTNode>([
    ["avgTotal",   ref("avgTotal")],
    ["countTotal", ref("countTotal")],
  ]),
};

// ---------------------------------------------------------------------------
// Analysis utility
// ---------------------------------------------------------------------------

export function assertOk(result: ReturnType<typeof analyse>, label: string): CoreProgram {
  if (!result.ok) {
    const msgs = result.errors.map((e) => `  ${e.kind}: ${e.message}`).join("\n");
    throw new Error(`Analysis failed for '${label}':\n${msgs}`);
  }
  return result.program;
}

// ---------------------------------------------------------------------------
// Dataset
// ---------------------------------------------------------------------------

export type Scenario = { label: string; men: number[]; women: number[]; unknown: number[] };

const menSmall     = [172, 178, 181, 169, 183, 175, 188, 171, 177, 180];
const womenSmall   = [160, 165, 158, 170, 163, 168, 155, 172, 161, 166];
const unknownSmall = [170, 175, 162, 183, 168, 177, 155, 190, 165, 173];

const menLarge     = Array.from({ length: 5_000 }, (_, i) => 165 + (i % 30));
const womenLarge   = Array.from({ length: 5_000 }, (_, i) => 152 + (i % 25));
const unknownLarge = Array.from({ length: 2_000 }, (_, i) => 158 + (i % 35));

export const scenarios: Scenario[] = [
  { label: "small dataset",           men: menSmall,  women: womenSmall,  unknown: unknownSmall },
  { label: "only men change",         men: [...menSmall, 192, 187, 174],  women: womenSmall,  unknown: unknownSmall },
  { label: "only women change",       men: menSmall,  women: [...womenSmall, 185, 159, 171],  unknown: unknownSmall },
  { label: "only unknown changes",    men: menSmall,  women: womenSmall,  unknown: [...unknownSmall, 186, 169] },
  { label: "all change (large)",      men: menLarge,  women: womenLarge,  unknown: unknownLarge },
  { label: "only men change (large)", men: [...menLarge, 195, 188], women: womenLarge, unknown: unknownLarge },
];

// ---------------------------------------------------------------------------
// Delta / scenario helpers
// ---------------------------------------------------------------------------

export function delta(prev: Scenario | undefined, curr: Scenario): Record<string, unknown> {
  const changes: Record<string, unknown> = {};
  if (!prev || prev.men     !== curr.men)     changes.men     = curr.men;
  if (!prev || prev.women   !== curr.women)   changes.women   = curr.women;
  if (!prev || prev.unknown !== curr.unknown) changes.unknown = curr.unknown;
  return changes;
}

export function changesFrom(prev: Scenario | undefined, curr: Scenario): string {
  if (!prev) return "initial";
  const parts = (["men", "women", "unknown"] as const).filter(
    (k) => prev[k] !== curr[k],
  );
  return parts.length === 0 ? "unchanged" : `${parts.join("+")} changed`;
}

export function logHeader(s: Scenario, note: string): void {
  const total = s.men.length + s.women.length + s.unknown.length;
  console.log(`\n[${s.label}] ${total} measurements  (${note})`);
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export function display(outputs: Map<string, unknown>): void {
  const fmt = (k: string) => (outputs.get(k) as number).toFixed(1);
  console.log(`  avg:   men=${fmt("avgMen")}  women=${fmt("avgWomen")}  unknown=${fmt("avgUnknown")}  total=${fmt("avgTotal")}`);
  console.log(`  >185:  men=${outputs.get("countMen")}  women=${outputs.get("countWomen")}  unknown=${outputs.get("countUnknown")}  total=${outputs.get("countTotal")}`);
}

export function displayRuntime(
  results: Map<string, Map<string, unknown>>,
  last: Record<string, Map<string, unknown>>,
): void {
  const get = (prog: string) => results.get(prog) ?? last[prog];
  const fmt = (prog: string, key: string) => (get(prog).get(key) as number).toFixed(1);

  const skipped = ["men", "women", "unknown", "totals"].filter((k) => !results.has(k));

  console.log(
    `  avg:   men=${fmt("men", "avgMen")}  women=${fmt("women", "avgWomen")}  unknown=${fmt("unknown", "avgUnknown")}  total=${fmt("totals", "avgTotal")}`,
  );
  console.log(
    `  >185:  men=${get("men").get("countMen")}  women=${get("women").get("countWomen")}  unknown=${get("unknown").get("countUnknown")}  total=${get("totals").get("countTotal")}`,
  );
  if (skipped.length) console.log(`  (skipped — no change: ${skipped.join(", ")})`);
}
