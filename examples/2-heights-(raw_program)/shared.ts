/**
 * Shared definitions for the heights raw_program examples.
 *
 * Demonstrates the analyser: programs are written as RawPrograms (ASTNode trees)
 * and compiled to CorePrograms via analyse() before evaluation.
 *
 * Inputs:  men, women, unknown — number[] of individual height measurements (cm)
 * Outputs: avgX / countX — average height and count above 185 cm, per category and total
 */

import { analyse } from "../../src/language/analyser/analyser";
import { extendStdlib } from "../../src/language/stdlib";
import { createLanguage } from "../../src/language/infra/registry";
import type { ASTNode, OperationNode, HigherOrderNode } from "../../src/language/infra/nodes";
import type { CoreProgram, RawProgram } from "../../src/language/program";

// ---------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------

function createHeightsLang() {
  const lang = createLanguage();
  lang.registerInput({ name: "men", type: "number[]", default: [] });
  lang.registerInput({ name: "women", type: "number[]", default: [] });
  lang.registerInput({ name: "unknown", type: "number[]", default: [] });
  return extendStdlib(lang);
}

// Full language — all 8 outputs. Used by run() and ProgramRunner.
export const fullLang = createHeightsLang();
fullLang.registerOutput({ name: "avgMen", type: "number", mode: "required" });
fullLang.registerOutput({ name: "avgWomen", type: "number", mode: "required" });
fullLang.registerOutput({ name: "avgUnknown", type: "number", mode: "required" });
fullLang.registerOutput({ name: "avgTotal", type: "number", mode: "required" });
fullLang.registerOutput({ name: "countMen", type: "number", mode: "required" });
fullLang.registerOutput({ name: "countWomen", type: "number", mode: "required" });
fullLang.registerOutput({ name: "countUnknown", type: "number", mode: "required" });
fullLang.registerOutput({ name: "countTotal", type: "number", mode: "required" });

// Runtime language — inputs only, used for input routing in the 4-way split.
export const runtimeLang = createHeightsLang();

// ---------------------------------------------------------------------------
// AST helpers
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
// Raw programs
// ---------------------------------------------------------------------------

// Full program — all 8 outputs in one program, used by run() and ProgramRunner.
//
// Set sumMen     = Reduce(men,     0, (acc, item) => acc + item)
// Set sumWomen   = Reduce(women,   0, (acc, item) => acc + item)
// Set sumUnknown = Reduce(unknown, 0, (acc, item) => acc + item)
// Set avgMen     = Divide(sumMen,    Length(men))
// Set avgWomen   = Divide(sumWomen,  Length(women))
// Set avgUnknown = Divide(sumUnknown, Length(unknown))
// Set totalSum   = Add(sumMen, sumWomen, sumUnknown)
// Set totalLen   = Add(Length(men), Length(women), Length(unknown))
// Set avgTotal   = Divide(totalSum, totalLen)
// Set menAbove     = Filter(men,     item => item > 185)
// Set womenAbove   = Filter(women,   item => item > 185)
// Set unknownAbove = Filter(unknown, item => item > 185)
// Set countMen     = Length(menAbove)
// Set countWomen   = Length(womenAbove)
// Set countUnknown = Length(unknownAbove)
// Set countTotal   = Add(countMen, countWomen, countUnknown)

const fullRaw: RawProgram = {
  bindings: new Map<string, ASTNode>([
    ["sumMen", sumList(inp("men"))],
    ["sumWomen", sumList(inp("women"))],
    ["sumUnknown", sumList(inp("unknown"))],

    ["avgMen", divide(ref("sumMen"), length(inp("men")))],
    ["avgWomen", divide(ref("sumWomen"), length(inp("women")))],
    ["avgUnknown", divide(ref("sumUnknown"), length(inp("unknown")))],

    ["totalSum", add(ref("sumMen"), ref("sumWomen"), ref("sumUnknown"))],
    ["totalLen", add(length(inp("men")), length(inp("women")), length(inp("unknown")))],
    ["avgTotal", divide(ref("totalSum"), ref("totalLen"))],

    ["menAbove", filterAbove(inp("men"), 185)],
    ["womenAbove", filterAbove(inp("women"), 185)],
    ["unknownAbove", filterAbove(inp("unknown"), 185)],

    ["countMen", length(ref("menAbove"))],
    ["countWomen", length(ref("womenAbove"))],
    ["countUnknown", length(ref("unknownAbove"))],
    ["countTotal", add(ref("countMen"), ref("countWomen"), ref("countUnknown"))],
  ]),
  outputs: new Map<string, ASTNode>([
    ["avgMen", ref("avgMen")],
    ["avgWomen", ref("avgWomen")],
    ["avgUnknown", ref("avgUnknown")],
    ["avgTotal", ref("avgTotal")],
    ["countMen", ref("countMen")],
    ["countWomen", ref("countWomen")],
    ["countUnknown", ref("countUnknown")],
    ["countTotal", ref("countTotal")],
  ]),
};

// Per-category programs — each depends only on its own input.
// Used by Runtime so that changing one category skips the other two.

// Set sumMen   = Reduce(men, 0, (acc, item) => acc + item)
// Set avgMen   = Divide(sumMen, Length(men))
// Set menAbove = Filter(men, item => item > 185)
// Set countMen = Length(menAbove)
const menRaw: RawProgram = {
  bindings: new Map<string, ASTNode>([
    ["sumMen", sumList(inp("men"))],
    ["avgMen", divide(ref("sumMen"), length(inp("men")))],
    ["menAbove", filterAbove(inp("men"), 185)],
    ["countMen", length(ref("menAbove"))],
  ]),
  outputs: new Map<string, ASTNode>([
    ["avgMen", ref("avgMen")],
    ["countMen", ref("countMen")],
  ]),
};

// Set sumWomen   = Reduce(women, 0, (acc, item) => acc + item)
// Set avgWomen   = Divide(sumWomen, Length(women))
// Set womenAbove = Filter(women, item => item > 185)
// Set countWomen = Length(womenAbove)
const womenRaw: RawProgram = {
  bindings: new Map<string, ASTNode>([
    ["sumWomen", sumList(inp("women"))],
    ["avgWomen", divide(ref("sumWomen"), length(inp("women")))],
    ["womenAbove", filterAbove(inp("women"), 185)],
    ["countWomen", length(ref("womenAbove"))],
  ]),
  outputs: new Map<string, ASTNode>([
    ["avgWomen", ref("avgWomen")],
    ["countWomen", ref("countWomen")],
  ]),
};

// Set sumUnknown   = Reduce(unknown, 0, (acc, item) => acc + item)
// Set avgUnknown   = Divide(sumUnknown, Length(unknown))
// Set unknownAbove = Filter(unknown, item => item > 185)
// Set countUnknown = Length(unknownAbove)
const unknownRaw: RawProgram = {
  bindings: new Map<string, ASTNode>([
    ["sumUnknown", sumList(inp("unknown"))],
    ["avgUnknown", divide(ref("sumUnknown"), length(inp("unknown")))],
    ["unknownAbove", filterAbove(inp("unknown"), 185)],
    ["countUnknown", length(ref("unknownAbove"))],
  ]),
  outputs: new Map<string, ASTNode>([
    ["avgUnknown", ref("avgUnknown")],
    ["countUnknown", ref("countUnknown")],
  ]),
};

// Totals program — depends on all three inputs, re-derives sums independently.
//
// Set tSumMen     = Reduce(men,     0, (acc, item) => acc + item)
// Set tSumWomen   = Reduce(women,   0, (acc, item) => acc + item)
// Set tSumUnknown = Reduce(unknown, 0, (acc, item) => acc + item)
// Set totalSum    = Add(tSumMen, tSumWomen, tSumUnknown)
// Set totalLen    = Add(Length(men), Length(women), Length(unknown))
// Set avgTotal    = Divide(totalSum, totalLen)
// Set tMenAbove   = Filter(men,     item => item > 185)
// Set tWomenAbove = Filter(women,   item => item > 185)
// Set tUnkAbove   = Filter(unknown, item => item > 185)
// Set countTotal  = Add(Length(tMenAbove), Length(tWomenAbove), Length(tUnkAbove))
const totalsRaw: RawProgram = {
  bindings: new Map<string, ASTNode>([
    ["tSumMen", sumList(inp("men"))],
    ["tSumWomen", sumList(inp("women"))],
    ["tSumUnknown", sumList(inp("unknown"))],
    ["totalSum", add(ref("tSumMen"), ref("tSumWomen"), ref("tSumUnknown"))],
    ["totalLen", add(length(inp("men")), length(inp("women")), length(inp("unknown")))],
    ["avgTotal", divide(ref("totalSum"), ref("totalLen"))],
    ["tMenAbove", filterAbove(inp("men"), 185)],
    ["tWomenAbove", filterAbove(inp("women"), 185)],
    ["tUnkAbove", filterAbove(inp("unknown"), 185)],
    [
      "countTotal",
      add(length(ref("tMenAbove")), length(ref("tWomenAbove")), length(ref("tUnkAbove"))),
    ],
  ]),
  outputs: new Map<string, ASTNode>([
    ["avgTotal", ref("avgTotal")],
    ["countTotal", ref("countTotal")],
  ]),
};

// ---------------------------------------------------------------------------
// Pre-analysed programs
// ---------------------------------------------------------------------------

function assertOk(result: ReturnType<typeof analyse>, label: string): CoreProgram {
  if (!result.ok) {
    const msgs = result.errors.map((e) => `  ${e.kind}: ${e.message}`).join("\n");
    throw new Error(`Analysis failed for '${label}':\n${msgs}`);
  }
  return result.program;
}

export const fullProgram = assertOk(analyse(fullRaw, fullLang.descriptor), "full");

// Scoped languages for the 4-way runtime split — each holds only its two outputs.
const menLang = createHeightsLang();
menLang.registerOutput({ name: "avgMen", type: "number", mode: "required" });
menLang.registerOutput({ name: "countMen", type: "number", mode: "required" });

const womenLang = createHeightsLang();
womenLang.registerOutput({ name: "avgWomen", type: "number", mode: "required" });
womenLang.registerOutput({ name: "countWomen", type: "number", mode: "required" });

const unknownLang = createHeightsLang();
unknownLang.registerOutput({ name: "avgUnknown", type: "number", mode: "required" });
unknownLang.registerOutput({ name: "countUnknown", type: "number", mode: "required" });

const totalsLang = createHeightsLang();
totalsLang.registerOutput({ name: "avgTotal", type: "number", mode: "required" });
totalsLang.registerOutput({ name: "countTotal", type: "number", mode: "required" });

export const menProgram = assertOk(analyse(menRaw, menLang.descriptor), "men");
export const womenProgram = assertOk(analyse(womenRaw, womenLang.descriptor), "women");
export const unknownProgram = assertOk(analyse(unknownRaw, unknownLang.descriptor), "unknown");
export const totalsProgram = assertOk(analyse(totalsRaw, totalsLang.descriptor), "totals");

// ---------------------------------------------------------------------------
// Dataset
// ---------------------------------------------------------------------------

export type Scenario = { label: string; men: number[]; women: number[]; unknown: number[] };

const menSmall = [172, 178, 181, 169, 183, 175, 188, 171, 177, 180];
const womenSmall = [160, 165, 158, 170, 163, 168, 155, 172, 161, 166];
const unknownSmall = [170, 175, 162, 183, 168, 177, 155, 190, 165, 173];

const menLarge = Array.from({ length: 5_000 }, (_, i) => 165 + (i % 30));
const womenLarge = Array.from({ length: 5_000 }, (_, i) => 152 + (i % 25));
const unknownLarge = Array.from({ length: 2_000 }, (_, i) => 158 + (i % 35));

export const scenarios: Scenario[] = [
  { label: "small dataset", men: menSmall, women: womenSmall, unknown: unknownSmall },
  {
    label: "only men change",
    men: [...menSmall, 192, 187, 174],
    women: womenSmall,
    unknown: unknownSmall,
  },
  {
    label: "only women change",
    men: menSmall,
    women: [...womenSmall, 185, 159, 171],
    unknown: unknownSmall,
  },
  {
    label: "only unknown changes",
    men: menSmall,
    women: womenSmall,
    unknown: [...unknownSmall, 186, 169],
  },
  { label: "all change (large)", men: menLarge, women: womenLarge, unknown: unknownLarge },
  {
    label: "only men change (large)",
    men: [...menLarge, 195, 188],
    women: womenLarge,
    unknown: unknownLarge,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function delta(prev: Scenario | undefined, curr: Scenario): Record<string, unknown> {
  const changes: Record<string, unknown> = {};
  if (!prev || prev.men !== curr.men) changes.men = curr.men;
  if (!prev || prev.women !== curr.women) changes.women = curr.women;
  if (!prev || prev.unknown !== curr.unknown) changes.unknown = curr.unknown;
  return changes;
}

export function changesFrom(prev: Scenario | undefined, curr: Scenario): string {
  if (!prev) return "initial";
  const parts = (["men", "women", "unknown"] as const).filter((k) => prev[k] !== curr[k]);
  return parts.length === 0 ? "unchanged" : `${parts.join("+")} changed`;
}

export function logHeader(s: Scenario, note: string): void {
  const total = s.men.length + s.women.length + s.unknown.length;
  console.log(`\n[${s.label}] ${total} measurements  (${note})`);
}

export function display(outputs: Map<string, unknown>): void {
  const fmt = (k: string) => (outputs.get(k) as number).toFixed(1);
  console.log(
    `  avg:   men=${fmt("avgMen")}  women=${fmt("avgWomen")}  unknown=${fmt("avgUnknown")}  total=${fmt("avgTotal")}`,
  );
  console.log(
    `  >185:  men=${outputs.get("countMen")}  women=${outputs.get("countWomen")}  unknown=${outputs.get("countUnknown")}  total=${outputs.get("countTotal")}`,
  );
}
