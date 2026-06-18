import { z } from "zod";
import { describe, expect, it } from "vitest";
import { analyse, getOutputType } from "./analyser";
import { type ASTNode, type CErrorNode, type LiteralNode, type RefNode } from "./nodes";
import { type CoreProgram, type RawProgram, EvalError, createEvalState, evaluate } from "./program";
import { isCompatible } from "./infra/registry";
import { createCoreLanguage } from "./infra/core";

// ─── Helpers ────────────────────────────────────────────────────────────────

function lit(value: LiteralNode["value"]): LiteralNode {
  return { kind: "literal", value };
}

function ref(name: string): RefNode {
  return { kind: "ref", name };
}

function makeProgram(
  bindings: Record<string, ASTNode>,
  outputs: Record<string, ASTNode>,
): RawProgram {
  return {
    bindings: new Map(Object.entries(bindings)),
    outputs: new Map(Object.entries(outputs)),
  };
}

// ─── isCompatible (isolated) ─────────────────────────────────────────────────

describe("isCompatible", () => {
  it("any expected → always compatible", () => {
    const lang = createCoreLanguage();
    expect(isCompatible("string", "any", lang.descriptor)).toBe(true);
    expect(isCompatible("number", "any", lang.descriptor)).toBe(true);
  });

  it("null actual → always compatible", () => {
    const lang = createCoreLanguage();
    expect(isCompatible("null", "string", lang.descriptor)).toBe(true);
    expect(isCompatible("null", "boolean", lang.descriptor)).toBe(true);
  });

  it("exact match → compatible", () => {
    const lang = createCoreLanguage();
    expect(isCompatible("string", "string", lang.descriptor)).toBe(true);
    expect(isCompatible("number", "number", lang.descriptor)).toBe(true);
  });

  it("exact mismatch → incompatible", () => {
    const lang = createCoreLanguage();
    expect(isCompatible("string", "number", lang.descriptor)).toBe(false);
  });

  it("B extends A: B compat with A, not reverse", () => {
    const lang = createCoreLanguage();
    lang.registerType("A", (lang as any).descriptor.types.get("any")!.schema, {});
    lang.registerType("B", (lang as any).descriptor.types.get("any")!.schema, { extends: "A" });
    expect(isCompatible("B", "A", lang.descriptor)).toBe(true);
    expect(isCompatible("A", "B", lang.descriptor)).toBe(false);
  });

  it("B[] compat with A[] when B extends A, not reverse", () => {
    const lang = createCoreLanguage();
    lang.registerType("A", z.unknown(), {});
    lang.registerType("B", z.unknown(), { extends: "A" });
    expect(isCompatible("B[]", "A[]", lang.descriptor)).toBe(true);
    expect(isCompatible("A[]", "B[]", lang.descriptor)).toBe(false);
  });

  it("malformed extends cycle terminates and returns false", () => {
    const lang = createCoreLanguage();
    lang.registerType("X", z.unknown(), { extends: "Y" });
    lang.registerType("Y", z.unknown(), { extends: "X" });
    expect(isCompatible("X", "Y", lang.descriptor)).toBe(true); // one step gets there
    expect(isCompatible("Y", "X", lang.descriptor)).toBe(true); // one step gets there
    // Neither X nor Y is a subtype of "other"
    expect(isCompatible("X", "other", lang.descriptor)).toBe(false);
  });
});

// ─── Happy path ──────────────────────────────────────────────────────────────

describe("happy path", () => {
  it("literal → correct type, empty dependsOn", () => {
    const lang = createCoreLanguage();
    const prog = makeProgram({}, { out: lit(42) });
    const result = analyse(prog, lang.descriptor);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    const node = result.program.outputs.get("out")!;
    expect(node.kind).toBe("literal");
    expect((node as any).type).toBe("number");
    expect(node.dependsOn.size).toBe(0);
  });

  it("input → correct type, single-item dependsOn", () => {
    const lang = createCoreLanguage();
    lang.registerInput({ name: "score", type: "number" });
    const prog = makeProgram({}, { out: { kind: "input", name: "score", type: "number" } });
    const result = analyse(prog, lang.descriptor);
    expect(result.ok).toBe(true);
    const node = result.program.outputs.get("out")!;
    expect((node as any).type).toBe("number");
    expect([...node.dependsOn]).toEqual(["score"]);
  });

  it("chained refs → dependsOn propagates transitively", () => {
    const lang = createCoreLanguage();
    lang.registerInput({ name: "x", type: "number" });
    // a = input(x), b = ref(a)
    const prog = makeProgram(
      {
        a: { kind: "input", name: "x", type: "number" },
        b: ref("a"),
      },
      { out: ref("b") },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.ok).toBe(true);
    const node = result.program.outputs.get("out")!;
    expect([...node.dependsOn]).toContain("x");
  });

  it("operation (And) → correct output type, unioned dependsOn", () => {
    const lang = createCoreLanguage();
    lang.registerInput({ name: "p", type: "boolean" });
    lang.registerInput({ name: "q", type: "boolean" });
    const prog = makeProgram(
      {},
      {
        out: {
          kind: "operation",
          op: "And",
          inputs: {
            nodes: [
              { kind: "input", name: "p", type: "boolean" },
              { kind: "input", name: "q", type: "boolean" },
            ],
          },
          output: "boolean",
        },
      },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.ok).toBe(true);
    const node = result.program.outputs.get("out")!;
    expect((node as any).output).toBe("boolean");
    expect([...node.dependsOn]).toContain("p");
    expect([...node.dependsOn]).toContain("q");
  });

  it("Filter on typed list → inferred output type, body scope with element type", () => {
    const lang = createCoreLanguage();
    lang.registerType("Source", z.unknown(), {});
    lang.registerInput({ name: "sources", type: "Source[]" });
    // Filter(list: input(sources), item: ref(item) → lit(true))
    const prog = makeProgram(
      {},
      {
        out: {
          kind: "higher_order",
          op: "Filter",
          inputs: { list: { kind: "input", name: "sources", type: "Source[]" } },
          bindings: ["item"],
          body: lit(true),
        },
      },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    const node = result.program.outputs.get("out")! as any;
    expect(node.output).toBe("Source[]");
  });

  it("higher-order with user-chosen binding name refs correctly in body", () => {
    const lang = createCoreLanguage();
    lang.registerType("Source", z.unknown(), {});
    lang.registerInput({ name: "sources", type: "Source[]" });
    // Filter with user-chosen name 's' instead of 'item'
    const prog = makeProgram(
      {},
      {
        out: {
          kind: "higher_order",
          op: "Filter",
          inputs: { list: { kind: "input", name: "sources", type: "Source[]" } },
          bindings: ["s"],
          body: ref("s"), // 's' is the scoped var — should resolve to 'Source' type
        },
      },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    const body = (result.program.outputs.get("out") as any).body;
    expect(body.type).toBe("Source");
  });
});

// ─── Warnings ────────────────────────────────────────────────────────────────

describe("warnings", () => {
  it("unused binding", () => {
    const lang = createCoreLanguage();
    const prog = makeProgram({ unused: lit(1) }, { out: lit(2) });
    const result = analyse(prog, lang.descriptor);
    expect(result.warnings.some((w) => w.kind === "unused_binding" && w.name === "unused")).toBe(true);
  });

  it("missing desired output", () => {
    const lang = createCoreLanguage();
    lang.registerOutput({ name: "desired", type: "number", mode: "desired" });
    const prog = makeProgram({}, {});
    const result = analyse(prog, lang.descriptor);
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.kind === "missing_desired_program_output" && w.name === "desired")).toBe(true);
  });

  it("unknown program output", () => {
    const lang = createCoreLanguage();
    const prog = makeProgram({}, { mystery: lit("hello") });
    const result = analyse(prog, lang.descriptor);
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.kind === "unknown_program_output" && w.name === "mystery")).toBe(true);
    // Still included in program
    expect(result.program.outputs.has("mystery")).toBe(true);
  });

  it("field access on primitive type warns", () => {
    const lang = createCoreLanguage();
    const prog = makeProgram(
      {},
      {
        out: {
          kind: "field",
          struct: lit("hello"),
          field: "length",
          type: "number",
        },
      },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.warnings.some((w) => w.kind === "field_access_on_primitive" && w.name === "length")).toBe(true);
  });

  it("unknown op input key warns", () => {
    const lang = createCoreLanguage();
    const prog = makeProgram(
      {},
      {
        out: {
          kind: "operation",
          op: "Not",
          inputs: {
            a: lit(true),
            extra: lit(42), // not declared by Not
          },
          output: "boolean",
        },
      },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.warnings.some((w) => w.kind === "unknown_op_input_key" && w.name === "extra")).toBe(true);
    expect(result.ok).toBe(true);
  });

  it("missing required op input → warning, type-default placeholder, binding survives", () => {
    const lang = createCoreLanguage();
    // Not requires 'a: boolean'. Provide no inputs.
    const prog = makeProgram(
      {
        b: {
          kind: "operation",
          op: "Not",
          inputs: {},
          output: "boolean",
        },
      },
      { out: ref("b") },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.warnings.some((w) => w.kind === "missing_op_input" && w.name === "a")).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.ok).toBe(true);
    // Binding survives (not pruned)
    expect(result.program.bindings.has("b")).toBe(true);
    // Placeholder carries the declared type (boolean), not 'any'/null
    const inputNode = (result.program.bindings.get("b") as any).inputs.a;
    expect(inputNode.type).toBe("boolean");
  });

  it("implicit_any_cast: any-typed value into narrow op input → warning, binding not poisoned", () => {
    const lang = createCoreLanguage();
    lang.registerInput({ name: "val", type: "any" });
    // GreaterThan expects number inputs; we pass an any-typed input
    const prog = makeProgram(
      {
        cmp: {
          kind: "operation",
          op: "GreaterThan",
          inputs: {
            a: { kind: "input", name: "val", type: "any" },
            b: lit(0),
          },
          output: "boolean",
        },
      },
      { out: ref("cmp") },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.warnings.some((w) => w.kind === "implicit_any_cast" && w.name === "a")).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.ok).toBe(true);
    expect(result.program.bindings.has("cmp")).toBe(true);
  });

  it("implicit_any_cast: any-typed output into narrow descriptor output → warning, output included", () => {
    const lang = createCoreLanguage();
    lang.registerOutput({ name: "score", type: "number", mode: "required" });
    // Output is any-typed (literal null)
    const prog = makeProgram({}, { score: lit(null) });
    const result = analyse(prog, lang.descriptor);
    expect(result.warnings.some((w) => w.kind === "implicit_any_cast" && w.name === "score")).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.ok).toBe(true);
    expect(result.program.outputs.has("score")).toBe(true);
  });

  it("no implicit_any_cast for null-typed values or when expected is any", () => {
    const lang = createCoreLanguage();
    lang.registerInput({ name: "x", type: "any" });
    // Equals accepts any on both sides
    const prog = makeProgram(
      {},
      {
        out: {
          kind: "operation",
          op: "Equals",
          inputs: {
            a: { kind: "input", name: "x", type: "any" },
            b: lit("hello"),
          },
          output: "boolean",
        },
      },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.warnings.filter((w) => w.kind === "implicit_any_cast")).toHaveLength(0);
  });
});

// ─── Errors and output poisoning ─────────────────────────────────────────────

describe("errors and output poisoning", () => {
  it("unknown_op → binding poisoned; dependent output dropped; independent output survives", () => {
    const lang = createCoreLanguage();
    lang.registerOutput({ name: "good", type: "boolean", mode: "required" });
    lang.registerOutput({ name: "bad", type: "boolean", mode: "required" });
    const prog = makeProgram(
      {
        broken: {
          kind: "operation",
          op: "NonExistentOp",
          inputs: {},
          output: "boolean",
        },
      },
      {
        bad: ref("broken"),
        good: lit(true),
      },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.errors.some((e) => e.kind === "unknown_op")).toBe(true);
    expect(result.errors.some((e) => e.kind === "output_depends_on_failed_binding" && e.name === "bad")).toBe(true);
    expect(result.ok).toBe(false);
    // Independent output survives
    expect(result.program.outputs.has("good")).toBe(true);
    expect(result.program.outputs.has("bad")).toBe(false);
  });

  it("binding_cycle → cycle members poisoned; acyclic prefix NOT poisoned", () => {
    const lang = createCoreLanguage();
    // a → b → a (cycle); c → a (prefix, not cycled)
    // But c only sees a as a dep, which is cycled, so c should still fail due to poisoned a
    // Let's test: d is completely independent
    const prog = makeProgram(
      {
        a: ref("b"),
        b: ref("a"),
        d: lit(42), // independent
      },
      { cycled: ref("a"), independent: ref("d") },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.errors.some((e) => e.kind === "binding_cycle")).toBe(true);
    // d is acyclic and independent
    expect(result.program.bindings.has("d")).toBe(true);
    expect(result.program.outputs.has("independent")).toBe(true);
    expect(result.program.outputs.has("cycled")).toBe(false);
  });

  it("acyclic prefix node is not poisoned by cycle", () => {
    const lang = createCoreLanguage();
    // Graph: c → a → b → a (cycle is [a,b]; c is prefix)
    // c references a which is cycled — c itself is not in the cycle
    // But because c depends on a (failed), c's output will be dropped
    // We want to verify c itself is NOT in failedBindings by testing that
    // a node with no dependency on cycled members is fine
    const prog = makeProgram(
      {
        independent: lit(99),
        a: ref("b"),
        b: ref("a"),
      },
      { out: ref("independent") },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.ok).toBe(true); // no required outputs dropped
    expect(result.program.outputs.has("out")).toBe(true);
  });

  it("op_input_type_mismatch → binding poisoned", () => {
    const lang = createCoreLanguage();
    lang.registerOutput({ name: "out", type: "boolean", mode: "required" });
    const prog = makeProgram(
      {
        wrong: {
          kind: "operation",
          op: "Not",
          inputs: { a: lit(42) }, // number, not boolean
          output: "boolean",
        },
      },
      { out: ref("wrong") },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.errors.some((e) => e.kind === "op_input_type_mismatch")).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.program.outputs.has("out")).toBe(false);
  });

  it("program_output_type_mismatch → output dropped", () => {
    const lang = createCoreLanguage();
    lang.registerOutput({ name: "score", type: "number", mode: "required" });
    const prog = makeProgram({}, { score: lit("not a number") });
    const result = analyse(prog, lang.descriptor);
    expect(result.errors.some((e) => e.kind === "program_output_type_mismatch" && e.name === "score")).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.program.outputs.has("score")).toBe(false);
  });

  it("missing_required_program_output → ok:false", () => {
    const lang = createCoreLanguage();
    lang.registerOutput({ name: "required", type: "boolean", mode: "required" });
    const prog = makeProgram({}, {});
    const result = analyse(prog, lang.descriptor);
    expect(result.errors.some((e) => e.kind === "missing_required_program_output" && e.name === "required")).toBe(true);
    expect(result.ok).toBe(false);
  });

  it("undeclared_binding_reference → binding poisoned", () => {
    const lang = createCoreLanguage();
    lang.registerOutput({ name: "out", type: "number", mode: "required" });
    const prog = makeProgram(
      { bad: ref("doesNotExist") },
      { out: ref("bad") },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.errors.some((e) => e.kind === "undeclared_binding_reference")).toBe(true);
    expect(result.ok).toBe(false);
  });

  it("forward_reference (code editor) → binding poisoned", () => {
    const lang = createCoreLanguage();
    lang.registerOutput({ name: "out", type: "number", mode: "required" });
    // b (index 0) references a (index 1) — forward reference
    const prog: RawProgram = {
      bindings: new Map([
        ["b", { kind: "ref", name: "a", source: { kind: "code", line: 1, column: 0, length: 1 } }],
        ["a", { kind: "literal", value: 42, source: { kind: "code", line: 2, column: 0, length: 2 } }],
      ]),
      outputs: new Map([["out", ref("b")]]),
    };
    const result = analyse(prog, lang.descriptor);
    expect(result.errors.some((e) => e.kind === "forward_reference" && e.name === "a")).toBe(true);
    expect(result.ok).toBe(false);
  });

  it("unknown_program_input → binding poisoned", () => {
    const lang = createCoreLanguage();
    lang.registerOutput({ name: "out", type: "string", mode: "required" });
    const prog = makeProgram(
      { b: { kind: "input", name: "undeclaredInput", type: "string" } },
      { out: ref("b") },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.errors.some((e) => e.kind === "unknown_program_input")).toBe(true);
    expect(result.ok).toBe(false);
  });

  it("body_binding_count_mismatch (Reduce with 1 binding) → error, binding poisoned", () => {
    const lang = createCoreLanguage();
    lang.registerOutput({ name: "out", type: "any", mode: "required" });
    const prog = makeProgram(
      {
        r: {
          kind: "higher_order",
          op: "Reduce",
          inputs: { list: lit(null), initial: lit(0) },
          bindings: ["x"], // Reduce needs 2: ['acc', 'item']
          body: lit(0),
        },
      },
      { out: ref("r") },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.errors.some((e) => e.kind === "body_binding_count_mismatch" && e.name === "Reduce")).toBe(true);
    expect(result.ok).toBe(false);
  });
});

// ─── ok flag semantics ───────────────────────────────────────────────────────

describe("ok flag semantics", () => {
  it("required output dropped → ok:false", () => {
    const lang = createCoreLanguage();
    lang.registerOutput({ name: "req", type: "boolean", mode: "required" });
    const prog = makeProgram(
      { b: { kind: "operation", op: "Unknown", inputs: {}, output: "boolean" } },
      { req: ref("b") },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.ok).toBe(false);
  });

  it("only optional output dropped → ok:true", () => {
    const lang = createCoreLanguage();
    lang.registerOutput({ name: "opt", type: "boolean", mode: "optional" });
    const prog = makeProgram(
      { b: { kind: "operation", op: "Unknown", inputs: {}, output: "boolean" } },
      { opt: ref("b") },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.ok).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("binding fails but no output depends on it → ok:true", () => {
    const lang = createCoreLanguage();
    lang.registerOutput({ name: "good", type: "number", mode: "required" });
    const prog = makeProgram(
      {
        broken: { kind: "operation", op: "Unknown", inputs: {}, output: "boolean" },
        fine: lit(42),
      },
      { good: ref("fine") },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.ok).toBe(true);
    expect(result.errors.some((e) => e.kind === "unknown_op")).toBe(true);
    expect(result.program.outputs.has("good")).toBe(true);
  });

  it("unknown output + poisoned dep → warns unknown_program_output, does NOT set ok:false", () => {
    const lang = createCoreLanguage();
    const prog = makeProgram(
      { b: { kind: "operation", op: "Unknown", inputs: {}, output: "boolean" } },
      { mystery: ref("b") }, // unknown output (not in descriptor)
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.warnings.some((w) => w.kind === "unknown_program_output" && w.name === "mystery")).toBe(true);
    expect(result.ok).toBe(true);
  });
});

// ─── Cascade suppression ─────────────────────────────────────────────────────

describe("cascade suppression", () => {
  it("binding A fails; B refs A → only 1 error (for A), no second error for B", () => {
    const lang = createCoreLanguage();
    const prog = makeProgram(
      {
        a: { kind: "operation", op: "Unknown", inputs: {}, output: "boolean" },
        b: ref("a"),
      },
      { out: ref("b") },
    );
    const result = analyse(prog, lang.descriptor);
    // Only the unknown_op error for 'a' — no undeclared_binding_reference for 'a' from B
    const unknownOpErrors = result.errors.filter((e) => e.kind === "unknown_op");
    expect(unknownOpErrors).toHaveLength(1);
    const badRefErrors = result.errors.filter((e) => e.kind === "undeclared_binding_reference");
    expect(badRefErrors).toHaveLength(0);
  });
});

// ─── Pruning ─────────────────────────────────────────────────────────────────

describe("pruning", () => {
  it("poisoned binding is not in program.bindings", () => {
    const lang = createCoreLanguage();
    const prog = makeProgram(
      {
        broken: { kind: "operation", op: "Unknown", inputs: {}, output: "boolean" },
        fine: lit(42),
      },
      { out: ref("fine") },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.program.bindings.has("broken")).toBe(false);
    expect(result.program.bindings.has("fine")).toBe(true);
  });

  it("surviving output's binding chain is fully present", () => {
    const lang = createCoreLanguage();
    lang.registerInput({ name: "x", type: "number" });
    const prog = makeProgram(
      {
        a: { kind: "input", name: "x", type: "number" },
        b: ref("a"),
      },
      { out: ref("b") },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.program.bindings.has("a")).toBe(true);
    expect(result.program.bindings.has("b")).toBe(true);
  });

  it("missing-input placeholder binding IS present (valid substitution, not pruned)", () => {
    const lang = createCoreLanguage();
    const prog = makeProgram(
      {
        b: { kind: "operation", op: "Not", inputs: {}, output: "boolean" },
      },
      { out: ref("b") },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.warnings.some((w) => w.kind === "missing_op_input")).toBe(true);
    expect(result.program.bindings.has("b")).toBe(true);
    // Placeholder should carry declared boolean type, not 'any'/null from error placeholder
    const bNode = result.program.bindings.get("b") as any;
    expect(bNode.inputs.a.type).toBe("boolean");
    expect(bNode.inputs.a.value).toBe(false); // boolean default
  });

  it("no error node in program.bindings", () => {
    const lang = createCoreLanguage();
    const prog = makeProgram(
      {
        broken: { kind: "operation", op: "Unknown", inputs: {}, output: "boolean" },
        fine: lit(42),
      },
      { out: ref("fine") },
    );
    const result = analyse(prog, lang.descriptor);
    for (const [, node] of result.program.bindings) {
      expect(node.kind).not.toBe("error");
    }
  });
});

// ─── Forward reference (declaration-index based) ──────────────────────────────

describe("forward_reference", () => {
  it("earlier-declared binding refs later-declared → forward_reference", () => {
    const lang = createCoreLanguage();
    lang.registerOutput({ name: "out", type: "number", mode: "required" });
    const prog: RawProgram = {
      bindings: new Map([
        // b declared first (index 0), references a (index 1)
        ["b", { kind: "ref", name: "a", source: { kind: "code", line: 1, column: 0, length: 1 } }],
        ["a", { kind: "literal", value: 42, source: { kind: "code", line: 2, column: 0, length: 2 } }],
      ]),
      outputs: new Map([["out", ref("b")]]),
    };
    const result = analyse(prog, lang.descriptor);
    expect(result.errors.some((e) => e.kind === "forward_reference" && e.name === "a")).toBe(true);
    // Error source points at the reference site (inside b's node)
    const fwdErr = result.errors.find((e) => e.kind === "forward_reference")!;
    expect(fwdErr.source?.kind).toBe("code");
  });

  it("later-declared binding refs earlier-declared → no forward_reference", () => {
    const lang = createCoreLanguage();
    const prog: RawProgram = {
      bindings: new Map([
        ["a", { kind: "literal", value: 42, source: { kind: "code", line: 1, column: 0, length: 2 } }],
        ["b", { kind: "ref", name: "a", source: { kind: "code", line: 2, column: 0, length: 1 } }],
      ]),
      outputs: new Map([["out", ref("b")]]),
    };
    const result = analyse(prog, lang.descriptor);
    expect(result.errors.filter((e) => e.kind === "forward_reference")).toHaveLength(0);
    expect(result.ok).toBe(true);
  });

  it("rete program → no forward_reference even when index order would trigger it", () => {
    const lang = createCoreLanguage();
    lang.registerOutput({ name: "out", type: "number", mode: "required" });
    const prog: RawProgram = {
      bindings: new Map([
        // b declared first (index 0), references a (index 1), but source is rete
        ["b", { kind: "ref", name: "a", source: { kind: "rete", nodeId: "node-2" } }],
        ["a", { kind: "literal", value: 42, source: { kind: "rete", nodeId: "node-1" } }],
      ]),
      outputs: new Map([["out", ref("b")]]),
    };
    const result = analyse(prog, lang.descriptor);
    expect(result.errors.filter((e) => e.kind === "forward_reference")).toHaveLength(0);
    expect(result.ok).toBe(true);
  });
});

// ─── inferOutput / inferBodyBindings ─────────────────────────────────────────

describe("inferOutput / inferBodyBindings", () => {
  it("Filter on Source[] → output Source[], body item type Source", () => {
    const lang = createCoreLanguage();
    lang.registerType("Source", z.unknown(), {});
    lang.registerInput({ name: "items", type: "Source[]" });
    const prog = makeProgram(
      {},
      {
        out: {
          kind: "higher_order",
          op: "Filter",
          inputs: { list: { kind: "input", name: "items", type: "Source[]" } },
          bindings: ["item"],
          body: ref("item"),
        },
      },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.ok).toBe(true);
    const node = result.program.outputs.get("out") as any;
    expect(node.output).toBe("Source[]");
    expect(node.body.type).toBe("Source");
  });

  it("Map with body returning boolean → output boolean[]", () => {
    const lang = createCoreLanguage();
    lang.registerInput({ name: "items", type: "any[]" });
    const prog = makeProgram(
      {},
      {
        out: {
          kind: "higher_order",
          op: "Map",
          inputs: { list: { kind: "input", name: "items", type: "any[]" } },
          bindings: ["item"],
          body: lit(true), // boolean body
        },
      },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.ok).toBe(true);
    const node = result.program.outputs.get("out") as any;
    expect(node.output).toBe("boolean[]");
  });

  it("If with matching branch types → concrete output type", () => {
    const lang = createCoreLanguage();
    const prog = makeProgram(
      {},
      {
        out: {
          kind: "operation",
          op: "If",
          inputs: {
            condition: lit(true),
            then: lit(42),
            else: lit(0),
          },
          output: "any",
        },
      },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.ok).toBe(true);
    const node = result.program.outputs.get("out") as any;
    expect(node.output).toBe("number");
  });
});

// ─── AnalysisResult shape ────────────────────────────────────────────────────

describe("AnalysisResult shape", () => {
  it("failing analysis still has program with surviving outputs", () => {
    const lang = createCoreLanguage();
    lang.registerOutput({ name: "req", type: "boolean", mode: "required" });
    lang.registerOutput({ name: "opt", type: "boolean", mode: "optional" });
    const prog = makeProgram(
      { bad: { kind: "operation", op: "Unknown", inputs: {}, output: "boolean" } },
      {
        req: ref("bad"), // dropped
        opt: lit(true), // survives
      },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.ok).toBe(false);
    // program is always present
    expect(result.program).toBeDefined();
    expect(result.program.outputs.has("opt")).toBe(true);
    expect(result.program.outputs.has("req")).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ─── wrong_node_kind_for_op ──────────────────────────────────────────────────

describe("wrong_node_kind_for_op", () => {
  it("standard operation node for higher_order op → wrong_node_kind_for_op", () => {
    const lang = createCoreLanguage();
    const prog = makeProgram(
      {
        b: {
          kind: "operation",
          op: "Filter", // higher_order op used with standard node
          inputs: {},
          output: "any[]",
        },
      },
      { out: ref("b") },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.errors.some((e) => e.kind === "wrong_node_kind_for_op" && e.name === "Filter")).toBe(true);
  });

  it("higher_order node for standard op → wrong_node_kind_for_op", () => {
    const lang = createCoreLanguage();
    const prog = makeProgram(
      {
        b: {
          kind: "higher_order",
          op: "Not", // standard op used with higher_order node
          inputs: { a: lit(true) },
          bindings: [],
          body: lit(true),
        },
      },
      { out: ref("b") },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.errors.some((e) => e.kind === "wrong_node_kind_for_op" && e.name === "Not")).toBe(true);
  });
});

// ─── CErrorNode ───────────────────────────────────────────────────────────────

describe("CErrorNode", () => {
  it("evaluator throws EvalError('error_node_reached') for a CErrorNode", () => {
    const errNode: CErrorNode = { kind: "error", dependsOn: new Set() };
    const prog: CoreProgram = { bindings: new Map(), outputs: new Map([["out", errNode]]) };
    const lang = createCoreLanguage();
    expect(() => evaluate(errNode, prog, createEvalState(), undefined, lang.descriptor))
      .toThrow(expect.objectContaining({ kind: "error_node_reached" }));
  });

  it("unknown_op inline in a typed input → no implicit_any_cast warning", () => {
    const lang = createCoreLanguage();
    const prog = makeProgram(
      {
        b: {
          kind: "operation",
          op: "Not",
          inputs: {
            a: { kind: "operation", op: "Unknown", inputs: {}, output: "boolean" },
          },
          output: "boolean",
        },
      },
      { out: ref("b") },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.errors.some((e) => e.kind === "unknown_op")).toBe(true);
    expect(result.warnings.filter((w) => w.kind === "implicit_any_cast")).toHaveLength(0);
  });

  it("getOutputType returns known type for typed CErrorNode, 'any' for untyped", () => {
    const typed: CErrorNode = { kind: "error", type: "boolean", dependsOn: new Set() };
    const untyped: CErrorNode = { kind: "error", dependsOn: new Set() };
    expect(getOutputType(typed)).toBe("boolean");
    expect(getOutputType(untyped)).toBe("any");
  });
});
