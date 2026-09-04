import { describe, expect, it } from "vitest";

import { createEnvironment } from "./environment";
import { createStdlib } from "./stdlib";
import {
  type SavedAstProgram,
  type SavedProgram,
  serialiseAst,
  serialiseSource,
} from "./infra/serialise";
import { Type } from "./infra/types";

function makeEnv(withInput = true) {
  const lang = createStdlib();
  if (withInput) lang.registerInput({ name: "n", type: Type.number, default: 1 });
  lang.registerOutput({ name: "out", type: Type.number, mode: "required" });
  return createEnvironment(lang);
}

describe("load - code form", () => {
  it("behaves exactly like compile on success", () => {
    const env = makeEnv();
    const source = "output out = $n + 1";
    const loaded = env.load(serialiseSource(source));
    const compiled = env.compile(source);
    expect(loaded.ok).toBe(true);
    expect(compiled.ok).toBe(true);
    if (!loaded.ok || !compiled.ok) return;
    expect(env.run(loaded.program, { n: 41 })).toEqual(env.run(compiled.program, { n: 41 }));
  });

  it("surfaces parse errors with stage 'parse'", () => {
    const env = makeEnv();
    const result = env.load(serialiseSource("output out = "));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.stage).toBe("parse");
  });
});

describe("load - ast form", () => {
  it("re-analyses against the LOAD-TIME language: descriptor drift surfaces as errors", () => {
    // Save under a language WITH input $n...
    const envA = makeEnv(true);
    const parsed = envA.parse("output out = $n + 1");
    if (!parsed.ok) throw new Error("parse failed");
    const saved = serialiseAst(parsed.program);

    // ...load under a language WITHOUT it.
    const envB = makeEnv(false);
    const result = envB.load(saved);
    expect(result.ok).toBe(false);
    if (result.ok || result.stage !== "analyse") throw new Error("expected analyse failure");
    expect(result.errors.some((e) => e.kind === "unknown_program_input")).toBe(true);
    expect(result.program).toBeDefined(); // partial program still present
  });

  it("rejects malformed blobs as a result, not a throw", () => {
    const env = makeEnv();
    const malformed = {
      version: 1,
      form: "ast",
      bindings: { a: { kind: "bogus" } },
      outputs: {},
    } as unknown as SavedAstProgram;
    const result = env.load(malformed);
    expect(result.ok).toBe(false);
    if (result.ok || result.stage !== "load") throw new Error("expected load failure");
    expect(result.errors[0].kind).toBe("malformed_program");
  });
});

describe("load - reserved and versioned forms", () => {
  it("rete form is reserved until the editor adapter exists", () => {
    const env = makeEnv();
    const result = env.load({ version: 1, form: "rete", graph: { nodes: [] } });
    expect(result.ok).toBe(false);
    if (result.ok || result.stage !== "load") throw new Error("expected load failure");
    expect(result.errors[0].kind).toBe("unsupported_form");
  });

  it("newer format versions fail with unsupported_version", () => {
    const env = makeEnv();
    const future = { version: 2, form: "code", source: "" } as unknown as SavedProgram;
    const result = env.load(future);
    expect(result.ok).toBe(false);
    if (result.ok || result.stage !== "load") throw new Error("expected load failure");
    expect(result.errors[0].kind).toBe("unsupported_version");
  });
});

describe("CompileResult warnings", () => {
  it("merges parse and analysis warnings on the ok arm", () => {
    const env = makeEnv();
    // \q is an invalid escape (parse warning); `unused` is never referenced (analysis warning).
    const result = env.compile('let unused = "a\\qb"\noutput out = $n + 1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const kinds = result.warnings.map((w) => w.kind);
    expect(kinds).toContain("invalid_escape");
    expect(kinds).toContain("unused_binding");
  });

  it("carries parse warnings into an analyse-stage failure", () => {
    const env = makeEnv();
    // Invalid escape (parse warning) + a reference to a missing binding (analysis error
    // poisoning the required output).
    const result = env.compile('let s = "a\\qb"\noutput out = missing');
    expect(result.ok).toBe(false);
    if (result.ok || result.stage !== "analyse") throw new Error("expected analyse failure");
    expect(result.warnings.some((w) => w.kind === "invalid_escape")).toBe(true);
    expect(result.errors.some((e) => e.kind === "undeclared_binding_reference")).toBe(true);
  });
});
