/**
 * Shared definitions for the heights raw_program examples.
 *
 * Demonstrates the analyser: programs are built PROGRAMMATICALLY as RawPrograms
 * (ASTNode trees - the same path a visual-editor adapter takes) and compiled to
 * CorePrograms via analyse() before evaluation. For the source-text path, see
 * examples/3-(code).
 *
 * Inputs:  men, women, unknown — number[] of individual height measurements (cm)
 * Outputs: avgX / countX — average height and count above 185 cm, per category and total
 *
 * Both arrive as PORT LAYERS: the inputs are global (one set of measurements, shared by
 * every program) while each program declares the outputs it owns as its own layer.
 */

import { createEnvironment } from "../../src/language/environment";
import { extendStdlib } from "../../src/language/stdlib";
import { createLanguage } from "../../src/language/language";
import { type PortLayer, Policy } from "../../src/language/infra/ports";
import type { LanguageDescriptor } from "../../src/language/infra/registry";
import { Type } from "../../src/language/infra/types";
import type { ASTNode, LambdaNode, OperationNode } from "../../src/language/infra/nodes";
import type { CoreProgram, RawProgram } from "../../src/language/infra/program";

// ---------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------

// Vocabulary only: types, ops and evaluators. No inputs, no outputs.
export const lang = extendStdlib(createLanguage());
const env = createEnvironment(lang);

// The host's contract: the three measurement lists, global to every program.
export const HOST: PortLayer = {
  id: "host",
  ports: {
    inputs: [
      { name: "men", type: Type.array(Type.number), default: [] },
      { name: "women", type: Type.array(Type.number), default: [] },
      { name: "unknown", type: Type.array(Type.number), default: [] },
    ],
    outputs: [],
  },
  policy: Policy.host,
};

// One layer per program, declaring the outputs that program is responsible for.
const produces = (id: string, ...names: string[]): PortLayer => ({
  id,
  ports: {
    inputs: [],
    outputs: names.map((name) => ({ name, type: Type.number, mode: "required" as const })),
  },
  policy: Policy.host,
});

const FULL = produces(
  "full",
  "avgMen",
  "avgWomen",
  "avgUnknown",
  "avgTotal",
  "countMen",
  "countWomen",
  "countUnknown",
  "countTotal",
);
// The 4-way split: each program owns two outputs and reads one category.
export const MEN = produces("men", "avgMen", "countMen");
export const WOMEN = produces("women", "avgWomen", "countWomen");
export const UNKNOWN = produces("unknown", "avgUnknown", "countUnknown");
export const TOTALS = produces("totals", "avgTotal", "countTotal");

// ---------------------------------------------------------------------------
// AST helpers
// ---------------------------------------------------------------------------
// Higher-order ops are ordinary ops with a function-typed input: the lambda's untyped
// params are contextually typed by the analyser from the resolved list (via the
// evaluator's inferInputTypes), exactly as in source programs.

function inp(name: string): ASTNode {
  return { kind: "input", name };
}
function lit(value: number): ASTNode {
  return { kind: "literal", value };
}
function ref(name: string): ASTNode {
  return { kind: "ref", name };
}
function lambda(params: string[], body: ASTNode): LambdaNode {
  return { kind: "lambda", params: params.map((name) => ({ name })), body };
}
function add(...nodes: ASTNode[]): OperationNode {
  return { kind: "operation", op: "Add", inputs: { nodes }, output: Type.number };
}
function divide(a: ASTNode, b: ASTNode): OperationNode {
  return { kind: "operation", op: "Divide", inputs: { a, b }, output: Type.number };
}
function length(list: ASTNode): OperationNode {
  return { kind: "operation", op: "Length", inputs: { list }, output: Type.number };
}
// Reduce(list, 0, (acc, item) => acc + item)
function sumList(list: ASTNode): OperationNode {
  return {
    kind: "operation",
    op: "Reduce",
    inputs: {
      list,
      initial: lit(0),
      reducer: lambda(["acc", "item"], add(ref("acc"), ref("item"))),
    },
    output: Type.number,
  };
}
// Filter(list, item => item > threshold)
function filterAbove(list: ASTNode, threshold: number): OperationNode {
  return {
    kind: "operation",
    op: "Filter",
    inputs: {
      list,
      predicate: lambda(["item"], {
        kind: "operation",
        op: "GreaterThan",
        inputs: { a: ref("item"), b: lit(threshold) },
        output: Type.boolean,
      }),
    },
    output: Type.array(Type.number),
  };
}

// ---------------------------------------------------------------------------
// Raw programs
// ---------------------------------------------------------------------------

// Full program — all 8 outputs in one program, used by run() and ProgramRunner.
//
// let sumMen     = Reduce($men,     0, (acc, item) => acc + item)
// let sumWomen   = Reduce($women,   0, (acc, item) => acc + item)
// let sumUnknown = Reduce($unknown, 0, (acc, item) => acc + item)
// let avgMen     = sumMen / Length($men)
// let avgWomen   = sumWomen / Length($women)
// let avgUnknown = sumUnknown / Length($unknown)
// let totalSum   = sumMen + sumWomen + sumUnknown
// let totalLen   = Length($men) + Length($women) + Length($unknown)
// let avgTotal   = totalSum / totalLen
// let menAbove     = Filter($men,     item => item > 185)
// let womenAbove   = Filter($women,   item => item > 185)
// let unknownAbove = Filter($unknown, item => item > 185)
// let countMen     = Length(menAbove)
// let countWomen   = Length(womenAbove)
// let countUnknown = Length(unknownAbove)
// let countTotal   = countMen + countWomen + countUnknown

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

// let sumMen   = Reduce($men, 0, (acc, item) => acc + item)
// let avgMen   = sumMen / Length($men)
// let menAbove = Filter($men, item => item > 185)
// let countMen = Length(menAbove)
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

// Compose the host layer with one program's own layer, giving the descriptor that
// program is analysed against.
function environmentFor(layer: PortLayer) {
  const composed = env.forProgram([HOST], [layer]);
  if (!composed.ok) {
    const msgs = composed.problems.map((p) => `  ${p.where}: ${p.message}`).join("\n");
    throw new Error(`Ports of '${layer.id}' do not compose:\n${msgs}`);
  }
  return composed.environment;
}

function analyseWith(raw: RawProgram, layer: PortLayer): CoreProgram {
  const result = environmentFor(layer).analyse(raw);
  if (!result.ok) {
    const msgs = result.errors.map((e) => `  ${e.kind}: ${e.message}`).join("\n");
    throw new Error(`Analysis failed for '${layer.id}':\n${msgs}`);
  }
  return result.program;
}

/** What run() and ProgramRunner evaluate the full program against. */
export const fullDescriptor: LanguageDescriptor = environmentFor(FULL).descriptor;

export const fullProgram = analyseWith(fullRaw, FULL);
export const menProgram = analyseWith(menRaw, MEN);
export const womenProgram = analyseWith(womenRaw, WOMEN);
export const unknownProgram = analyseWith(unknownRaw, UNKNOWN);
export const totalsProgram = analyseWith(totalsRaw, TOTALS);

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
