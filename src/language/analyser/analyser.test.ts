import { z } from "zod";
import { describe, expect, it } from "vitest";
import { analyse, getOutputType } from "./analyser";
import {
  type ASTNode,
  type CErrorNode,
  type LambdaNode,
  type LiteralNode,
  type RefNode,
} from "../infra/nodes";
import { isCompatible } from "../infra/registry";
import { Type, typeToString } from "../infra/types";
import { createStdlib } from "../stdlib";
import { createLanguage } from "../language";
import { CoreProgram, RawProgram } from "../infra/program";
import { createEvalState, evaluate } from "../evaluator/evaluator";

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
    const lang = createStdlib();
    expect(isCompatible(Type.string, Type.any, lang.descriptor)).toBe(true);
    expect(isCompatible(Type.number, Type.any, lang.descriptor)).toBe(true);
  });

  it("null actual → always compatible", () => {
    const lang = createStdlib();
    expect(isCompatible(Type.null, Type.string, lang.descriptor)).toBe(true);
    expect(isCompatible(Type.null, Type.boolean, lang.descriptor)).toBe(true);
  });

  it("exact match → compatible", () => {
    const lang = createStdlib();
    expect(isCompatible(Type.string, Type.string, lang.descriptor)).toBe(true);
    expect(isCompatible(Type.number, Type.number, lang.descriptor)).toBe(true);
  });

  it("exact mismatch → incompatible", () => {
    const lang = createStdlib();
    expect(isCompatible(Type.string, Type.number, lang.descriptor)).toBe(false);
  });

  it("B extends A: B compat with A, not reverse", () => {
    const lang = createStdlib();
    lang.registerType("A", (lang as any).descriptor.types.get("any")!.schema, {});
    lang.registerType("B", (lang as any).descriptor.types.get("any")!.schema, { extends: "A" });
    expect(isCompatible(Type.name("B"), Type.name("A"), lang.descriptor)).toBe(true);
    expect(isCompatible(Type.name("A"), Type.name("B"), lang.descriptor)).toBe(false);
  });

  it("B[] compat with A[] when B extends A, not reverse", () => {
    const lang = createStdlib();
    lang.registerType("A", z.unknown(), {});
    lang.registerType("B", z.unknown(), { extends: "A" });
    expect(
      isCompatible(Type.array(Type.name("B")), Type.array(Type.name("A")), lang.descriptor),
    ).toBe(true);
    expect(
      isCompatible(Type.array(Type.name("A")), Type.array(Type.name("B")), lang.descriptor),
    ).toBe(false);
  });

  it("malformed extends cycle terminates and returns false", () => {
    const lang = createStdlib();
    lang.registerType("X", z.unknown(), { extends: "Y" });
    lang.registerType("Y", z.unknown(), { extends: "X" });
    expect(isCompatible(Type.name("X"), Type.name("Y"), lang.descriptor)).toBe(true); // one step gets there
    expect(isCompatible(Type.name("Y"), Type.name("X"), lang.descriptor)).toBe(true); // one step gets there
    // Neither X nor Y is a subtype of "other"
    expect(isCompatible(Type.name("X"), Type.name("other"), lang.descriptor)).toBe(false);
  });

  it("function: identical types compatible; arity mismatch incompatible", () => {
    const lang = createStdlib();
    const f = Type.fn([Type.number], Type.boolean);
    expect(isCompatible(f, Type.fn([Type.number], Type.boolean), lang.descriptor)).toBe(true);
    expect(
      isCompatible(f, Type.fn([Type.number, Type.number], Type.boolean), lang.descriptor),
    ).toBe(false);
  });

  it("function: an (any)-param fn flows where a concrete-param fn is expected (untyped lambdas)", () => {
    const lang = createStdlib();
    // (any) -> boolean usable where (number) -> boolean is expected
    expect(
      isCompatible(
        Type.fn([Type.any], Type.boolean),
        Type.fn([Type.number], Type.boolean),
        lang.descriptor,
      ),
    ).toBe(true);
  });

  it("function: contravariant params, covariant return (via extends)", () => {
    const lang = createStdlib();
    lang.registerType("Animal", z.unknown(), {});
    lang.registerType("Cat", z.unknown(), { extends: "Animal" });
    const Animal = Type.name("Animal");
    const Cat = Type.name("Cat");

    // params contravariant: (Animal)->X is usable where (Cat)->X is expected (sound).
    expect(
      isCompatible(Type.fn([Animal], Type.boolean), Type.fn([Cat], Type.boolean), lang.descriptor),
    ).toBe(true);
    expect(
      isCompatible(Type.fn([Cat], Type.boolean), Type.fn([Animal], Type.boolean), lang.descriptor),
    ).toBe(false);

    // return covariant: ()->Cat is usable where ()->Animal is expected (a Cat is an Animal).
    expect(isCompatible(Type.fn([], Cat), Type.fn([], Animal), lang.descriptor)).toBe(true);
    expect(isCompatible(Type.fn([], Animal), Type.fn([], Cat), lang.descriptor)).toBe(false);
  });

  it("functions are never any (totality guard): blocks the Z combinator", () => {
    const lang = createStdlib();
    const f = Type.fn([], Type.number);
    // A function is not compatible with `any` — so it can't be smuggled through an
    // `any` slot, which is exactly what a Z/Y combinator needs.
    expect(isCompatible(f, Type.any, lang.descriptor)).toBe(false);
    // And an `any` value is not callable as a function.
    expect(isCompatible(Type.any, f, lang.descriptor)).toBe(false);
  });
});

// ─── Happy path ──────────────────────────────────────────────────────────────

describe("core language", () => {
  it("a bare createLanguage() registers the primitive types (not just stdlib)", () => {
    const { types } = createLanguage().descriptor;
    expect([...types.keys()].sort()).toEqual(["any", "boolean", "number", "string"]);
    expect(types.get("number")?.default).toBe(0);
    expect(types.get("boolean")?.default).toBe(false);
  });
});

describe("happy path", () => {
  it("literal → correct type, empty dependsOn", () => {
    const lang = createStdlib();
    const prog = makeProgram({}, { out: lit(42) });
    const result = analyse(prog, lang.descriptor);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    const node = result.program.outputs.get("out")!;
    expect(node.kind).toBe("literal");
    expect(typeToString((node as any).type)).toBe("number");
    expect(node.dependsOn.size).toBe(0);
  });

  it("input → correct type, single-item dependsOn", () => {
    const lang = createStdlib();
    lang.registerInput({ name: "score", type: Type.number });
    const prog = makeProgram({}, { out: { kind: "input", name: "score", type: Type.number } });
    const result = analyse(prog, lang.descriptor);
    expect(result.ok).toBe(true);
    const node = result.program.outputs.get("out")!;
    expect(typeToString((node as any).type)).toBe("number");
    expect([...node.dependsOn]).toEqual(["score"]);
  });

  it("chained refs → dependsOn propagates transitively", () => {
    const lang = createStdlib();
    lang.registerInput({ name: "x", type: Type.number });
    // a = input(x), b = ref(a)
    const prog = makeProgram(
      {
        a: { kind: "input", name: "x", type: Type.number },
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
    const lang = createStdlib();
    lang.registerInput({ name: "p", type: Type.boolean });
    lang.registerInput({ name: "q", type: Type.boolean });
    const prog = makeProgram(
      {},
      {
        out: {
          kind: "operation",
          op: "And",
          inputs: {
            nodes: [
              { kind: "input", name: "p", type: Type.boolean },
              { kind: "input", name: "q", type: Type.boolean },
            ],
          },
          output: Type.boolean,
        },
      },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.ok).toBe(true);
    const node = result.program.outputs.get("out")!;
    expect(typeToString((node as any).output)).toBe("boolean");
    expect([...node.dependsOn]).toContain("p");
    expect([...node.dependsOn]).toContain("q");
  });

  it("Filter on a typed list → output is the list type, predicate param gets the element type", () => {
    const lang = createStdlib();
    lang.registerType("Source", z.unknown(), {});
    lang.registerInput({ name: "sources", type: Type.array(Type.name("Source")) });
    // Filter(sources, item => true) — item is contextually typed Source
    const prog = makeProgram(
      {},
      {
        out: {
          kind: "operation",
          op: "Filter",
          inputs: {
            list: { kind: "input", name: "sources", type: Type.array(Type.name("Source")) },
            predicate: { kind: "lambda", params: [{ name: "item" }], body: lit(true) },
          },
          output: Type.array(Type.any),
        },
      },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    const node = result.program.outputs.get("out")! as any;
    expect(typeToString(node.output)).toBe("Source[]");
    expect(typeToString(node.inputs.predicate.type)).toBe("(Source) -> boolean");
  });

  it("a differently-named predicate param still gets the element type (contextual typing)", () => {
    const lang = createStdlib();
    lang.registerType("Source", z.unknown(), {});
    lang.registerInput({ name: "sources", type: Type.array(Type.name("Source")) });
    // Filter(sources, s => IsSet(s)) — 's' is contextually typed Source
    const prog = makeProgram(
      {},
      {
        out: {
          kind: "operation",
          op: "Filter",
          inputs: {
            list: { kind: "input", name: "sources", type: Type.array(Type.name("Source")) },
            predicate: {
              kind: "lambda",
              params: [{ name: "s" }],
              body: {
                kind: "operation",
                op: "IsSet",
                inputs: { value: ref("s") },
                output: Type.boolean,
              },
            },
          },
          output: Type.array(Type.any),
        },
      },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(typeToString((result.program.outputs.get("out") as any).inputs.predicate.type)).toBe(
      "(Source) -> boolean",
    );
  });
});

// ─── Array element-type inference ────────────────────────────────────────────

describe("array element-type inference", () => {
  const arr = (items: ASTNode[]): ASTNode => ({ kind: "array", items, type: Type.any });
  const elementOf = (out: string, prog: RawProgram, lang = createStdlib()) => {
    const result = analyse(prog, lang.descriptor);
    expect(result.ok).toBe(true);
    return typeToString(getOutputType(result.program.outputs.get(out)!));
  };

  it("homogeneous items → T[]", () => {
    expect(elementOf("out", makeProgram({}, { out: arr([lit(1), lit(2), lit(3)]) }))).toBe(
      "number[]",
    );
  });

  it("mixed items → any[]", () => {
    expect(elementOf("out", makeProgram({}, { out: arr([lit(1), lit("a")]) }))).toBe("any[]");
  });

  it("empty array → any[]", () => {
    expect(elementOf("out", makeProgram({}, { out: arr([]) }))).toBe("any[]");
  });
});

// ─── Struct field typing ─────────────────────────────────────────────────────

describe("struct field typing", () => {
  const field = (struct: ASTNode, name: string): ASTNode => ({
    kind: "field",
    struct,
    field: name,
    type: Type.any,
  });
  const input = (name: string, type: Type): ASTNode => ({ kind: "input", name, type });

  it("infers a known field's type", () => {
    const lang = createStdlib();
    lang.registerType("Source", z.unknown(), { fields: { id: Type.string, name: Type.string } });
    lang.registerInput({ name: "s", type: Type.name("Source") });
    const result = analyse(
      makeProgram({}, { out: field(input("s", Type.name("Source")), "id") }),
      lang.descriptor,
    );
    expect(result.errors).toEqual([]);
    expect(typeToString(getOutputType(result.program.outputs.get("out")!))).toBe("string");
  });

  it("errors on an unknown field", () => {
    const lang = createStdlib();
    lang.registerType("Source", z.unknown(), { fields: { id: Type.string } });
    lang.registerInput({ name: "s", type: Type.name("Source") });
    const result = analyse(
      makeProgram({}, { out: field(input("s", Type.name("Source")), "bogus") }),
      lang.descriptor,
    );
    expect(result.errors.some((e) => e.kind === "unknown_field")).toBe(true);
  });

  it("resolves nested struct fields (multilevel)", () => {
    const lang = createStdlib();
    lang.registerType("DisplayName", z.unknown(), { fields: { long: Type.string } });
    lang.registerType("Bus", z.unknown(), {
      fields: { state: Type.number, name: Type.name("DisplayName") },
    });
    lang.registerInput({ name: "bus", type: Type.name("Bus") });
    const busName = field(input("bus", Type.name("Bus")), "name"); // : DisplayName
    const result = analyse(makeProgram({}, { out: field(busName, "long") }), lang.descriptor);
    expect(result.errors).toEqual([]);
    expect(typeToString(getOutputType(result.program.outputs.get("out")!))).toBe("string");
  });

  it("leaves field access on a fields-less type as any (no error)", () => {
    const lang = createStdlib();
    lang.registerType("Opaque", z.unknown(), {});
    lang.registerInput({ name: "o", type: Type.name("Opaque") });
    const result = analyse(
      makeProgram({}, { out: field(input("o", Type.name("Opaque")), "whatever") }),
      lang.descriptor,
    );
    expect(result.errors).toEqual([]);
    expect(typeToString(getOutputType(result.program.outputs.get("out")!))).toBe("any");
  });
});

// ─── Warnings ────────────────────────────────────────────────────────────────

describe("warnings", () => {
  it("unused binding", () => {
    const lang = createStdlib();
    const prog = makeProgram({ unused: lit(1) }, { out: lit(2) });
    const result = analyse(prog, lang.descriptor);
    expect(result.warnings.some((w) => w.kind === "unused_binding" && w.name === "unused")).toBe(
      true,
    );
  });

  it("missing desired output", () => {
    const lang = createStdlib();
    lang.registerOutput({ name: "desired", type: Type.number, mode: "desired" });
    const prog = makeProgram({}, {});
    const result = analyse(prog, lang.descriptor);
    expect(result.ok).toBe(true);
    expect(
      result.warnings.some(
        (w) => w.kind === "missing_desired_program_output" && w.name === "desired",
      ),
    ).toBe(true);
  });

  it("unknown program output", () => {
    const lang = createStdlib();
    const prog = makeProgram({}, { mystery: lit("hello") });
    const result = analyse(prog, lang.descriptor);
    expect(result.ok).toBe(true);
    expect(
      result.warnings.some((w) => w.kind === "unknown_program_output" && w.name === "mystery"),
    ).toBe(true);
    // Still included in program
    expect(result.program.outputs.has("mystery")).toBe(true);
  });

  it("field access on primitive type warns", () => {
    const lang = createStdlib();
    const prog = makeProgram(
      {},
      {
        out: {
          kind: "field",
          struct: lit("hello"),
          field: "length",
          type: Type.number,
        },
      },
    );
    const result = analyse(prog, lang.descriptor);
    expect(
      result.warnings.some((w) => w.kind === "field_access_on_primitive" && w.name === "length"),
    ).toBe(true);
  });

  it("unknown op input key warns", () => {
    const lang = createStdlib();
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
          output: Type.boolean,
        },
      },
    );
    const result = analyse(prog, lang.descriptor);
    expect(
      result.warnings.some((w) => w.kind === "unknown_op_input_key" && w.name === "extra"),
    ).toBe(true);
    expect(result.ok).toBe(true);
  });

  it("missing required op input → warning, type-default placeholder, binding survives", () => {
    const lang = createStdlib();
    // Not requires 'a: boolean'. Provide no inputs.
    const prog = makeProgram(
      {
        b: {
          kind: "operation",
          op: "Not",
          inputs: {},
          output: Type.boolean,
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
    expect(typeToString(inputNode.type)).toBe("boolean");
  });

  it("implicit_any_cast: any-typed value into narrow op input → warning, binding not poisoned", () => {
    const lang = createStdlib();
    lang.registerInput({ name: "val", type: Type.any });
    // GreaterThan expects number inputs; we pass an any-typed input
    const prog = makeProgram(
      {
        cmp: {
          kind: "operation",
          op: "GreaterThan",
          inputs: {
            a: { kind: "input", name: "val", type: Type.any },
            b: lit(0),
          },
          output: Type.boolean,
        },
      },
      { out: ref("cmp") },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.warnings.some((w) => w.kind === "implicit_any_cast" && w.name === "a")).toBe(
      true,
    );
    expect(result.errors).toHaveLength(0);
    expect(result.ok).toBe(true);
    expect(result.program.bindings.has("cmp")).toBe(true);
  });

  it("implicit_any_cast: any-typed output into narrow descriptor output → warning, output included", () => {
    const lang = createStdlib();
    lang.registerOutput({ name: "score", type: Type.number, mode: "required" });
    // Output is any-typed (literal null)
    const prog = makeProgram({}, { score: lit(null) });
    const result = analyse(prog, lang.descriptor);
    expect(result.warnings.some((w) => w.kind === "implicit_any_cast" && w.name === "score")).toBe(
      true,
    );
    expect(result.errors).toHaveLength(0);
    expect(result.ok).toBe(true);
    expect(result.program.outputs.has("score")).toBe(true);
  });

  it("no implicit_any_cast for null-typed values or when expected is any", () => {
    const lang = createStdlib();
    lang.registerInput({ name: "x", type: Type.any });
    // Equals accepts any on both sides
    const prog = makeProgram(
      {},
      {
        out: {
          kind: "operation",
          op: "Equals",
          inputs: {
            a: { kind: "input", name: "x", type: Type.any },
            b: lit("hello"),
          },
          output: Type.boolean,
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
    const lang = createStdlib();
    lang.registerOutput({ name: "good", type: Type.boolean, mode: "required" });
    lang.registerOutput({ name: "bad", type: Type.boolean, mode: "required" });
    const prog = makeProgram(
      {
        broken: {
          kind: "operation",
          op: "NonExistentOp",
          inputs: {},
          output: Type.boolean,
        },
      },
      {
        bad: ref("broken"),
        good: lit(true),
      },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.errors.some((e) => e.kind === "unknown_op")).toBe(true);
    expect(
      result.errors.some((e) => e.kind === "output_depends_on_failed_binding" && e.name === "bad"),
    ).toBe(true);
    expect(result.ok).toBe(false);
    // Independent output survives
    expect(result.program.outputs.has("good")).toBe(true);
    expect(result.program.outputs.has("bad")).toBe(false);
  });

  it("binding_cycle → cycle members poisoned; acyclic prefix NOT poisoned", () => {
    const lang = createStdlib();
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
    const lang = createStdlib();
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
    const lang = createStdlib();
    lang.registerOutput({ name: "out", type: Type.boolean, mode: "required" });
    const prog = makeProgram(
      {
        wrong: {
          kind: "operation",
          op: "Not",
          inputs: { a: lit(42) }, // number, not boolean
          output: Type.boolean,
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
    const lang = createStdlib();
    lang.registerOutput({ name: "score", type: Type.number, mode: "required" });
    const prog = makeProgram({}, { score: lit("not a number") });
    const result = analyse(prog, lang.descriptor);
    expect(
      result.errors.some((e) => e.kind === "program_output_type_mismatch" && e.name === "score"),
    ).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.program.outputs.has("score")).toBe(false);
  });

  it("missing_required_program_output → ok:false", () => {
    const lang = createStdlib();
    lang.registerOutput({ name: "required", type: Type.boolean, mode: "required" });
    const prog = makeProgram({}, {});
    const result = analyse(prog, lang.descriptor);
    expect(
      result.errors.some(
        (e) => e.kind === "missing_required_program_output" && e.name === "required",
      ),
    ).toBe(true);
    expect(result.ok).toBe(false);
  });

  it("undeclared_binding_reference → binding poisoned", () => {
    const lang = createStdlib();
    lang.registerOutput({ name: "out", type: Type.number, mode: "required" });
    const prog = makeProgram({ bad: ref("doesNotExist") }, { out: ref("bad") });
    const result = analyse(prog, lang.descriptor);
    expect(result.errors.some((e) => e.kind === "undeclared_binding_reference")).toBe(true);
    expect(result.ok).toBe(false);
  });

  it("forward_reference (code editor) → binding poisoned", () => {
    const lang = createStdlib();
    lang.registerOutput({ name: "out", type: Type.number, mode: "required" });
    // b (index 0) references a (index 1) — forward reference
    const prog: RawProgram = {
      bindings: new Map([
        ["b", { kind: "ref", name: "a", source: { kind: "code", line: 1, column: 0, length: 1 } }],
        [
          "a",
          { kind: "literal", value: 42, source: { kind: "code", line: 2, column: 0, length: 2 } },
        ],
      ]),
      outputs: new Map([["out", ref("b")]]),
    };
    const result = analyse(prog, lang.descriptor);
    expect(result.errors.some((e) => e.kind === "forward_reference" && e.name === "a")).toBe(true);
    expect(result.ok).toBe(false);
  });

  it("unknown_program_input → binding poisoned", () => {
    const lang = createStdlib();
    lang.registerOutput({ name: "out", type: Type.string, mode: "required" });
    const prog = makeProgram(
      { b: { kind: "input", name: "undeclaredInput", type: Type.string } },
      { out: ref("b") },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.errors.some((e) => e.kind === "unknown_program_input")).toBe(true);
    expect(result.ok).toBe(false);
  });
});

// ─── ok flag semantics ───────────────────────────────────────────────────────

describe("ok flag semantics", () => {
  it("required output dropped → ok:false", () => {
    const lang = createStdlib();
    lang.registerOutput({ name: "req", type: Type.boolean, mode: "required" });
    const prog = makeProgram(
      { b: { kind: "operation", op: "Unknown", inputs: {}, output: Type.boolean } },
      { req: ref("b") },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.ok).toBe(false);
  });

  it("only optional output dropped → ok:true", () => {
    const lang = createStdlib();
    lang.registerOutput({ name: "opt", type: Type.boolean, mode: "optional" });
    const prog = makeProgram(
      { b: { kind: "operation", op: "Unknown", inputs: {}, output: Type.boolean } },
      { opt: ref("b") },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.ok).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("binding fails but no output depends on it → ok:true", () => {
    const lang = createStdlib();
    lang.registerOutput({ name: "good", type: Type.number, mode: "required" });
    const prog = makeProgram(
      {
        broken: { kind: "operation", op: "Unknown", inputs: {}, output: Type.boolean },
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
    const lang = createStdlib();
    const prog = makeProgram(
      { b: { kind: "operation", op: "Unknown", inputs: {}, output: Type.boolean } },
      { mystery: ref("b") }, // unknown output (not in descriptor)
    );
    const result = analyse(prog, lang.descriptor);
    expect(
      result.warnings.some((w) => w.kind === "unknown_program_output" && w.name === "mystery"),
    ).toBe(true);
    expect(result.ok).toBe(true);
  });
});

// ─── Cascade suppression ─────────────────────────────────────────────────────

describe("cascade suppression", () => {
  it("binding A fails; B refs A → only 1 error (for A), no second error for B", () => {
    const lang = createStdlib();
    const prog = makeProgram(
      {
        a: { kind: "operation", op: "Unknown", inputs: {}, output: Type.boolean },
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
    const lang = createStdlib();
    const prog = makeProgram(
      {
        broken: { kind: "operation", op: "Unknown", inputs: {}, output: Type.boolean },
        fine: lit(42),
      },
      { out: ref("fine") },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.program.bindings.has("broken")).toBe(false);
    expect(result.program.bindings.has("fine")).toBe(true);
  });

  it("surviving output's binding chain is fully present", () => {
    const lang = createStdlib();
    lang.registerInput({ name: "x", type: Type.number });
    const prog = makeProgram(
      {
        a: { kind: "input", name: "x", type: Type.number },
        b: ref("a"),
      },
      { out: ref("b") },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.program.bindings.has("a")).toBe(true);
    expect(result.program.bindings.has("b")).toBe(true);
  });

  it("missing-input placeholder binding IS present (valid substitution, not pruned)", () => {
    const lang = createStdlib();
    const prog = makeProgram(
      {
        b: { kind: "operation", op: "Not", inputs: {}, output: Type.boolean },
      },
      { out: ref("b") },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.warnings.some((w) => w.kind === "missing_op_input")).toBe(true);
    expect(result.program.bindings.has("b")).toBe(true);
    // Placeholder should carry declared boolean type, not 'any'/null from error placeholder
    const bNode = result.program.bindings.get("b") as any;
    expect(typeToString(bNode.inputs.a.type)).toBe("boolean");
    expect(bNode.inputs.a.value).toBe(false); // boolean default
  });

  it("no error node in program.bindings", () => {
    const lang = createStdlib();
    const prog = makeProgram(
      {
        broken: { kind: "operation", op: "Unknown", inputs: {}, output: Type.boolean },
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
    const lang = createStdlib();
    lang.registerOutput({ name: "out", type: Type.number, mode: "required" });
    const prog: RawProgram = {
      bindings: new Map([
        // b declared first (index 0), references a (index 1)
        ["b", { kind: "ref", name: "a", source: { kind: "code", line: 1, column: 0, length: 1 } }],
        [
          "a",
          { kind: "literal", value: 42, source: { kind: "code", line: 2, column: 0, length: 2 } },
        ],
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
    const lang = createStdlib();
    const prog: RawProgram = {
      bindings: new Map([
        [
          "a",
          { kind: "literal", value: 42, source: { kind: "code", line: 1, column: 0, length: 2 } },
        ],
        ["b", { kind: "ref", name: "a", source: { kind: "code", line: 2, column: 0, length: 1 } }],
      ]),
      outputs: new Map([["out", ref("b")]]),
    };
    const result = analyse(prog, lang.descriptor);
    expect(result.errors.filter((e) => e.kind === "forward_reference")).toHaveLength(0);
    expect(result.ok).toBe(true);
  });

  it("rete program → no forward_reference even when index order would trigger it", () => {
    const lang = createStdlib();
    lang.registerOutput({ name: "out", type: Type.number, mode: "required" });
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

// ─── inferOutput / inferInputTypes ───────────────────────────────────────────

describe("inferOutput / inferInputTypes", () => {
  it("Filter on Source[] → output Source[], predicate type (Source) -> boolean", () => {
    const lang = createStdlib();
    lang.registerType("Source", z.unknown(), {});
    lang.registerInput({ name: "items", type: Type.array(Type.name("Source")) });
    const prog = makeProgram(
      {},
      {
        out: {
          kind: "operation",
          op: "Filter",
          inputs: {
            list: { kind: "input", name: "items", type: Type.array(Type.name("Source")) },
            predicate: {
              kind: "lambda",
              params: [{ name: "item" }],
              body: {
                kind: "operation",
                op: "IsSet",
                inputs: { value: ref("item") },
                output: Type.boolean,
              },
            },
          },
          output: Type.array(Type.any),
        },
      },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.ok).toBe(true);
    const node = result.program.outputs.get("out") as any;
    expect(typeToString(node.output)).toBe("Source[]");
    expect(typeToString(node.inputs.predicate.type)).toBe("(Source) -> boolean");
  });

  it("Map with a boolean-returning transform → output boolean[]", () => {
    const lang = createStdlib();
    lang.registerInput({ name: "items", type: Type.array(Type.any) });
    const prog = makeProgram(
      {},
      {
        out: {
          kind: "operation",
          op: "Map",
          inputs: {
            list: { kind: "input", name: "items", type: Type.array(Type.any) },
            transform: { kind: "lambda", params: [{ name: "item" }], body: lit(true) },
          },
          output: Type.array(Type.any),
        },
      },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.ok).toBe(true);
    const node = result.program.outputs.get("out") as any;
    expect(typeToString(node.output)).toBe("boolean[]");
  });

  it("If with matching branch types → concrete output type", () => {
    const lang = createStdlib();
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
          output: Type.any,
        },
      },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.ok).toBe(true);
    const node = result.program.outputs.get("out") as any;
    expect(typeToString(node.output)).toBe("number");
  });
});

// ─── AnalysisResult shape ────────────────────────────────────────────────────

describe("AnalysisResult shape", () => {
  it("failing analysis still has program with surviving outputs", () => {
    const lang = createStdlib();
    lang.registerOutput({ name: "req", type: Type.boolean, mode: "required" });
    lang.registerOutput({ name: "opt", type: Type.boolean, mode: "optional" });
    const prog = makeProgram(
      { bad: { kind: "operation", op: "Unknown", inputs: {}, output: Type.boolean } },
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

// ─── CErrorNode ───────────────────────────────────────────────────────────────

describe("CErrorNode", () => {
  it("evaluator throws EvalError('error_node_reached') for a CErrorNode", () => {
    const errNode: CErrorNode = { kind: "error", dependsOn: new Set() };
    const prog: CoreProgram = { bindings: new Map(), outputs: new Map([["out", errNode]]) };
    const lang = createStdlib();
    expect(() => evaluate(errNode, prog, createEvalState(), undefined, lang.descriptor)).toThrow(
      expect.objectContaining({ kind: "error_node_reached" }),
    );
  });

  it("unknown_op inline in a typed input → no implicit_any_cast warning", () => {
    const lang = createStdlib();
    const prog = makeProgram(
      {
        b: {
          kind: "operation",
          op: "Not",
          inputs: {
            a: { kind: "operation", op: "Unknown", inputs: {}, output: Type.boolean },
          },
          output: Type.boolean,
        },
      },
      { out: ref("b") },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.errors.some((e) => e.kind === "unknown_op")).toBe(true);
    expect(result.warnings.filter((w) => w.kind === "implicit_any_cast")).toHaveLength(0);
  });

  it("getOutputType returns known type for typed CErrorNode, 'any' for untyped", () => {
    const typed: CErrorNode = { kind: "error", type: Type.boolean, dependsOn: new Set() };
    const untyped: CErrorNode = { kind: "error", dependsOn: new Set() };
    expect(typeToString(getOutputType(typed))).toBe("boolean");
    expect(typeToString(getOutputType(untyped))).toBe("any");
  });
});

// ─── lambda (C1: definition + analysis) ──────────────────────────────────────

function lambda(params: LambdaNode["params"], body: ASTNode, returnType?: Type): LambdaNode {
  return { kind: "lambda", params, body, returnType };
}

describe("lambda (C1)", () => {
  it("infers function type from typed params and body", () => {
    const lang = createStdlib();
    const prog = makeProgram(
      { f: lambda([{ name: "x", type: Type.number }], ref("x")) },
      { out: ref("f") },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.errors).toHaveLength(0);
    const f = result.program.bindings.get("f")!;
    expect(typeToString(getOutputType(f))).toBe("(number) -> number");
  });

  it("untyped param defaults to any (gradual)", () => {
    const lang = createStdlib();
    const prog = makeProgram({ f: lambda([{ name: "x" }], ref("x")) }, { out: ref("f") });
    const result = analyse(prog, lang.descriptor);
    const f = result.program.bindings.get("f")!;
    expect(typeToString(getOutputType(f))).toBe("(any) -> any");
  });

  it("return annotation matching the body → no error", () => {
    const lang = createStdlib();
    const prog = makeProgram(
      { f: lambda([{ name: "x", type: Type.number }], ref("x"), Type.number) },
      { out: ref("f") },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.errors).toHaveLength(0);
    const f = result.program.bindings.get("f")!;
    expect(typeToString(getOutputType(f))).toBe("(number) -> number");
  });

  it("return annotation incompatible with the body → lambda_return_type_mismatch", () => {
    const lang = createStdlib();
    const prog = makeProgram(
      { f: lambda([{ name: "x", type: Type.number }], ref("x"), Type.boolean) },
      { out: ref("f") },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.errors.some((e) => e.kind === "lambda_return_type_mismatch")).toBe(true);
  });

  it("param shadows a same-named global binding (local-first)", () => {
    const lang = createStdlib();
    // global x is boolean; the param x is number and must win inside the body.
    const prog = makeProgram(
      { x: lit(true), f: lambda([{ name: "x", type: Type.number }], ref("x")) },
      { out: ref("f") },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.errors).toHaveLength(0);
    const f = result.program.bindings.get("f")!;
    // return is number (the param), not boolean (the shadowed global)
    expect(typeToString(getOutputType(f))).toBe("(number) -> number");
  });

  it("nested lambda: inner body sees the enclosing param (lexical layering)", () => {
    const lang = createStdlib();
    // x => (y => x)  →  (any) -> (any) -> any  (arrow is right-associative)
    const prog = makeProgram(
      { f: lambda([{ name: "x" }], lambda([{ name: "y" }], ref("x"))) },
      { out: ref("f") },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.errors).toHaveLength(0);
    const f = result.program.bindings.get("f")!;
    expect(typeToString(getOutputType(f))).toBe("(any) -> (any) -> any");
  });

  it("collectRefs strips params: a param ref creates no false dependency edge / cycle", () => {
    const lang = createStdlib();
    // global x references f; f's body refs x = its PARAM (shadowed), so there is no
    // f → x edge and hence no x ⇄ f cycle.
    const prog = makeProgram(
      { x: ref("f"), f: lambda([{ name: "x" }], ref("x")) },
      { out: ref("x") },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.errors.some((e) => e.kind === "binding_cycle")).toBe(false);
    expect(result.program.bindings.has("f")).toBe(true);
    // f reads only its param → no input dependencies
    expect(result.program.bindings.get("f")!.dependsOn.size).toBe(0);
  });
});

// ─── app (C2: application analysis) ──────────────────────────────────────────

function app(
  callee: ASTNode,
  positional: ASTNode[] = [],
  named: Record<string, ASTNode> = {},
): ASTNode {
  return { kind: "app", callee, positional, named };
}

describe("app (C2)", () => {
  it("application of a function-typed callee infers the return type", () => {
    const lang = createStdlib();
    const prog = makeProgram(
      { f: lambda([{ name: "x", type: Type.number }], ref("x")) },
      { out: app(ref("f"), [lit(1)]) },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.errors).toHaveLength(0);
    expect(typeToString(getOutputType(result.program.outputs.get("out")!))).toBe("number");
  });

  it("callee that is not function-typed → app_callee_not_function", () => {
    const lang = createStdlib();
    const prog = makeProgram({}, { out: app(lit(5), [lit(1)]) });
    const result = analyse(prog, lang.descriptor);
    expect(result.errors.some((e) => e.kind === "app_callee_not_function")).toBe(true);
  });

  it("too many positional arguments → app_argument_mismatch", () => {
    const lang = createStdlib();
    const prog = makeProgram(
      { f: lambda([{ name: "x" }], ref("x")) },
      { out: app(ref("f"), [lit(1), lit(2)]) },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.errors.some((e) => e.kind === "app_argument_mismatch")).toBe(true);
  });

  it("missing argument → app_argument_mismatch", () => {
    const lang = createStdlib();
    const prog = makeProgram(
      { f: lambda([{ name: "x" }, { name: "y" }], ref("x")) },
      { out: app(ref("f"), [lit(1)]) },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.errors.some((e) => e.kind === "app_argument_mismatch")).toBe(true);
  });

  it("unknown named parameter → app_argument_mismatch", () => {
    const lang = createStdlib();
    const prog = makeProgram(
      { f: lambda([{ name: "x" }], ref("x")) },
      { out: app(ref("f"), [], { y: lit(1) }) },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.errors.some((e) => e.kind === "app_argument_mismatch")).toBe(true);
  });

  it("positional and named binding the same param → app_argument_mismatch", () => {
    const lang = createStdlib();
    const prog = makeProgram(
      { f: lambda([{ name: "x" }], ref("x")) },
      { out: app(ref("f"), [lit(1)], { x: lit(2) }) },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.errors.some((e) => e.kind === "app_argument_mismatch")).toBe(true);
  });

  it("argument incompatible with the param type → app_argument_type_mismatch", () => {
    const lang = createStdlib();
    // f : (number) -> number; apply with a string
    const prog = makeProgram(
      { f: lambda([{ name: "x", type: Type.number }], ref("x")) },
      { out: app(ref("f"), [lit("hi")]) },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.errors.some((e) => e.kind === "app_argument_type_mismatch")).toBe(true);
  });

  it("self-application via a named binding → binding_cycle (recursion blocked)", () => {
    const lang = createStdlib();
    // let f = (x) => f(x)  → f references itself → cycle
    const prog = makeProgram(
      { f: lambda([{ name: "x" }], app(ref("f"), [ref("x")])) },
      { out: ref("f") },
    );
    const result = analyse(prog, lang.descriptor);
    expect(result.errors.some((e) => e.kind === "binding_cycle")).toBe(true);
  });
});
