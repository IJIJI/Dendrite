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

function runSource(src: string, output = "out") {
  const lang = createStdlib();
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

// A list op never throws: a null, or anything that is not a list arriving through `any`, reads
// as the empty list. `null` fits a list type directly; a `5` or an `"abc"` can only reach a list
// input through an untyped lambda parameter, so that is how they are delivered here.
describe("a list op reads what is not a list as []", () => {
  const viaAny = (body: string, arg: string) =>
    runSource(`let f = x => ${body}\noutput out = f(${arg})`).value;
  const ops: [string, unknown][] = [
    ["Length(x)", 0],
    ["Concat(x, [1])", [1]],
    ["Flatten(x, 1)", []],
    ["Average(x)", 0],
    ["Max(x)", 0],
    ["Min(x)", 0],
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
    it(`${body}: null, 5 and "abc" all give the empty-list answer`, () => {
      expect(viaAny(body, "[]")).toEqual(empty);
      expect(viaAny(body, "null")).toEqual(empty);
      expect(viaAny(body, "5")).toEqual(empty);
      expect(viaAny(body, '"abc"')).toEqual(empty);
    });
  }

  it("Concat guards each member, not only the whole", () => {
    expect(runSource("output out = Concat(null, [1], null)").value).toEqual([1]);
    expect(viaAny("Concat([0], x)", "5")).toEqual([0]);
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

  it("a struct that lacks the field still throws invalid_field_access", () => {
    expect(() => evalWith(src, [{ id: 9 }])).toThrow(/does not exist/);
    expect(() => evalWith(src, [9])).toThrow(/does not exist/);
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

  it("ToString: null is the empty string, and a list is its JSON", () => {
    expect(value("ToString(null)")).toBe("");
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

  it("ToBool: false for false, 0, the empty string, null and an empty list", () => {
    for (const falsy of ["false", "0", '""', "null", "[]"]) {
      expect(value(`ToBool(${falsy})`), falsy).toBe(false);
    }
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

  it("a null text is the empty string, never a throw", () => {
    expect(value("Upper(null)")).toBe("");
    expect(value("Trim(null)")).toBe("");
    expect(value('Contains(null, "a")')).toBe(false);
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

  it("the null is what IsSet, Default and the list ops already handle", () => {
    expect(castOf("output out = IsSet($rows as number[])", 5)).toBe(false);
    expect(castOf("output out = Default($rows as number[], [0])", 5)).toEqual([0]);
    expect(castOf("output out = Average($rows as number[])", 5)).toBe(0);
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

  it("a wrong runtime shape passes through unchanged, and the op's own guard handles it", () => {
    // `any` holding a number where a LIST was declared: not a list, so nothing to convert leaf
    // by leaf; Join's toList then reads it as empty. The checker did warn about that: a bare
    // any into a shape is still an implicit cast, because the shape is what it cannot see.
    const five = evalWith("output out = Join($raw)", 5);
    expect(five.value).toBe("");
    expect(five.casts.map((w) => w.message)).toEqual(["'$raw' is 'any' typed - 'any[]' expected"]);
    expect(evalWith("output out = Join($raw)", ["a", 1]).value).toBe("a1");
  });
});
