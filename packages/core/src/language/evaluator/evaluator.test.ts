import { describe, expect, it } from "vitest";
import { z } from "zod";
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
import { withPorts } from "../../testing";
import { EMPTY_PORTS } from "../infra/ports";
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
  const descriptor = withPorts(lang, EMPTY_PORTS);
  const program: RawProgram = {
    bindings: new Map(Object.entries(bindings)),
    outputs: new Map([["out", output]]),
  };
  const result = analyse(program, descriptor);
  const node = result.program.outputs.get("out");
  const value = node
    ? evaluate(node, result.program, createEvalState(), undefined, descriptor)
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
    const descriptor = withPorts(lang, {
      inputs: [{ name: "flag", type: Type.boolean }],
      outputs: [],
    });
    const program: RawProgram = {
      bindings: new Map<string, ASTNode>([
        [
          "f",
          lambda(
            [{ name: "x", type: Type.boolean }],
            op("And", { nodes: [ref("x"), { kind: "input", name: "flag" }] }),
          ),
        ],
      ]),
      outputs: new Map<string, ASTNode>([["out", app(ref("f"), [lit(true)])]]),
    };
    const result = analyse(program, descriptor);
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

function runSource(src: string, output = "out", lang = createStdlib()) {
  const descriptor = withPorts(lang, EMPTY_PORTS);
  const parsed = parseSource(src, lang);
  if (!parsed.ok) throw new Error(`parse failed: ${JSON.stringify(parsed.errors)}`);
  const analysed = analyse(parsed.program, descriptor);
  const node = analysed.program.outputs.get(output);
  const value = node
    ? evaluate(node, analysed.program, createEvalState(), undefined, descriptor)
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

  it("Average of numbers (empty → null)", () => {
    expect(runSource("output out = Average([2, 4, 6])").value).toBe(4);
    expect(runSource("output out = Average([])").value).toBeNull();
  });

  it("Max of numbers (empty → null)", () => {
    expect(runSource("output out = Max([3, 20, 8])").value).toBe(20);
    expect(runSource("output out = Max([-3, -20])").value).toBe(-3);
    expect(runSource("output out = Max([])").value).toBeNull();
  });

  it("Min of numbers (empty → null)", () => {
    expect(runSource("output out = Min([3, 20, 8])").value).toBe(3);
    expect(runSource("output out = Min([])").value).toBeNull();
  });

  // A null item is skipped in all three (numbersOf), and so is an item of another kind that
  // reached the list through `any`. Until 0.8.0 the three read a null item as zero.
  it("Average, Max and Min skip a null item", () => {
    expect(runSource("output out = Average([null, 4])").value).toBe(4);
    expect(runSource("output out = Max([null, -4])").value).toBe(-4);
    expect(runSource("output out = Min([null, 4])").value).toBe(4);
    expect(runSource("output out = Average([null])").value).toBeNull();
    expect(runSource("output out = Max([null])").value).toBeNull();
  });

  it("Average, Max and Min skip an item of another kind, by kind", () => {
    expect(runSource('output out = Average([1, "a"])').value).toBe(1);
    expect(runSource('output out = Max([1, "a", true])').value).toBe(1);
  });

  it("Includes membership", () => {
    expect(runSource('output out = Includes(["a", "b", "c"], "b")').value).toBe(true);
    expect(runSource('output out = Includes(["a", "b"], "z")').value).toBe(false);
  });
});

// An op that computes NaN or an infinity has no answer, and the evaluator gives null for it:
// neither is a value a program can hold (they are not JSON, and NaN is not equal to itself).
// The rule is the evaluator's, for every op, so it is shown on the stdlib's own cases and on
// a host op that knows nothing of it.
describe("an op with no answer gives null", () => {
  it("a division by zero", () => {
    expect(runSource("output out = Divide(1, 0)").value).toBeNull();
    expect(runSource("output out = Divide(0, 0)").value).toBeNull();
    expect(runSource("output out = 1 / 0").value).toBeNull();
    expect(runSource("output out = Divide(9, 2)").value).toBe(4.5);
  });

  it("a null operand is no value, on either side", () => {
    expect(runSource("output out = Divide(1, null)").value).toBeNull();
    expect(runSource("output out = Divide(null, 2)").value).toBeNull();
  });

  it("IsSet and Default see it", () => {
    expect(runSource("output out = IsSet(Divide(1, 0))").value).toBe(false);
    expect(runSource("output out = Default(Divide(1, 0), 7)").value).toBe(7);
  });

  // The next op hands no value on, so a missing value reaches the output, and `??` is where
  // a program that cares stops it. Until 0.8.0 the next number op read it as zero.
  it("the next number op hands that null on, and ?? stops it", () => {
    expect(runSource("output out = Divide(1, 0) + 1").value).toBeNull();
    expect(runSource("output out = (Divide(1, 0) ?? 0) + 1").value).toBe(1);
  });

  it("a non-number that reaches a number op through any", () => {
    expect(
      runSource('let double = x => Multiply(x, 2)\noutput out = double("abc")').value,
    ).toBeNull();
  });

  it("holds for a host's op, and only for a number", () => {
    const readings: Record<string, unknown> = {
      nan: NaN,
      up: Infinity,
      down: -Infinity,
      fine: 21.5,
      text: "Infinity",
      list: [Infinity],
    };
    const lang = createStdlib();
    lang.registerOp({
      name: "Reading",
      inputs: [{ name: "which", type: Type.string }],
      output: Type.any,
    });
    lang.registerEvaluator({ op: "Reading", evaluate: ({ which }) => readings[which as string] });
    const reading = (which: string) =>
      runSource(`output out = Reading("${which}")`, "out", lang).value;

    expect(reading("nan")).toBeNull();
    expect(reading("up")).toBeNull();
    expect(reading("down")).toBeNull();
    expect(reading("fine")).toBe(21.5);
    expect(reading("text")).toBe("Infinity");
    // Not looked into: a list an op returns is the op's own business.
    expect(reading("list")).toEqual([Infinity]);
  });
});

// A list whose items differ in type is a list of `any`, and a function never fits `any`. The
// fallback to `any` was the one place a function could ride in a list: Join printed nothing for
// it, and it could leave through an output, where it is not JSON.
describe("a mixed list literal refuses a function", () => {
  const errorsOf = (source: string) => runSource(source).analysed.errors.map((e) => e.kind);

  it("a function beside data", () => {
    expect(errorsOf('output out = ["a", x => x]')).toEqual(["function_in_mixed_list"]);
    expect(errorsOf("output out = [1, x => x, 2]")).toEqual(["function_in_mixed_list"]);
  });

  it("two functions of different types", () => {
    expect(errorsOf("output out = [x => x, (a, b) => a]")).toEqual(["function_in_mixed_list"]);
    expect(errorsOf("output out = [(n: number) => n, (s: string) => s]")).toEqual([
      "function_in_mixed_list",
    ]);
  });

  it("a list of functions beside data, one level down", () => {
    expect(errorsOf('output out = [["a"], [x => x]]')).toEqual(["function_in_mixed_list"]);
    expect(errorsOf("output out = [1, [x => x]]")).toEqual(["function_in_mixed_list"]);
  });

  it("every spelling that builds such a list: Join, a template, ++", () => {
    expect(errorsOf('output out = Join(["a", x => x])')).toEqual(["function_in_mixed_list"]);
    expect(errorsOf("output out = `a{x => x}`")).toEqual(["function_in_mixed_list"]);
    expect(errorsOf('output out = "a" ++ (x => x)')).toEqual(["function_in_mixed_list"]);
  });

  it("names the item and its type", () => {
    const [error] = runSource('output out = ["a", x => x]').analysed.errors;
    expect(error.message).toContain("Item 2");
    expect(error.message).toContain("(any) -> any");
  });

  it("leaves alone a list of one function type, and a mixed list of data", () => {
    expect(errorsOf("output out = [x => x, y => y]")).toEqual([]);
    expect(errorsOf('output out = [1, "a", null, [2]]')).toEqual([]);
  });

  // The same guard in isCompatible: a list that holds a function fits no `any` slot.
  it("a list of functions is no argument for an any input", () => {
    expect(errorsOf("output out = Equals([x => x], 1)")).toEqual(["op_input_type_mismatch"]);
    expect(errorsOf("output out = IsSet([x => x, y => y])")).toEqual(["op_input_type_mismatch"]);
  });
});

// The rules of the math ops that a person could have guessed otherwise: where a half goes,
// which sign a remainder has, what a clamp does with its bounds the wrong way round.
describe("math ops", () => {
  const of = (expression: string) => {
    const { analysed, value } = runSource(`output out = ${expression}`);
    expect(analysed.errors).toEqual([]);
    return value;
  };

  it("Round sends a half away from zero", () => {
    expect(of("Round(2.5)")).toBe(3);
    expect(of("Round(-2.5)")).toBe(-3);
    expect(of("Round(2.4)")).toBe(2);
    expect(of("Round(-2.6)")).toBe(-3);
    expect(of("Round(7)")).toBe(7);
  });

  it("Round takes digits, and the decimal point moves without a float error", () => {
    expect(of("Round(7.3333, 2)")).toBe(7.33);
    expect(of("Round(1.25, 1)")).toBe(1.3);
    // 1.005 * 100 is 100.49999999999999: by multiplying, this would be 1.
    expect(of("Round(1.005, 2)")).toBe(1.01);
    expect(of("Round(-1.005, 2)")).toBe(-1.01);
    expect(of("Round(2.5, 0)")).toBe(3);
  });

  it("Round: negative digits, a fraction of a digit, and more digits than a number has", () => {
    expect(of("Round(1234, -2)")).toBe(1200);
    expect(of("Round(1250, -2)")).toBe(1300);
    // digits is cut to a whole number: 1.9 is 1.
    expect(of("Round(1.45, 1.9)")).toBe(1.5);
    // 0.0000001 prints as 1e-7, with an exponent of its own.
    expect(of("Round(0.0000001, 2)")).toBe(0);
    expect(of("Round(1.5, 400)")).toBe(1.5);
  });

  it("Round's digits may be left out with no warning", () => {
    const { analysed } = runSource("output out = Round(2.5)");
    expect(analysed.warnings.some((w) => w.kind === "missing_op_input")).toBe(false);
  });

  it("Floor, Ceil and Abs", () => {
    expect(of("Floor(7.8)")).toBe(7);
    expect(of("Floor(-7.2)")).toBe(-8);
    expect(of("Ceil(7.2)")).toBe(8);
    expect(of("Ceil(-7.8)")).toBe(-7);
    expect(of("Abs(-14)")).toBe(14);
    expect(of("Abs(14)")).toBe(14);
  });

  it("Clamp holds a value between two bounds, in either order", () => {
    expect(of("Clamp(15, 0, 10)")).toBe(10);
    expect(of("Clamp(-3, 0, 10)")).toBe(0);
    expect(of("Clamp(5, 0, 10)")).toBe(5);
    expect(of("Clamp(15, 10, 0)")).toBe(10);
    expect(of("Clamp(-3, 10, 0)")).toBe(0);
  });

  it("Mod takes the sign of its first number", () => {
    expect(of("Mod(7, 3)")).toBe(1);
    expect(of("Mod(-7, 3)")).toBe(-1);
    expect(of("Mod(7, -3)")).toBe(1);
    expect(of("Mod(-1, 5)")).toBe(-1);
    expect(of("Mod(5.5, 2)")).toBe(1.5);
  });

  it("Pow", () => {
    expect(of("Pow(2, 10)")).toBe(1024);
    expect(of("Pow(9, 0.5)")).toBe(3);
    expect(of("Pow(2, -1)")).toBe(0.5);
  });

  it("no answer is null: a remainder by zero, a root of a negative, an overflow", () => {
    expect(of("Mod(5, 0)")).toBeNull();
    expect(of("Pow(-8, 0.5)")).toBeNull();
    expect(of("Pow(0, -1)")).toBeNull();
    expect(of("Pow(10, 400)")).toBeNull();
  });

  it("a null is no value in each of them", () => {
    for (const expr of [
      "Round(null)",
      "Floor(null)",
      "Ceil(null)",
      "Abs(null)",
      "Clamp(null, 1, 5)",
      "Clamp(3, null, 5)",
      "Mod(null, 5)",
      "Mod(5, null)",
      "Pow(null, 2)",
      "Pow(2, null)",
      "Negate(null)",
      "Add(1, null)",
      "Multiply(2, null)",
      "Subtract(null, 1)",
      "1 / 0 + 1",
    ]) {
      expect(of(expr), expr).toBeNull();
    }
    // An optional input handed a null reads as absent: a whole number, as Round(2.5) gives.
    expect(of("Round(2.5, null)")).toBe(3);
  });

  // A text can reach a number input through `any`. Each op computes NaN from it, and so has
  // no answer. Round once handed the text itself back: it returns its argument when there is
  // nothing to round away, and the text took that way out.
  it("a value that is no number has no answer, in each of them", () => {
    const through = (op: string) => runSource(`let f = x => ${op}\noutput out = f("abc")`).value;
    const ops = [
      "Round(x)",
      "Round(x, 2)",
      "Floor(x)",
      "Ceil(x)",
      "Abs(x)",
      "Clamp(x, 0, 10)",
      "Mod(x, 2)",
      "Pow(x, 2)",
    ];
    for (const op of ops) expect(through(op), op).toBeNull();
  });

  // JSON writes a negative zero as 0, so a program never holds one: the evaluator reads it as
  // the zero it would arrive as. `toBe` tells the two apart, which is the point of each line.
  it("a negative zero is zero", () => {
    expect(of("Round(-0.4)")).toBe(0);
    expect(of("Ceil(-0.5)")).toBe(0);
    expect(of("Mod(-7, 7)")).toBe(0);
    expect(of("Negate(0)")).toBe(0);
  });
});

// A list op never throws: a null, or anything that is not a list arriving through `any`, is
// no value for the op, which gives null and does not run (the evaluator's rule, 0.8.0). `null`
// fits a list type directly; a `5` or an `"abc"` can only reach a list input through an untyped
// lambda parameter, so that is how they are delivered here. Until 0.8.0 each read as [].
describe("a list op handed what is not a list gives no value", () => {
  const viaAny = (body: string, arg: string) =>
    runSource(`let f = x => ${body}\noutput out = f(${arg})`).value;
  const ops: [string, unknown][] = [
    ["Length(x)", 0],
    ["Concat(x, [1])", [1]],
    ["Flatten(x, 1)", []],
    ["Average(x)", null],
    ["Max(x)", null],
    ["Min(x)", null],
    ['Includes(x, "a")', false],
    ["Filter(x, n => true)", []],
    ["Map(x, n => n)", []],
    ["Find(x, n => true)", null],
    ["Every(x, n => false)", true],
    ["Some(x, n => true)", false],
    ["Reduce(x, 0, (acc, n) => acc + 1)", 0],
    ['Join(x, "-")', ""],
  ];

  for (const [body, empty] of ops) {
    it(`${body}: [] gives the empty-list answer; null, 5 and "abc" give null`, () => {
      expect(viaAny(body, "[]")).toEqual(empty);
      expect(viaAny(body, "null")).toBeNull();
      expect(viaAny(body, "5")).toBeNull();
      expect(viaAny(body, '"abc"')).toBeNull();
    });
  }

  it("Concat: a member that is no list is no value for the whole", () => {
    expect(runSource("output out = Concat(null, [1], null)").value).toBeNull();
    expect(viaAny("Concat([0], x)", "5")).toBeNull();
    expect(runSource("output out = Concat([0], [1])").value).toEqual([0, 1]);
  });

  it("a null item stays an item: Length counts it, Map hands it to the lambda", () => {
    expect(runSource("output out = Length([1, null])").value).toBe(2);
    expect(runSource("output out = Map([1, null], x => x + 1)").value).toEqual([2, null]);
    expect(runSource("output out = Includes([1, null], null)").value).toBe(true);
  });

  it("a predicate that gives no value does not hold", () => {
    expect(runSource("output out = Filter([1, null], x => x > 0)").value).toEqual([1]);
    expect(runSource("output out = Every([1, null], x => x > 0)").value).toBe(false);
    expect(runSource("output out = Some([1, null], x => x < 0)").value).toBe(false);
  });
});

// A field of null is null, so a well-typed `Find(...).name` with no match does not throw. A
// struct that is there but lacks the field is still an error: it came from a host and does not
// match its declared type.
describe("a field read on null gives null", () => {
  const evalWith = (src: string, buses: unknown) => {
    const lang = createStdlib();
    const descriptor = withPorts(lang, {
      types: [{ name: "Bus", fields: { id: Type.number, name: Type.string } }],
      inputs: [{ name: "buses", type: Type.array(Type.name("Bus")) }],
      outputs: [],
    });
    const parsed = parseSource(src, lang);
    if (!parsed.ok) throw new Error(`parse failed: ${JSON.stringify(parsed.errors)}`);
    const analysed = analyse(parsed.program, descriptor);
    expect(analysed.errors).toEqual([]);
    const state = createEvalState();
    updateInput("buses", buses, state);
    return evaluate(
      analysed.program.outputs.get("out")!,
      analysed.program,
      state,
      undefined,
      descriptor,
    );
  };
  const src = "output out = Find($buses, b => b.id == 9).name";

  it("a match reads its field", () => {
    expect(evalWith(src, [{ id: 9, name: "nine" }])).toBe("nine");
  });

  it("no match is null, not a throw, and so is a field of that", () => {
    expect(evalWith(src, [{ id: 1, name: "one" }])).toBeNull();
    expect(evalWith("output out = Find($buses, b => b.id == 9).name.length", [])).toBeNull();
  });

  // Until 0.8.0 both threw `invalid_field_access`; a field read never throws now.
  it("a struct that lacks the field, or a value that is no struct, gives null", () => {
    expect(evalWith(src, [{ id: 9 }])).toBeNull();
    expect(evalWith(src, [9])).toBeNull();
    expect(evalWith(src, [[9]])).toBeNull();
    expect(evalWith(src, [{ id: 9, name: undefined }])).toBeNull();
  });
});

describe("conversion ops", () => {
  const value = (src: string) => {
    const { analysed, value } = runSource(`output out = ${src}`);
    expect(analysed.errors).toEqual([]);
    return value;
  };

  it("ToString: text is itself, a number or a boolean is written out", () => {
    expect(value('ToString("kept")')).toBe("kept");
    expect(value("ToString(42)")).toBe("42");
    expect(value("ToString(1.5)")).toBe("1.5");
    expect(value("ToString(true)")).toBe("true");
  });

  it("ToString: no value is no value, and a list is its JSON", () => {
    expect(value("ToString(null)")).toBeNull();
    expect(value("ToString([1, 2])")).toBe("[1,2]");
  });

  it("ToNumber: a number is itself, and a boolean is 1 or 0", () => {
    expect(value("ToNumber(7)")).toBe(7);
    expect(value("ToNumber(true)")).toBe(1);
    expect(value("ToNumber(false)")).toBe(0);
  });

  it("ToNumber: text is read as a plain decimal, trimmed", () => {
    expect(value('ToNumber("42")')).toBe(42);
    expect(value('ToNumber(" 12 ")')).toBe(12);
    expect(value('ToNumber("-1.5")')).toBe(-1.5);
    expect(value('ToNumber("1e3")')).toBe(1000);
  });

  it("ToNumber: anything that is not a number is null, never 0 and never a throw", () => {
    // Each of these is something JavaScript's Number() would turn into a number.
    expect(value('ToNumber("")')).toBeNull();
    expect(value('ToNumber("   ")')).toBeNull();
    expect(value('ToNumber("0x10")')).toBeNull();
    expect(value('ToNumber("Infinity")')).toBeNull();
    expect(value('ToNumber("abc")')).toBeNull();
    expect(value("ToNumber(null)")).toBeNull();
    expect(value("ToNumber([1])")).toBeNull();
  });

  it("ToNumber: Default supplies the fallback, written by the author", () => {
    expect(value('Default(ToNumber("n/a"), 0)')).toBe(0);
    expect(value('Default(ToNumber("9"), 0)')).toBe(9);
  });

  it("ToBool: false for false, 0, the empty string and an empty list", () => {
    for (const falsy of ["false", "0", '""', "[]"]) {
      expect(value(`ToBool(${falsy})`), falsy).toBe(false);
    }
  });

  it("a conversion of no value is no value, in each of the three", () => {
    expect(value("ToString(null)")).toBeNull();
    expect(value("ToNumber(null)")).toBeNull();
    expect(value("ToBool(null)")).toBeNull();
  });

  it('ToBool: true otherwise, the text "false" and a list holding a 0 included', () => {
    for (const truthy of ["true", "1", "-1", '"false"', '"0"', "[0]"]) {
      expect(value(`ToBool(${truthy})`), truthy).toBe(true);
    }
  });

  it("types its result, so a conversion can feed a typed input without a warning", () => {
    const { analysed, value: sum } = runSource('output out = Add(ToNumber("2"), 3)');
    expect(analysed.errors).toEqual([]);
    expect(analysed.warnings.filter((w) => w.kind === "implicit_any_cast")).toEqual([]);
    expect(sum).toBe(5);
  });
});

describe("string ops", () => {
  const value = (src: string) => {
    const { analysed, value } = runSource(`output out = ${src}`);
    expect(analysed.errors).toEqual([]);
    return value;
  };

  it("Join: with a separator, and run together without one", () => {
    expect(value('Join(["Bus", "7"], " ")')).toBe("Bus 7");
    expect(value('Join(["A", "B", "C"])')).toBe("ABC");
    expect(value("Join([])")).toBe("");
  });

  it("Join: the separator is optional, so leaving it out warns about nothing", () => {
    // The first `required: false` op input in the library: both halves are pinned here - the
    // analyser raises no missing_op_input, and the evaluator copes with `undefined`.
    const { analysed, value: joined } = runSource('output out = Join(["a", "b"])');
    expect(analysed.errors).toEqual([]);
    expect(analysed.warnings.filter((w) => w.kind === "missing_op_input")).toEqual([]);
    expect(joined).toBe("ab");
  });

  it("Join: takes the separator by name too", () => {
    expect(value('Join(parts: ["a", "b"], separator: ", ")')).toBe("a, b");
  });

  it("Join: a list of numbers is converted, because Join declares that it converts", () => {
    // Until the `convert` flag (2026-09-24) this was an op_input_type_mismatch, and ToString
    // was the visible fix. Both forms give the same text now.
    expect(value('Join([1, 2], "-")')).toBe("1-2");
    expect(value('Join([ToString(1), ToString(2)], "-")')).toBe("1-2");
  });

  it("Join: a MIXED list types as any[], and each part is written out as ToString would", () => {
    // `["n = ", 1]` shares no item type, so it is `any[]`, which fits `string[]`. The value is
    // pinned here; that it should WARN is the analyser's business, pinned in analyser.test.ts.
    expect(value('Join(["n = ", 1])')).toBe("n = 1");
  });

  it("Join over a Map: where text and lists meet", () => {
    const { analysed, value: joined } = runSource(
      'output out = Join(Map(["cam", "mic"], name => Upper(name)), ", ")',
    );
    expect(analysed.errors).toEqual([]);
    expect(analysed.warnings.filter((w) => w.kind === "implicit_any_cast")).toEqual([]);
    expect(joined).toBe("CAM, MIC");
  });

  it("Upper, Lower and Trim", () => {
    expect(value('Upper("live")')).toBe("LIVE");
    expect(value('Lower("LIVE")')).toBe("live");
    expect(value('Trim("  cam 1  ")')).toBe("cam 1");
  });

  // Until 0.8.0 a null text read as the empty string; it is no value now, and never a throw.
  it("a null text is no value, on either side", () => {
    expect(value("Upper(null)")).toBeNull();
    expect(value("Lower(null)")).toBeNull();
    expect(value("Trim(null)")).toBeNull();
    expect(value('Contains(null, "a")')).toBeNull();
    expect(value('Contains("a", null)')).toBeNull();
    expect(value('StartsWith(null, "a")')).toBeNull();
    expect(value('EndsWith("a", null)')).toBeNull();
  });

  it("Join: a separator handed a null is absent, and a null list is no value", () => {
    expect(value('Join(["a", "b"], null)')).toBe("ab");
    expect(value('Join(null, ",")')).toBeNull();
    expect(value('Join([1, null], ",")')).toBe("1,");
  });

  it("Contains, StartsWith and EndsWith, which are case sensitive", () => {
    expect(value('Contains("CAM 1", "AM")')).toBe(true);
    expect(value('Contains("CAM 1", "am")')).toBe(false);
    expect(value('StartsWith("CAM 1", "CAM")')).toBe(true);
    expect(value('StartsWith("CAM 1", "1")')).toBe(false);
    expect(value('EndsWith("CAM 1", "1")')).toBe(true);
    expect(value('EndsWith("CAM 1", "CAM")')).toBe(false);
  });

  it("an empty part always matches", () => {
    expect(value('Contains("abc", "")')).toBe(true);
    expect(value('StartsWith("abc", "")')).toBe(true);
    expect(value('EndsWith("abc", "")')).toBe(true);
  });
});

// ─── The safe cast ────────────────────────────────────────────────────────────

describe("as: the value when it fits, null when it does not", () => {
  const castOf = (source: string, rows: unknown) => {
    const lang = createStdlib();
    lang.registerType("Grade", { extends: "number", schema: z.number().int().min(0).max(10) });
    const descriptor = withPorts(lang, {
      types: [{ name: "Bus", fields: { id: Type.number, name: Type.string } }],
      inputs: [{ name: "rows", type: Type.any }],
      outputs: [],
    });
    const parsed = parseSource(source, lang);
    if (!parsed.ok) throw new Error(`parse failed: ${JSON.stringify(parsed.errors)}`);
    const analysed = analyse(parsed.program, descriptor);
    expect(analysed.errors).toEqual([]);
    const state = createEvalState();
    updateInput("rows", rows, state);
    return evaluate(
      analysed.program.outputs.get("out")!,
      analysed.program,
      state,
      undefined,
      descriptor,
    );
  };

  it("a list of numbers fits number[], and anything else gives null", () => {
    expect(castOf("output out = $rows as number[]", [1, 2])).toEqual([1, 2]);
    expect(castOf("output out = $rows as number[]", 5)).toBeNull();
    expect(castOf("output out = $rows as number[]", [1, "a"])).toBeNull();
    expect(castOf("output out = $rows as number[]", null)).toBeNull();
  });

  it("a subtype's rules apply: a Grade outside its range gives null", () => {
    expect(castOf("output out = $rows as Grade", 7)).toBe(7);
    expect(castOf("output out = $rows as Grade", 11)).toBeNull();
  });

  it("the null is what IsSet and Default handle, and what a list op hands on", () => {
    expect(castOf("output out = IsSet($rows as number[])", 5)).toBe(false);
    expect(castOf("output out = Default($rows as number[], [0])", 5)).toEqual([0]);
    expect(castOf("output out = Length($rows as number[])", 5)).toBeNull();
    expect(castOf("output out = Length($rows as number[] ?? [])", 5)).toBe(0);
  });

  it("a struct that lacks a field gives null, and a field read on that null is null", () => {
    expect(castOf("output out = ($rows as Bus).name", { id: 1, name: "one" })).toBe("one");
    expect(castOf("output out = ($rows as Bus).name", {})).toBeNull();
  });
});

// ─── The convert flag ─────────────────────────────────────────────────────────

describe("convert: the evaluator converts a flagged input before the op runs", () => {
  const hostLang = () => {
    const lang = createStdlib();
    lang.registerOp({
      name: "Twice",
      inputs: [{ name: "n", type: Type.number, convert: true }],
      output: Type.number,
      description: "n, twice.",
      examples: [],
    });
    lang.registerEvaluator({
      op: "Twice",
      // The op sees a number or a null: never the text it was given.
      evaluate: ({ n }) => (n === null ? null : (n as number) * 2),
    });
    return lang;
  };
  const evalWith = (source: string, raw: unknown) => {
    const lang = hostLang();
    const descriptor = withPorts(lang, {
      inputs: [{ name: "raw", type: Type.any }],
      outputs: [],
    });
    const parsed = parseSource(source, lang);
    if (!parsed.ok) throw new Error(`parse failed: ${JSON.stringify(parsed.errors)}`);
    const analysed = analyse(parsed.program, descriptor);
    expect(analysed.errors).toEqual([]);
    const state = createEvalState();
    updateInput("raw", raw, state);
    const value = evaluate(
      analysed.program.outputs.get("out")!,
      analysed.program,
      state,
      undefined,
      descriptor,
    );
    return { value, casts: analysed.warnings.filter((w) => w.kind === "implicit_any_cast") };
  };

  it("Join converts each leaf: a number, a boolean, a null, a nested list", () => {
    expect(runSource('output out = Join([1, true, null, [2]], ", ")').value).toBe("1, true, , [2]");
  });

  it("a host op with convert on number gets the number, or null when there is no rule", () => {
    // An `any` meeting a converting LEAF has nothing to warn about: every value has a rule.
    expect(evalWith("output out = Twice($raw)", "12")).toEqual({ value: 24, casts: [] });
    expect(evalWith("output out = Twice($raw)", true).value).toBe(2);
    expect(evalWith("output out = Twice($raw)", "abc").value).toBeNull();
  });

  it("a wrong runtime shape is no value: the rule reads the converted value", () => {
    // `any` holding a number where a LIST was declared: not a list, so nothing to convert leaf
    // by leaf, and the evaluator's rule then refuses it as a list that is no list. The checker
    // did warn about that: a bare any into a shape is still an implicit cast, because the
    // shape is what it cannot see.
    const five = evalWith("output out = Join($raw)", 5);
    expect(five.value).toBeNull();
    expect(five.casts.map((w) => w.message)).toEqual(["'$raw' is 'any' typed - 'any[]' expected"]);
    expect(evalWith("output out = Join($raw)", ["a", 1]).value).toBe("a1");
  });
});

// ─── Templates ────────────────────────────────────────────────────────────────

describe("a converting lambda parameter converts its argument where the closure binds it", () => {
  const out = (program: string) => {
    const { analysed, value } = runSource(program);
    expect(analysed.errors).toEqual([]);
    return value;
  };
  const SHOUT = "let shout = (t~: string) => Upper(t)\n";

  it("on a call written in the program, positional or named", () => {
    expect(out(SHOUT + "output out = shout(5)")).toBe("5");
    expect(out(SHOUT + "output out = shout(t: true)")).toBe("TRUE");
  });

  it("on a call an op makes, for a lambda given inline or by name", () => {
    expect(out("output out = Map([1, 2], (n~: string) => Upper(n))")).toEqual(["1", "2"]);
    expect(out(SHOUT + "output out = Map([1, true], shout)")).toEqual(["1", "TRUE"]);
  });

  it("leaf by leaf for a list, by Convert's rules for a number, and only where marked", () => {
    expect(out('let dash = (xs~: string[]) => Join(xs, "-")\noutput out = dash([1, 2])')).toBe(
      "1-2",
    );
    expect(out('let inc = (n~: number) => n + 1\noutput out = [inc("4"), inc(true)]')).toEqual([
      5, 2,
    ]);
    expect(out("let pair = (a~: string, b) => [a, b]\noutput out = pair(1, 2)")).toEqual(["1", 2]);
  });
});

describe("templates: text with holes, through Join", () => {
  const out = (program: string) => {
    const { analysed, value } = runSource(program);
    expect(analysed.errors).toEqual([]);
    // No any-cast warning: Join converts, so a hole of any type is fine by declaration.
    expect(analysed.warnings.filter((w) => w.kind === "implicit_any_cast")).toEqual([]);
    return value;
  };

  it("a hole is converted the way Join converts: number, null, list, boolean", () => {
    expect(out("let count = 5\noutput out = `n = {count}`")).toBe("n = 5");
    expect(out("output out = `a{null}b`")).toBe("ab");
    expect(out("output out = `{[1, 2]}`")).toBe("[1,2]");
    expect(out("output out = `{1 > 0}!`")).toBe("true!");
  });

  it("++ joins two values through the same Join, converting each side", () => {
    expect(out('let count = 5\noutput out = "n = " ++ count')).toBe("n = 5");
    expect(out('output out = 1 + 2 ++ " items" ++ null ++ "!"')).toBe("3 items!");
    expect(out('output out = "on: " ++ (1 > 0)')).toBe("on: true");
    expect(out("output out = `{1}` ++ [2, 3]")).toBe("1[2,3]");
  });

  it("a template can hold a template, and can span lines", () => {
    expect(out("output out = `x{`y{1}`}z`")).toBe("xy1z");
    expect(out("output out = `one\ntwo {2}`")).toBe("one\ntwo 2");
  });

  it("the result is a string to the checker, so it flows into a string input", () => {
    expect(out("output out = Upper(`a{1}`)")).toBe("A1");
  });

  it("ceiling: a lambda in a hole is a type error that names Join, which was not written", () => {
    const { analysed } = runSource("output out = `{n => n}`");
    expect(analysed.errors.map((e) => e.kind)).toEqual(["op_input_type_mismatch"]);
    expect(analysed.errors[0].message).toContain("'Join'");
  });
});

// ─── Lazy inputs ──────────────────────────────────────────────────────────────

// The rule of "no value" (0.8.0, option B) is the evaluator's, in `receive`: an input that
// names a type and is handed a null, or a value of another KIND, is no value, and the op does
// not run. Shown on the stdlib's own cases and on host ops that know nothing of it.
describe("the rule of no value: the evaluator decides, before any op", () => {
  const of = (src: string) => runSource(`output out = ${src}`).value;

  it("a comparison with no value is no value; == and != read it", () => {
    for (const expr of ["null > -1", "null < 1", "null >= 0", "null <= 0"]) {
      expect(of(expr), expr).toBeNull();
    }
    expect(of("null == 0")).toBe(false);
    expect(of("null == null")).toBe(true);
    expect(of("null != 0")).toBe(true);
  });

  it("Not and Xor with no value are no value", () => {
    expect(of("Not(null)")).toBeNull();
    expect(of("!null")).toBeNull();
    expect(of("Xor(null, true)")).toBeNull();
  });

  it("a value of the wrong kind through any is no value too", () => {
    const via = (body: string, arg: string) =>
      runSource(`let f = x => ${body}\noutput out = f(${arg})`).value;
    expect(via("Upper(x)", "5")).toBeNull();
    expect(via("x + 1", '"abc"')).toBeNull();
    expect(via("x > 1", '"abc"')).toBeNull();
    expect(via("If(x, 1, 2)", '"no"')).toBeNull();
    expect(via("Length(x)", "5")).toBeNull();
    expect(via("Upper(x)", '"ok"')).toBe("OK");
  });

  it("a field read on a value with no such field, or on a list, is null", () => {
    const via = (arg: string) => runSource(`let f = x => x.name\noutput out = f(${arg})`).value;
    expect(via("5")).toBeNull();
    expect(via("[1, 2]")).toBeNull();
    expect(via("null")).toBeNull();
    expect(runSource("let f = x => x.length\noutput out = f([1, 2])").value).toBeNull();
  });

  // A host op per kind of declared type, each handed a null and a value of another kind: the
  // host's evaluator is reached only with what it declared, and a thrown error would show.
  const hostLang = () => {
    const lang = createStdlib();
    lang.registerType("Grade", { extends: "number" });
    lang.registerType("Pair", { fields: { n: Type.number } });
    lang.registerType("Handle", {});
    const typed = (name: string, type: Type, required = true) => {
      lang.registerOp({
        name,
        inputs: [{ name: "v", type, required }],
        output: Type.string,
      });
      lang.registerEvaluator({ op: name, evaluate: ({ v }) => `got ${typeof v}` });
    };
    typed("OnGrade", Type.name("Grade"));
    typed("OnPair", Type.name("Pair"));
    typed("OnHandle", Type.name("Handle"));
    typed("OnList", Type.array(Type.number));
    typed("OnMaybe", Type.number, false);
    lang.registerOp({
      name: "TwiceB",
      inputs: [{ name: "v", type: Type.boolean, convert: true }],
      output: Type.string,
    });
    lang.registerEvaluator({ op: "TwiceB", evaluate: ({ v }) => `got ${String(v)}` });
    lang.registerOp({
      name: "TwiceN",
      inputs: [{ name: "v", type: Type.number, convert: true }],
      output: Type.string,
    });
    lang.registerEvaluator({ op: "TwiceN", evaluate: ({ v }) => `got ${String(v)}` });
    return lang;
  };
  const host = (src: string) => runSource(`output out = ${src}`, "out", hostLang()).value;
  const hostVia = (body: string, arg: string) =>
    runSource(`let f = x => ${body}\noutput out = f(${arg})`, "out", hostLang()).value;

  it("a type that extends a primitive is checked by its root", () => {
    // A number is no Grade to the checker (subtyping is one way), so the cast says it is.
    expect(host("OnGrade(5 as Grade)")).toBe("got number");
    expect(host("OnGrade(null)")).toBeNull();
    expect(hostVia("OnGrade(x)", '"a"')).toBeNull();
  });

  it("a struct type is an object that is no list; an opaque type is not checked", () => {
    expect(hostVia("OnPair(x)", "5")).toBeNull();
    expect(hostVia("OnPair(x)", "[1]")).toBeNull();
    expect(host("OnPair(null)")).toBeNull();
    expect(hostVia("OnHandle(x)", "5")).toBe("got number");
    expect(hostVia("OnHandle(x)", '"a"')).toBe("got string");
    expect(host("OnHandle(null)")).toBeNull();
  });

  it("a list input is a list; a null item inside it is the op's", () => {
    expect(host("OnList([1, null])")).toBe("got object");
    expect(host("OnList(null)")).toBeNull();
    expect(hostVia("OnList(x)", "5")).toBeNull();
  });

  it("an optional input handed a null arrives as undefined, as one left out does", () => {
    expect(host("OnMaybe(null)")).toBe("got undefined");
    expect(host("OnMaybe()")).toBe("got undefined");
    expect(host("OnMaybe(1)")).toBe("got number");
  });

  it("a converting input converts a null with Convert, then the rule reads the result", () => {
    expect(host("TwiceB(null)")).toBe("got false");
    expect(host("TwiceN(null)")).toBeNull();
    expect(host('TwiceN("4")')).toBe("got 4");
  });
});

describe("a lazy input: the op reads it, or it is never evaluated", () => {
  // A host op that throws, which a branch not taken must never reach, and one that counts its
  // runs, which a thunk read twice must run once.
  const hostLang = () => {
    const lang = createStdlib();
    let runs = 0;
    lang.registerOp({ name: "Boom", inputs: [], output: Type.any });
    lang.registerEvaluator({
      op: "Boom",
      evaluate: () => {
        throw new Error("boom");
      },
    });
    lang.registerOp({ name: "Count", inputs: [], output: Type.boolean });
    lang.registerEvaluator({ op: "Count", evaluate: () => ++runs > 0 });
    return { lang, runs: () => runs };
  };
  const out = (source: string, lang = createStdlib()) => runSource(source, "out", lang).value;

  it("If evaluates the branch taken only, as an op and as ? :", () => {
    const { lang } = hostLang();
    expect(out("output out = If(true, 1, Boom())", lang)).toBe(1);
    expect(out("output out = If(false, Boom(), 2)", lang)).toBe(2);
    expect(out("output out = true ? 1 : Boom()", lang)).toBe(1);
    expect(() => out("output out = If(false, 1, Boom())", lang)).toThrow(/boom/);
  });

  // The evaluator's rule gives null for the op before any thunk is read, so a condition that
  // is no value reads no branch: the one case where a null condition must evaluate no side.
  it("If with no condition is no value, and reads neither branch", () => {
    const { lang } = hostLang();
    expect(out("output out = If(null, Boom(), Boom())", lang)).toBeNull();
    expect(out("output out = null ? Boom() : Boom()", lang)).toBeNull();
    // A text where a boolean is declared only gets there through `any`.
    expect(out('let f = x => If(x, Boom(), Boom())\noutput out = f("no")', lang)).toBeNull();
  });

  it("And and Or are three-valued, deciding on either side", () => {
    const { lang } = hostLang();
    const rows: [string, boolean | null][] = [
      ["And(null, true)", null],
      ["And(true, null)", null],
      ["And(false, null)", false],
      ["And(null, false)", false],
      ["Or(null, true)", true],
      ["Or(true, null)", true],
      ["Or(null, false)", null],
      ["Or(false, null)", null],
      ["false && Boom()", false],
      ["true || Boom()", true],
      ["And()", true],
      ["Or()", false],
    ];
    for (const [expr, expected] of rows)
      expect(out(`output out = ${expr}`, lang), expr).toBe(expected);
    expect(() => out("output out = null && Boom()", lang)).toThrow(/boom/);
  });

  it("Default evaluates the fallback only when the value is null, as an op and as ??", () => {
    const { lang } = hostLang();
    expect(out("output out = Default(1, Boom())", lang)).toBe(1);
    expect(out("output out = 1 ?? Boom()", lang)).toBe(1);
    expect(() => out("output out = Default(null, Boom())", lang)).toThrow(/boom/);
  });

  it("And stops at the first false, Or at the first true, as ops and as && ||", () => {
    const { lang, runs } = hostLang();
    expect(out("output out = And(false, Count())", lang)).toBe(false);
    expect(out("output out = Or(true, Count())", lang)).toBe(true);
    expect(runs()).toBe(0);
    expect(out("output out = And(true, Count())", lang)).toBe(true);
    expect(runs()).toBe(1);
    expect(out("output out = false && Boom()", lang)).toBe(false);
    expect(out("output out = true || Boom()", lang)).toBe(true);
  });

  it("a thunk read twice evaluates once", () => {
    const { lang, runs } = hostLang();
    const Twice = lang.registerOp({
      name: "Twice",
      inputs: [{ name: "a", type: Type.boolean, lazy: true }],
      output: Type.boolean,
    });
    lang.registerEvaluator({ op: Twice, evaluate: ({ a }) => a.value === a.value });
    expect(out("output out = Twice(Count())", lang)).toBe(true);
    expect(runs()).toBe(1);
  });

  it("a converting input declared lazy converts inside the thunk", () => {
    const lang = createStdlib();
    const Lazy = lang.registerOp({
      name: "Lazy",
      inputs: [{ name: "n", type: Type.number, convert: true, lazy: true }],
      output: Type.number,
    });
    lang.registerEvaluator({ op: Lazy, evaluate: ({ n }) => n.value });
    expect(out('output out = Lazy("12")', lang)).toBe(12);
  });

  it("a host op that returns a thunk is a host error", () => {
    const lang = createStdlib();
    const Leak = lang.registerOp({
      name: "Leak",
      inputs: [{ name: "a", type: Type.any, lazy: true }],
      output: Type.any,
    });
    lang.registerEvaluator({ op: Leak, evaluate: ({ a }) => a });
    expect(() => out("output out = Leak(1)", lang)).toThrow(/returned a Thunk/);
  });

  it("the cache under a lazy branch: a flipped condition reads the other branch, once each", () => {
    const { lang, runs } = hostLang();
    const descriptor = withPorts(lang, {
      inputs: [{ name: "c", type: Type.boolean }],
      outputs: [],
    });
    const parsed = parseSource("output out = $c ? Count() : false", lang);
    if (!parsed.ok) throw new Error("parse failed");
    const analysed = analyse(parsed.program, descriptor);
    const node = analysed.program.outputs.get("out")!;
    const state = createEvalState();
    const cycle = (c: boolean) => {
      updateInput("c", c, state);
      return evaluate(node, analysed.program, state, new Set(["c"]), descriptor);
    };
    expect(cycle(true)).toBe(true);
    expect(runs()).toBe(1); // the then branch, for the first time
    expect(cycle(false)).toBe(false);
    expect(runs()).toBe(1); // the else branch; the then branch is not touched
    expect(cycle(true)).toBe(true);
    expect(runs()).toBe(1); // the then branch again, from its cache: it depends on no input
  });
});
