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
import { createCoreLanguage } from "../stdlib";
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
  const lang = createCoreLanguage();
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
    const { result, value } = run({ f: lambda([{ name: "x" }], ref("x")) }, app(ref("f"), [lit(5)]));
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
    const lang = createCoreLanguage();
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
