import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createEnvironment } from "../environment";
import { createStdlib } from "../stdlib";
import { type Language } from "../language";
import { type ASTNode } from "./nodes";
import { type RawProgram } from "./program";
import {
  deserialise,
  migrate,
  SAVED_PROGRAM_VERSION,
  type SavedAstProgram,
  type SavedProgram,
  serialiseAst,
  serialiseSource,
} from "./serialise";
import { Type } from "./types";

// A language exercising structs, arrays, lambdas, and operators.
function makeLang(): Language {
  const lang = createStdlib();
  lang.registerType("User", z.unknown(), {
    fields: { name: Type.string, score: Type.number },
  });
  lang.registerInput({ name: "xs", type: Type.array(Type.number), default: [] });
  lang.registerInput({ name: "user", type: Type.name("User") });
  lang.registerOutput({ name: "top", type: Type.number });
  lang.registerOutput({ name: "label", type: Type.string });
  return lang;
}

// Lambdas, desugared operators, array literals, variadic ops, struct field access.
const SOURCE = `
let base    = [1, 2, 3]
let doubled = Map(Concat(base, $xs), x => x * 2)
let passed  = $user.score >= 60

output top   = Max(doubled)
output label = If(passed, $user.name, "anon")
`;

const INPUTS = { xs: [10], user: { name: "Ada", score: 72 } };

describe("serialise round-trip (ast form)", () => {
  it("save → JSON → load evaluates identically to the direct pipeline", () => {
    const env = createEnvironment(makeLang());

    const parsed = env.parse(SOURCE);
    if (!parsed.ok) throw new Error("parse failed");

    // Direct pipeline.
    const direct = env.analyse(parsed.program);
    expect(direct.ok).toBe(true);
    const directOut = env.run(direct.program, INPUTS);

    // save → stringify → parse → load pipeline.
    const json = JSON.stringify(serialiseAst(parsed.program));
    const revived = deserialise(JSON.parse(json) as SavedAstProgram);
    const loaded = env.analyse(revived);
    expect(loaded.ok).toBe(true);
    const loadedOut = env.run(loaded.program, INPUTS);

    expect(loadedOut).toEqual(directOut);
    expect(loadedOut.get("top")).toBe(20); // max of [2,4,6,20]
    expect(loadedOut.get("label")).toBe("Ada");
  });

  it("preserves SourceRefs verbatim - code and rete alike", () => {
    // code refs (from the parser)
    const env = createEnvironment(makeLang());
    const parsed = env.parse(SOURCE);
    if (!parsed.ok) throw new Error("parse failed");
    const saved = serialiseAst(parsed.program);
    expect(saved.bindings["base"].source?.kind).toBe("code");

    // rete refs (hand-built, the graph-authored path)
    const reteProgram: RawProgram = {
      bindings: new Map<string, ASTNode>([
        ["a", { kind: "literal", value: 1, source: { kind: "rete", nodeId: "n1" } }],
      ]),
      outputs: new Map<string, ASTNode>([
        ["out", { kind: "ref", name: "a", source: { kind: "rete", nodeId: "n2" } }],
      ]),
    };
    const revived = deserialise(serialiseAst(reteProgram));
    expect(revived.bindings.get("a")?.source).toEqual({ kind: "rete", nodeId: "n1" });
    expect(revived.outputs.get("out")?.source).toEqual({ kind: "rete", nodeId: "n2" });
  });

  it("serialise decouples the saved object from the live program", () => {
    const program: RawProgram = {
      bindings: new Map<string, ASTNode>([["a", { kind: "literal", value: 1 }]]),
      outputs: new Map(),
    };
    const saved = serialiseAst(program);
    (program.bindings.get("a") as { value: unknown }).value = 999;
    expect((saved.bindings["a"] as { value: unknown }).value).toBe(1);
  });
});

describe("migrate", () => {
  it("is the identity at the current version", () => {
    const saved = serialiseSource("output out = 1");
    expect(migrate(saved)).toEqual(saved);
    expect(saved.version).toBe(SAVED_PROGRAM_VERSION);
  });

  it("throws descriptively on an unsupported version", () => {
    const future = { version: 2, form: "code", source: "" } as unknown as SavedProgram;
    expect(() => migrate(future)).toThrow(/Unsupported SavedProgram version 2/);
  });
});

describe("deserialise guard", () => {
  const ast = (bindings: unknown, outputs: unknown = {}): SavedAstProgram =>
    ({ version: 1, form: "ast", bindings, outputs }) as SavedAstProgram;

  it("rejects an unknown node kind", () => {
    expect(() => deserialise(ast({ a: { kind: "bogus" } }))).toThrow(/unknown node kind 'bogus'/);
  });

  it("rejects non-record containers", () => {
    expect(() => deserialise(ast("nope"))).toThrow(/bindings is not a record/);
  });

  it("rejects malformed children with a path", () => {
    const node = { kind: "operation", op: "Add", inputs: { nodes: [42] }, output: Type.number };
    expect(() => deserialise(ast({ a: node }))).toThrow(/inputs\.nodes\[0\]/);
  });
});
