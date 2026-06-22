import { describe, expect, it } from "vitest";
import { z } from "zod";
import { tokenise } from "./lexer";
import { parse as parseProgram, parseExpression } from "./parser";
import { createCoreLanguage } from "../stdlib";
import { createLanguage, type LanguageDescriptor } from "../infra/registry";
import { Type } from "../infra/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CORE = createCoreLanguage().descriptor;

// A descriptor with one declared context input, for input-vs-ref classification.
function withInput(name: string, type = "number"): LanguageDescriptor {
  const lang = createLanguage();
  lang.registerType(type, z.unknown());
  lang.registerInput({ name, type: Type.name(type) });
  return lang.descriptor;
}

function parse(src: string, descriptor: LanguageDescriptor = CORE, operators: string[] = []) {
  const { tokens } = tokenise(src, operators);
  return parseExpression(tokens, descriptor);
}

function program(src: string, descriptor: LanguageDescriptor = CORE, operators: string[] = []) {
  const { tokens } = tokenise(src, operators);
  return parseProgram(tokens, descriptor);
}

// ─── Literals ─────────────────────────────────────────────────────────────────

describe("literal nodes", () => {
  it("number", () => {
    expect(parse("42").node).toEqual({
      kind: "literal",
      value: 42,
      source: { kind: "code", line: 1, column: 1, length: 2 },
    });
  });

  it("decimal", () => {
    expect(parse("3.14").node).toMatchObject({ kind: "literal", value: 3.14 });
  });

  it("string carries unquoted text", () => {
    expect(parse('"hello"').node).toMatchObject({ kind: "literal", value: "hello" });
  });

  it("booleans and null", () => {
    expect(parse("true").node).toMatchObject({ kind: "literal", value: true });
    expect(parse("false").node).toMatchObject({ kind: "literal", value: false });
    expect(parse("null").node).toMatchObject({ kind: "literal", value: null });
  });
});

// ─── Identifiers: ref vs input ────────────────────────────────────────────────

describe("identifier & input classification", () => {
  it("a bare identifier is always a ref", () => {
    expect(parse("myVar").node).toMatchObject({ kind: "ref", name: "myVar" });
  });

  it("the $ sigil produces an input node, typed from the descriptor", () => {
    const desc = withInput("sourceBus", "string");
    expect(parse("$sourceBus", desc).node).toMatchObject({
      kind: "input",
      name: "sourceBus",
      type: Type.name("string"),
    });
  });

  it("a bare name stays a ref even when an input shares the name (no shadowing)", () => {
    const desc = withInput("sourceBus");
    expect(parse("sourceBus", desc).node).toMatchObject({ kind: "ref", name: "sourceBus" });
  });

  it("$ followed by a non-identifier is a recoverable error", () => {
    const { errors } = parse("$ 3");
    expect(errors.length).toBeGreaterThan(0);
  });
});

// ─── Arrays ───────────────────────────────────────────────────────────────────

describe("array literals", () => {
  it("collects items", () => {
    const node = parse("[1, 2, 3]").node;
    expect(node).toMatchObject({
      kind: "array",
      items: [
        { kind: "literal", value: 1 },
        { kind: "literal", value: 2 },
        { kind: "literal", value: 3 },
      ],
    });
  });

  it("empty array", () => {
    expect(parse("[]").node).toMatchObject({ kind: "array", items: [] });
  });

  it("tolerates a trailing comma", () => {
    const { node, errors } = parse("[1, 2,]");
    expect(errors).toEqual([]);
    expect(node).toMatchObject({ kind: "array", items: [{ value: 1 }, { value: 2 }] });
  });

  it("nests", () => {
    expect(parse("[[1], [2]]").node).toMatchObject({
      kind: "array",
      items: [
        { kind: "array", items: [{ value: 1 }] },
        { kind: "array", items: [{ value: 2 }] },
      ],
    });
  });
});

// ─── Field access ─────────────────────────────────────────────────────────────

describe("field access", () => {
  it("single field", () => {
    expect(parse("bus.program").node).toMatchObject({
      kind: "field",
      struct: { kind: "ref", name: "bus" },
      field: "program",
    });
  });

  it("chains left-associatively", () => {
    // a.b.c  ==  (a.b).c
    expect(parse("a.b.c").node).toMatchObject({
      kind: "field",
      field: "c",
      struct: {
        kind: "field",
        field: "b",
        struct: { kind: "ref", name: "a" },
      },
    });
  });
});

// ─── Grouping ─────────────────────────────────────────────────────────────────

describe("grouping", () => {
  it("parentheses return the inner expression unchanged", () => {
    expect(parse("(bus).field").node).toMatchObject({
      kind: "field",
      field: "field",
      struct: { kind: "ref", name: "bus" },
    });
  });
});

// ─── Diagnostics (recover, never throw) ───────────────────────────────────────

describe("diagnostics", () => {
  it("clean expressions report nothing", () => {
    expect(parse("a.b").errors).toEqual([]);
  });

  it("an unexpected leading token is recorded, not thrown", () => {
    const { errors } = parse(")");
    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe("unexpected_token");
  });

  it("a missing closing bracket is reported", () => {
    const { errors } = parse("[1, 2");
    expect(errors.some((e) => e.kind === "unexpected_end")).toBe(true);
  });

  it("trailing tokens after a complete expression are reported", () => {
    const { errors } = parse("a b");
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("trailing");
  });
});

// ─── Operation calls ──────────────────────────────────────────────────────────

describe("operation calls", () => {
  it("a variadic op collects positional args into its array input", () => {
    expect(parse("And(true, false)").node).toMatchObject({
      kind: "operation",
      op: "And",
      inputs: { nodes: [{ value: true }, { value: false }] },
    });
  });

  it("a fixed-arity op maps positional args by declared order", () => {
    expect(parse("GreaterThan(1, 2)").node).toMatchObject({
      kind: "operation",
      op: "GreaterThan",
      inputs: { a: { value: 1 }, b: { value: 2 } },
    });
  });

  it("named arguments bind by name", () => {
    expect(parse("GreaterThan(a: 1, b: 2)").node).toMatchObject({
      inputs: { a: { value: 1 }, b: { value: 2 } },
    });
  });

  it("positional then named mix", () => {
    expect(parse("If(true, then: 1, else: 2)").node).toMatchObject({
      kind: "operation",
      op: "If",
      inputs: { condition: { value: true }, then: { value: 1 }, else: { value: 2 } },
    });
  });

  it("output type is read from the descriptor", () => {
    expect(parse("GreaterThan(1, 2)").node).toMatchObject({ output: Type.boolean });
  });

  it("nested calls", () => {
    expect(parse("Not(And(true, false))").node).toMatchObject({
      op: "Not",
      inputs: { a: { kind: "operation", op: "And" } },
    });
  });

  it("calls bind tighter than field access", () => {
    // Not(true).foo  ==  (Not(true)).foo
    expect(parse("Not(true).foo").node).toMatchObject({
      kind: "field",
      field: "foo",
      struct: { kind: "operation", op: "Not" },
    });
  });

  it("empty arg list", () => {
    expect(parse("And()").node).toMatchObject({ kind: "operation", op: "And", inputs: { nodes: [] } });
  });
});

describe("call diagnostics", () => {
  it("positional after named is an error", () => {
    expect(parse("If(condition: true, 2)").errors.some((e) => e.kind === "syntax_error")).toBe(true);
  });

  it("a call to a non-op name parses as an application (analyser checks callability)", () => {
    // `Bogus` isn't a registered op, so this is a function application; whether Bogus
    // resolves to a callable binding is the analyser's job, not the parser's.
    const { node, errors } = parse("Bogus(1)");
    expect(errors).toEqual([]);
    expect(node).toMatchObject({
      kind: "app",
      callee: { kind: "ref", name: "Bogus" },
      positional: [{ value: 1 }],
    });
  });

  it("too many positional args is an error", () => {
    expect(parse("Not(1, 2)").errors.some((e) => e.kind === "syntax_error")).toBe(true);
  });

  it("calling a non-ref callee parses as an application", () => {
    const { node, errors } = parse("(1)(2)");
    expect(errors).toEqual([]);
    expect(node).toMatchObject({ kind: "app", callee: { value: 1 }, positional: [{ value: 2 }] });
  });

  it("higher-order ops are deferred to slice 3b", () => {
    expect(parse("Filter([1, 2])").errors.some((e) => e.kind === "syntax_error")).toBe(true);
  });
});

// ─── Lambdas ──────────────────────────────────────────────────────────────────

describe("lambdas", () => {
  it("single bare parameter: x => x", () => {
    expect(parse("x => x").node).toMatchObject({
      kind: "lambda",
      params: [{ name: "x" }],
      body: { kind: "ref", name: "x" },
    });
  });

  it("parenthesised params: (x, y) => x", () => {
    expect(parse("(x, y) => x").node).toMatchObject({
      kind: "lambda",
      params: [{ name: "x" }, { name: "y" }],
      body: { kind: "ref", name: "x" },
    });
  });

  it("zero params: () => 1", () => {
    expect(parse("() => 1").node).toMatchObject({ kind: "lambda", params: [], body: { value: 1 } });
  });

  it("typed parameter: (x: number) => x", () => {
    expect(parse("(x: number) => x").node).toMatchObject({
      kind: "lambda",
      params: [{ name: "x", type: Type.number }],
    });
  });

  it("array-typed parameter: (xs: number[]) => xs", () => {
    expect(parse("(xs: number[]) => xs").node).toMatchObject({
      params: [{ name: "xs", type: Type.array(Type.number) }],
    });
  });

  it("function-typed parameter: (f: (number) -> boolean) => f", () => {
    expect(parse("(f: (number) -> boolean) => f").node).toMatchObject({
      params: [{ name: "f", type: Type.fn([Type.number], Type.boolean) }],
    });
  });

  it("the body extends as far right as possible: x => Not(x)", () => {
    expect(parse("x => Not(x)").node).toMatchObject({
      kind: "lambda",
      params: [{ name: "x" }],
      body: { kind: "operation", op: "Not", inputs: { a: { kind: "ref", name: "x" } } },
    });
  });

  it("curries right-associatively: x => y => x", () => {
    expect(parse("x => y => x").node).toMatchObject({
      kind: "lambda",
      params: [{ name: "x" }],
      body: { kind: "lambda", params: [{ name: "y" }], body: { kind: "ref", name: "x" } },
    });
  });

  it("(x) is a grouping, (x) => … is a lambda", () => {
    expect(parse("(x)").node).toMatchObject({ kind: "ref", name: "x" });
    expect(parse("(x) => x").node).toMatchObject({ kind: "lambda", params: [{ name: "x" }] });
  });

  it("a lambda can be an operation argument (comma split is correct)", () => {
    expect(parse("Default(x => x, null)").node).toMatchObject({
      kind: "operation",
      op: "Default",
      inputs: { value: { kind: "lambda", params: [{ name: "x" }] }, fallback: { value: null } },
    });
  });

  it("a non-name parameter (via =>) is a recoverable error", () => {
    expect(parse("1 => 2").errors.some((e) => e.kind === "syntax_error")).toBe(true);
  });
});

// ─── Application ──────────────────────────────────────────────────────────────

describe("application", () => {
  it("applies a binding: f(1, 2)", () => {
    expect(parse("f(1, 2)").node).toMatchObject({
      kind: "app",
      callee: { kind: "ref", name: "f" },
      positional: [{ value: 1 }, { value: 2 }],
    });
  });

  it("named application arguments: f(x: 1)", () => {
    expect(parse("f(x: 1)").node).toMatchObject({
      kind: "app",
      callee: { kind: "ref", name: "f" },
      named: { x: { value: 1 } },
    });
  });

  it("applies a lambda literal immediately: (x => x)(5)", () => {
    expect(parse("(x => x)(5)").node).toMatchObject({
      kind: "app",
      callee: { kind: "lambda", params: [{ name: "x" }] },
      positional: [{ value: 5 }],
    });
  });

  it("chains application: f(1)(2)", () => {
    expect(parse("f(1)(2)").node).toMatchObject({
      kind: "app",
      callee: { kind: "app", callee: { kind: "ref", name: "f" }, positional: [{ value: 1 }] },
      positional: [{ value: 2 }],
    });
  });
});

// ─── Programs (statements) ────────────────────────────────────────────────────

describe("programs", () => {
  it("a let binding lands in bindings", () => {
    const r = program("let x = 3");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([...r.program.bindings.keys()]).toEqual(["x"]);
    expect(r.program.bindings.get("x")).toMatchObject({ kind: "literal", value: 3 });
    expect(r.program.outputs.size).toBe(0);
  });

  it("an output statement lands in outputs", () => {
    const r = program("output result = x");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([...r.program.outputs.keys()]).toEqual(["result"]);
    expect(r.program.outputs.get("result")).toMatchObject({ kind: "ref", name: "x" });
  });

  it("multiple statements across lines", () => {
    const r = program("let a = 1\nlet b = 2\noutput o = b");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect([...r.program.bindings.keys()]).toEqual(["a", "b"]);
    expect([...r.program.outputs.keys()]).toEqual(["o"]);
  });

  it("a binding and an output may share a name (separate namespaces)", () => {
    const r = program("let x = 1\noutput x = x");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.program.bindings.has("x")).toBe(true);
    expect(r.program.outputs.has("x")).toBe(true);
  });

  it("the $ sigil works inside a binding", () => {
    const desc = withInput("bus", "string");
    const r = program("let live = $bus", desc);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.program.bindings.get("live")).toMatchObject({ kind: "input", name: "bus" });
  });

  it("empty source is an empty program", () => {
    const r = program("");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.program.bindings.size).toBe(0);
    expect(r.program.outputs.size).toBe(0);
  });
});

// ─── Program diagnostics & recovery ───────────────────────────────────────────

describe("program diagnostics & recovery", () => {
  it("a duplicate binding is an error, the first is kept", () => {
    const r = program("let x = 1\nlet x = 2");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.some((e) => e.kind === "duplicate_binding")).toBe(true);
  });

  it("a non-statement is reported and parsing resyncs to the next statement", () => {
    const r = program("foo\nlet y = 1");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // Exactly one error (the stray 'foo'); 'let y' parsed cleanly after resync.
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].kind).toBe("syntax_error");
  });

  it("a broken binding value is dropped, the next statement still parses", () => {
    const r = program("let x = )\nlet y = 1");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // Only the ')' error — proves 'let y' was reached after resync (no cascade).
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].kind).toBe("unexpected_token");
  });

  it("resyncs across a poisoned middle statement to reach later ones", () => {
    // 'let b = )' is poisoned; sync must skip it and land on 'let c'.
    const r = program("let a = 1\nlet b = )\nlet c = 3");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // Exactly one error (b's ')') — proves a and c parsed cleanly, no cascade.
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].kind).toBe("unexpected_token");
  });

  it("never throws on garbage", () => {
    expect(() => program("@#^&")).not.toThrow();
  });
});
