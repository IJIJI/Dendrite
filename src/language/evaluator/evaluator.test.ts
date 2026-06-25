import { describe, expect, it } from "vitest";
import {
  type ASTNode,
  type AppNode,
  type LambdaNode,
  type LiteralValue,
  type OperationNode,
  type RefNode,
} from "../infra/nodes";
import { type RawProgram } from "../infra/program";
import { Type } from "../infra/types";
import { analyse } from "../analyser/analyser";
import { parseSource } from "../language";
import { createStdlib } from "../stdlib";
import { createEvalState, evaluate, updateInput } from "./evaluator";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const lit = (value: LiteralValue): ASTNode => ({ kind: "literal", value });
const ref = (name: string): RefNode => ({ kind: "ref", name });
const lambda = (params: LambdaNode["params"], body: ASTNode, returnType?: Type): LambdaNode => ({
  kind: "lambda",
  params,
  body,
  returnType,
});
const app = (
  callee: ASTNode,
  positional: ASTNode[] = [],
  named: Record<string, ASTNode> = {},
): AppNode => ({ kind: "app", callee, positional, named });
const op = (name: string, inputs: OperationNode["inputs"]): OperationNode => ({
  kind: "operation",
  op: name,
  inputs,
  output: Type.any, // raw value - analyser overrides from the op definition
});

// Analyse `{ ...bindings } + out = output`, then evaluate `out`.
function run(bindings: Record<string, ASTNode>, output: ASTNode) {
  const lang = createStdlib();
  const program: RawProgram = {
    bindings: new Map(Object.entries(bindings)),
    outputs: new Map([["out", output]]),
  };
  const result = analyse(program, lang.descriptor);
  const node = result.program.outputs.get("out");
  const value = node
    ? evaluate(node, result.program, createEvalState(), undefined, lang.descriptor)
    : undefined;
  return { result, value };
}

// ─── Application + closures (C2) ─────────────────────────────────────────────

describe("application", () => {
  it("applies a lambda to a positional argument", () => {
    const { result, value } = run(
      { f: lambda([{ name: "x" }], ref("x")) },
      app(ref("f"), [lit(5)]),
    );
    expect(result.errors).toHaveLength(0);
    expect(value).toBe(5);
  });

  it("applies a lambda whose body is an operation", () => {
    const { result, value } = run(
      { f: lambda([{ name: "x", type: Type.boolean }], op("Not", { a: ref("x") })) },
      app(ref("f"), [lit(true)]),
    );
    expect(result.errors).toHaveLength(0);
    expect(value).toBe(false);
  });

  it("a lambda body captures a global binding lexically", () => {
    const { result, value } = run(
      {
        g: lit(true),
        f: lambda([{ name: "x", type: Type.boolean }], op("And", { nodes: [ref("x"), ref("g")] })),
      },
      app(ref("f"), [lit(true)]),
    );
    expect(result.errors).toHaveLength(0);
    expect(value).toBe(true);
  });

  it("resolves named and positional arguments to the right params", () => {
    // sub = (x, y) => Subtract(x, y); call with positional x=10 and named y=3 → 7
    const sub = lambda(
      [
        { name: "x", type: Type.number },
        { name: "y", type: Type.number },
      ],
      op("Subtract", { a: ref("x"), b: ref("y") }),
    );
    const { result, value } = run({ sub }, app(ref("sub"), [lit(10)], { y: lit(3) }));
    expect(result.errors).toHaveLength(0);
    expect(value).toBe(7);
  });

  it("supports currying — a nested closure captures the outer param", () => {
    // add = (a) => (b) => Add(a, b); add(2)(3) = 5
    const add = lambda(
      [{ name: "a", type: Type.number }],
      lambda([{ name: "b", type: Type.number }], op("Add", { nodes: [ref("a"), ref("b")] })),
    );
    const { result, value } = run({ add }, app(app(ref("add"), [lit(2)]), [lit(3)]));
    expect(result.errors).toHaveLength(0);
    expect(value).toBe(5);
  });
});

// ─── Lexical scoping / shadowing at eval time ────────────────────────────────

describe("lexical scoping", () => {
  it("an inner param shadows but does not corrupt the enclosing scope", () => {
    // f1 = (a) => And( ((a) => a)(true), Not(a) )
    // f1(false): inner (a=>a)(true)=true; the outer `a` stays false → Not(false)=true.
    // And(true, true) = true. If the inner call leaked a=true into f1's scope, Not(a)
    // would see true → And(true, false) = false. So `true` proves no leak.
    const inner = app(lambda([{ name: "a", type: Type.boolean }], ref("a")), [lit(true)]);
    const f1 = lambda(
      [{ name: "a", type: Type.boolean }],
      op("And", { nodes: [inner, op("Not", { a: ref("a") })] }),
    );
    const { result, value } = run({ f1 }, app(ref("f1"), [lit(false)]));
    expect(result.errors).toHaveLength(0);
    expect(value).toBe(true);
  });

  it("a global binding referenced inside a body uses the global scope, not the caller's locals", () => {
    // k = 10 (global); g = Add(k, 0); f = (k) => g.
    // f(99): the param k=99 shadows the global k *locally*, but g must still read the
    // GLOBAL k=10. So f(99) = 10, not 99.
    const { result, value } = run(
      {
        k: lit(10),
        g: op("Add", { nodes: [ref("k"), lit(0)] }),
        f: lambda([{ name: "k", type: Type.number }], ref("g")),
      },
      app(ref("f"), [lit(99)]),
    );
    expect(result.errors).toHaveLength(0);
    expect(value).toBe(10);
  });
});

// ─── Incremental dependsOn through application ───────────────────────────────

describe("application dependsOn", () => {
  it("re-evaluates an application when an input its body reads changes", () => {
    const lang = createStdlib();
    lang.registerInput({ name: "flag", type: Type.boolean });
    const program: RawProgram = {
      bindings: new Map<string, ASTNode>([
        [
          "f",
          lambda(
            [{ name: "x", type: Type.boolean }],
            op("And", { nodes: [ref("x"), { kind: "input", name: "flag", type: Type.boolean }] }),
          ),
        ],
      ]),
      outputs: new Map<string, ASTNode>([["out", app(ref("f"), [lit(true)])]]),
    };
    const result = analyse(program, lang.descriptor);
    const node = result.program.outputs.get("out")!;
    const state = createEvalState();

    updateInput("flag", true, state);
    expect(evaluate(node, result.program, state, undefined, lang.descriptor)).toBe(true);

    // flag flips; the app depends on it (ride-along from f's body) → recompute, not cache.
    updateInput("flag", false, state);
    expect(evaluate(node, result.program, state, new Set(["flag"]), lang.descriptor)).toBe(false);
  });
});

// ─── Source → parse → analyse → eval (Phase D integration) ───────────────────

function runSource(src: string, output = "out") {
  const lang = createStdlib();
  const parsed = parseSource(src, lang);
  if (!parsed.ok) throw new Error(`parse failed: ${JSON.stringify(parsed.errors)}`);
  const analysed = analyse(parsed.program, lang.descriptor);
  const node = analysed.program.outputs.get(output);
  const value = node
    ? evaluate(node, analysed.program, createEvalState(), undefined, lang.descriptor)
    : undefined;
  return { analysed, value };
}

describe("source pipeline (lambdas)", () => {
  it("defines and applies a lambda end-to-end", () => {
    const { analysed, value } = runSource("let id = x => x\noutput out = id(5)");
    expect(analysed.errors).toEqual([]);
    expect(value).toBe(5);
  });

  it("curried application end-to-end", () => {
    const { analysed, value } = runSource(
      "let add = (a) => (b) => Add(a, b)\noutput out = add(2)(3)",
    );
    expect(analysed.errors).toEqual([]);
    expect(value).toBe(5);
  });

  it("an immediately-applied lambda literal", () => {
    const { analysed, value } = runSource("output out = (x => Not(x))(true)");
    expect(analysed.errors).toEqual([]);
    expect(value).toBe(false);
  });

  it("a typed param rejects a wrong-typed argument at analysis", () => {
    const { analysed } = runSource('let f = (x: number) => x\noutput out = f("hi")');
    expect(analysed.errors.some((e) => e.kind === "app_argument_type_mismatch")).toBe(true);
  });

  it("Filter with a lambda predicate runs source → eval", () => {
    const { analysed, value } = runSource(
      "let scores = [4, 12, 8, 20]\noutput out = Filter(scores, item => GreaterThan(item, 10))",
    );
    expect(analysed.errors).toEqual([]);
    expect(value).toEqual([12, 20]);
  });

  it("Reduce with a two-param lambda runs source → eval", () => {
    const { analysed, value } = runSource(
      "let xs = [1, 2, 3]\noutput out = Reduce(xs, 0, (acc, item) => Add(acc, item))",
    );
    expect(analysed.errors).toEqual([]);
    expect(value).toBe(6);
  });

  it("arithmetic operators evaluate with correct precedence (2 + 3 * 4 = 14)", () => {
    const { analysed, value } = runSource("output out = 2 + 3 * 4");
    expect(analysed.errors).toEqual([]);
    expect(value).toBe(14);
  });

  it(">= desugars to Not(LessThan) and evaluates (10 >= 5 = true)", () => {
    const { analysed, value } = runSource("output out = 10 >= 5");
    expect(analysed.errors).toEqual([]);
    expect(value).toBe(true);
  });

  it("operators inside a lambda body: Filter(xs, item => item > 10)", () => {
    const { analysed, value } = runSource(
      "let xs = [4, 12, 8, 20]\noutput out = Filter(xs, item => item > 10)",
    );
    expect(analysed.errors).toEqual([]);
    expect(value).toEqual([12, 20]);
  });
});

describe("array ops", () => {
  it("Length of an array", () => {
    const { analysed, value } = runSource("output out = Length([1, 2, 3])");
    expect(analysed.errors).toEqual([]);
    expect(value).toBe(3);
  });

  it("Concat joins arrays one level (variadic)", () => {
    const { analysed, value } = runSource("output out = Concat([1, 2], [3, 4], [5])");
    expect(analysed.errors).toEqual([]);
    expect(value).toEqual([1, 2, 3, 4, 5]);
  });

  it("Concat preserves array elements (only one level)", () => {
    const { analysed, value } = runSource("output out = Concat([[1]], [[2]])");
    expect(analysed.errors).toEqual([]);
    expect(value).toEqual([[1], [2]]);
  });

  it("Flatten by depth", () => {
    const { analysed, value } = runSource("output out = Flatten([[1, 2], [3, 4]], 1)");
    expect(analysed.errors).toEqual([]);
    expect(value).toEqual([1, 2, 3, 4]);
  });

  it("Average of numbers (empty → 0)", () => {
    expect(runSource("output out = Average([2, 4, 6])").value).toBe(4);
    expect(runSource("output out = Average([])").value).toBe(0);
  });

  it("Max of numbers (empty → 0)", () => {
    expect(runSource("output out = Max([3, 20, 8])").value).toBe(20);
    expect(runSource("output out = Max([])").value).toBe(0);
  });

  it("Max of numbers (empty → 0)", () => {
    expect(runSource("output out = Max([3, 20, 8])").value).toBe(20);
    expect(runSource("output out = Max([])").value).toBe(0);
  });

  it("Min of numbers (empty → 0)", () => {
    expect(runSource("output out = Min([3, 20, 8])").value).toBe(3);
    expect(runSource("output out = Min([])").value).toBe(0);
  });

  it("Includes membership", () => {
    expect(runSource('output out = Includes(["a", "b", "c"], "b")').value).toBe(true);
    expect(runSource('output out = Includes(["a", "b"], "z")').value).toBe(false);
  });
});
