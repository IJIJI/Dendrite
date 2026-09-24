import { describe, expect, it } from "vitest";
import { z } from "zod";
import { tokenise } from "./lexer";
import { parse as parseProgram, parseExpression } from "./parser";
import { createStdlib } from "../stdlib";
import { createLanguage, extendLanguage, type Language } from "../language";
import { BP } from "./precedence";
import { type ASTNode } from "../infra/nodes";
import { Type } from "../infra/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CORE = createStdlib();

// The parser no longer reads declarations: `$name` is an input because of the sigil, not
// because anything declared it. This just supplies a language whose type exists.
function withInput(_name: string, type = "number"): Language {
  const lang = createLanguage();
  lang.registerType(type, z.unknown());
  return lang;
}

function parse(src: string, lang: Language = CORE) {
  const { tokens } = tokenise(src, [...lang.grammar.operatorTokens]);
  return parseExpression(tokens, lang.descriptor, lang.grammar);
}

function program(src: string, lang: Language = CORE) {
  const { tokens } = tokenise(src, [...lang.grammar.operatorTokens]);
  return parseProgram(tokens, lang.descriptor, lang.grammar);
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

  it("the $ sigil produces an input node, left open for the analyser to type", () => {
    const desc = withInput("sourceBus", "string");
    expect(parse("$sourceBus", desc).node).toMatchObject({
      kind: "input",
      name: "sourceBus", // the analyser overwrites this from the composed descriptor
    });
  });

  it("an input's span covers the whole `$name`, so its diagnostics underline all of it", () => {
    const desc = withInput("quantity", "number");
    expect(parse("  $quantity", desc).node).toMatchObject({
      kind: "input",
      source: { kind: "code", line: 1, column: 3, length: 9 },
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
    expect(parse("And()").node).toMatchObject({
      kind: "operation",
      op: "And",
      inputs: { nodes: [] },
    });
  });
});

describe("call diagnostics", () => {
  it("positional after named is an error", () => {
    expect(parse("If(condition: true, 2)").errors.some((e) => e.kind === "syntax_error")).toBe(
      true,
    );
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

  it("a higher-order op is an ordinary op call with a lambda arg", () => {
    // Filter is now a normal op (function-typed `predicate` input).
    const { node, errors } = parse("Filter([1, 2], item => item)");
    expect(errors).toEqual([]);
    expect(node).toMatchObject({
      kind: "operation",
      op: "Filter",
      inputs: {
        list: { kind: "array", items: [{ value: 1 }, { value: 2 }] },
        predicate: { kind: "lambda", params: [{ name: "item" }] },
      },
    });
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

// ─── Operators ────────────────────────────────────────────────────────────────

describe("operators", () => {
  it("infix desugars to its op: a < b → LessThan(a, b)", () => {
    expect(parse("a < b").node).toMatchObject({
      kind: "operation",
      op: "LessThan",
      inputs: { a: { kind: "ref", name: "a" }, b: { kind: "ref", name: "b" } },
    });
  });

  it("precedence: 1 + 2 * 3 → Add(1, Multiply(2, 3))", () => {
    expect(parse("1 + 2 * 3").node).toMatchObject({
      kind: "operation",
      op: "Add",
      inputs: {
        nodes: [
          { value: 1 },
          { kind: "operation", op: "Multiply", inputs: { nodes: [{ value: 2 }, { value: 3 }] } },
        ],
      },
    });
  });

  it("left-associative: 1 - 2 - 3 → Subtract(Subtract(1, 2), 3)", () => {
    expect(parse("1 - 2 - 3").node).toMatchObject({
      kind: "operation",
      op: "Subtract",
      inputs: {
        a: { kind: "operation", op: "Subtract", inputs: { a: { value: 1 }, b: { value: 2 } } },
        b: { value: 3 },
      },
    });
  });

  it(">= desugars to Not(LessThan(...)) — no dedicated op", () => {
    expect(parse("a >= b").node).toMatchObject({
      kind: "operation",
      op: "Not",
      inputs: {
        a: {
          kind: "operation",
          op: "LessThan",
          inputs: { a: { kind: "ref", name: "a" }, b: { kind: "ref", name: "b" } },
        },
      },
    });
  });

  it("prefix !: !a → Not(a), binding tighter than infix (!a && b)", () => {
    expect(parse("!a").node).toMatchObject({
      kind: "operation",
      op: "Not",
      inputs: { a: { kind: "ref", name: "a" } },
    });
    expect(parse("!a && b").node).toMatchObject({
      kind: "operation",
      op: "And",
      inputs: {
        nodes: [
          { kind: "operation", op: "Not", inputs: { a: { kind: "ref", name: "a" } } },
          { kind: "ref", name: "b" },
        ],
      },
    });
  });

  it("prefix -: -14 → Negate(14), wherever a value can start", () => {
    const negate = (a: object) => ({ kind: "operation", op: "Negate", inputs: { a } });
    expect(parse("-14").node).toMatchObject(negate({ value: 14 }));
    expect(parse("(-14)").node).toMatchObject(negate({ value: 14 }));
    expect(parse("1 == -14").node).toMatchObject({
      op: "Equals",
      inputs: { a: { value: 1 }, b: negate({ value: 14 }) },
    });
  });

  it("- is both symbols: 1 - -14 → Subtract(1, Negate(14))", () => {
    expect(parse("1 - -14").node).toMatchObject({
      kind: "operation",
      op: "Subtract",
      inputs: {
        a: { value: 1 },
        b: { kind: "operation", op: "Negate", inputs: { a: { value: 14 } } },
      },
    });
  });

  it("comparison binds looser than arithmetic: 1 + 2 == 3 → Equals(Add(1, 2), 3)", () => {
    expect(parse("1 + 2 == 3").node).toMatchObject({
      kind: "operation",
      op: "Equals",
      inputs: {
        a: { kind: "operation", op: "Add", inputs: { nodes: [{ value: 1 }, { value: 2 }] } },
        b: { value: 3 },
      },
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

// ─── Binding annotations ──────────────────────────────────────────────────────

describe("binding annotations", () => {
  it("let NAME: TYPE = EXPR keeps the type beside the binding", () => {
    const r = program("let rows: number[] = []\nlet n = 1\noutput o = n");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.program.annotations?.get("rows")).toEqual(Type.array(Type.number));
    expect(r.program.annotations?.has("n")).toBe(false);
  });

  it("a program with no annotation has no annotations key at all", () => {
    const r = program("let n = 1\noutput o = n");
    expect(r.ok && "annotations" in r.program).toBe(false);
  });

  it("an output cannot be annotated: the host declares its type", () => {
    const r = program("output o: number = 1");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.map((e) => e.kind)).toEqual(["syntax_error"]);
    expect(r.errors[0].message).toMatch(/host declares its type/);
  });

  it("a function type annotates a binding too", () => {
    const r = program("let f: (number) -> boolean = n => n > 1\noutput o = f");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.program.annotations?.get("f")).toEqual(Type.fn([Type.number], Type.boolean));
  });
});

// ─── Word-leds ────────────────────────────────────────────────────────────────

describe("word-leds: a led keyed by an identifier's text", () => {
  // `plus` as an infix word for Add, registered on a copy of the stdlib.
  const lang = extendLanguage(createLanguage(), createStdlib());
  lang.registerWordLed("plus", {
    bp: BP.ADD,
    parse: (p, left, token) => ({
      kind: "operation",
      op: "Add",
      inputs: { nodes: [left, p.parseExpr(BP.ADD)] },
      output: Type.any,
      source: token.source,
    }),
  });

  it("continues an expression, at its binding power", () => {
    const r = parse("1 plus 2 * 3", lang);
    expect(r.errors).toEqual([]);
    expect(r.node).toMatchObject({
      kind: "operation",
      op: "Add",
      inputs: {
        nodes: [
          { kind: "literal", value: 1 },
          { kind: "operation", op: "Multiply" },
        ],
      },
    });
  });

  it("is an ordinary name anywhere else, so no other identifier is affected", () => {
    expect(parse("plus", lang).node).toMatchObject({ kind: "ref", name: "plus" });
    const r = program("let plus = 1\noutput o = plus plus 2", lang);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.program.outputs.get("o")).toMatchObject({ kind: "operation", op: "Add" });
  });

  it("survives extendLanguage, like every other grammar entry", () => {
    const extended = extendLanguage(createLanguage(), lang);
    expect(extended.grammar.wordLeds.has("plus")).toBe(true);
  });
});

// ─── The safe cast ────────────────────────────────────────────────────────────

describe("as: the safe cast", () => {
  it("builds a cast node holding the value and the target type", () => {
    expect(parse("$rows as number[]", withInput("rows")).node).toMatchObject({
      kind: "cast",
      value: { kind: "input", name: "rows" },
      type: Type.array(Type.number),
    });
  });

  it("binds tighter than any operator: the cast takes the operand next to it", () => {
    // 1 + ($x as number), not (1 + $x) as number.
    expect(parse("1 + $x as number").node).toMatchObject({
      kind: "operation",
      op: "Add",
      inputs: { nodes: [{ value: 1 }, { kind: "cast", value: { kind: "input", name: "x" } }] },
    });
    // !($on as boolean).
    expect(parse("!$on as boolean").node).toMatchObject({
      op: "Not",
      inputs: { a: { kind: "cast" } },
    });
    // ($price as number) * 2.
    expect(parse("$price as number * 2").node).toMatchObject({
      op: "Multiply",
      inputs: { nodes: [{ kind: "cast" }, { value: 2 }] },
    });
  });

  it("binds looser than a field access and a call", () => {
    expect(parse("$row.value as number", withInput("row")).node).toMatchObject({
      kind: "cast",
      value: { kind: "field", field: "value" },
    });
    expect(parse("f(1) as number").node).toMatchObject({ kind: "cast", value: { kind: "app" } });
  });

  it("takes a function type too, and the analyser is what refuses it", () => {
    expect(parse("f as (number) -> boolean").node).toMatchObject({
      kind: "cast",
      type: Type.fn([Type.number], Type.boolean),
    });
  });

  it("is a plain name everywhere but after an expression", () => {
    const r = program("let as = 1\noutput o = as as number");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.program.outputs.get("o")).toMatchObject({
      kind: "cast",
      value: { kind: "ref", name: "as" },
    });
  });
});

// ─── Registration guards ──────────────────────────────────────────────────────

describe("a handler in the wrong map is refused at registration, not ignored", () => {
  it("a word-led must be an identifier", () => {
    const lang = createLanguage();
    const led = { bp: BP.ADD, parse: (_p: unknown, left: ASTNode) => left };
    expect(() => lang.registerWordLed("+", led)).toThrow(/not an identifier/);
    expect(() => lang.registerWordLed("plus", led)).not.toThrow();
  });

  it("an infix or prefix operator must be a symbol, because a word lexes as an identifier", () => {
    const lang = createLanguage();
    expect(() => lang.registerInfix("as", BP.ADD, (l) => l)).toThrow(/use registerWordLed/);
    expect(() => lang.registerPrefix("not", BP.PREFIX, (o) => o)).toThrow(/use registerWordLed/);
    expect(() => lang.registerInfix("++", BP.ADD, (l) => l)).not.toThrow();
  });
});

// ─── Templates ────────────────────────────────────────────────────────────────

describe("a template is a Join over its parts", () => {
  it("text parts are string literals, holes are expressions, in order", () => {
    expect(parse("`n = {count}, done`").node).toMatchObject({
      kind: "operation",
      op: "Join",
      output: Type.string,
      inputs: {
        parts: {
          kind: "array",
          items: [
            { kind: "literal", value: "n = " },
            { kind: "ref", name: "count" },
            { kind: "literal", value: ", done" },
          ],
        },
      },
    });
  });

  it("a hole holds any expression, and a template", () => {
    expect(parse("`{1 + 2}`").node).toMatchObject({
      inputs: { parts: { items: [{ kind: "operation", op: "Add" }] } },
    });
    expect(parse("`a{`b{c}`}`").node).toMatchObject({
      inputs: {
        parts: {
          items: [
            { value: "a" },
            {
              op: "Join",
              inputs: { parts: { items: [{ value: "b" }, { kind: "ref", name: "c" }] } },
            },
          ],
        },
      },
    });
  });

  it("an empty template is Join over nothing", () => {
    expect(parse("``").node).toMatchObject({ op: "Join", inputs: { parts: { items: [] } } });
  });

  it("an empty hole is a syntax error, and an unterminated template is the lexer's", () => {
    expect(parse("`{}`").errors[0]).toMatchObject({ kind: "unexpected_token" });
    const { tokens, errors } = tokenise("`abc", [...CORE.grammar.operatorTokens]);
    expect(errors.map((e) => e.kind)).toEqual(["unterminated_string"]);
    // What the parser then sees still parses to the end without throwing.
    expect(() => parseExpression(tokens, CORE.descriptor, CORE.grammar)).not.toThrow();
  });
});
