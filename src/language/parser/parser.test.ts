import { describe, expect, it } from "vitest";
import { z } from "zod";
import { tokenise } from "./lexer";
import { parseExpression } from "./parser";
import { createCoreLanguage } from "../stdlib";
import { createLanguage, type LanguageDescriptor } from "../infra/registry";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CORE = createCoreLanguage().descriptor;

// A descriptor with one declared context input, for input-vs-ref classification.
function withInput(name: string, type = "number"): LanguageDescriptor {
  const lang = createLanguage();
  lang.registerType(type, z.unknown());
  lang.registerInput({ name, type });
  return lang.descriptor;
}

function parse(src: string, descriptor: LanguageDescriptor = CORE, operators: string[] = []) {
  const { tokens } = tokenise(src, operators);
  return parseExpression(tokens, descriptor);
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

describe("identifier classification", () => {
  it("an undeclared identifier is a ref", () => {
    expect(parse("myVar").node).toMatchObject({ kind: "ref", name: "myVar" });
  });

  it("a declared context input is an input node", () => {
    const desc = withInput("sourceBus", "string");
    expect(parse("sourceBus", desc).node).toEqual({
      kind: "input",
      name: "sourceBus",
      type: "string",
      source: { kind: "code", line: 1, column: 1, length: 9 },
    });
  });

  it("non-input identifiers stay refs even when inputs exist", () => {
    const desc = withInput("sourceBus");
    expect(parse("other", desc).node).toMatchObject({ kind: "ref", name: "other" });
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
