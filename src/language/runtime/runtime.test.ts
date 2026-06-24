import { describe, expect, it, vi } from "vitest";

import { analyse } from "../analyser/analyser";
import { EvalError } from "../evaluator/types";
import { CoreProgram } from "../infra/program";
import { Type } from "../infra/types";
import { parseSource } from "../language";
import { createStdlib } from "../stdlib";
import { Language } from "../language";
import { createRuntime } from "./runtime";
import { createProgramRunner, run } from "./runner";

// A stdlib language with two numeric inputs, one trigger, one output, and a `Boom` op
// that throws once its input goes positive (so the initial default-valued eval is fine
// but a later input change errors - exercising the runtime's error path).
function makeLang(): Language {
  const lang = createStdlib();
  lang.registerInput({ name: "x", type: Type.number, default: 0 });
  lang.registerInput({ name: "y", type: Type.number, default: 0 });
  lang.registerInput({ name: "trig", type: Type.number, default: 0, trigger: true });
  lang.registerOutput({ name: "out", type: Type.number });
  lang.registerOp({
    name: "Boom",
    inputs: [{ name: "n", type: Type.number }],
    output: Type.number,
    category: "test",
  });
  lang.registerEvaluator({
    op: "Boom",
    evaluate: ({ n }) => {
      if ((n as number) > 0) throw new Error("boom");
      return n;
    },
  });
  return lang;
}

function build(lang: Language, src: string): CoreProgram {
  const parsed = parseSource(src, lang);
  if (!parsed.ok) throw new Error(`parse failed: ${JSON.stringify(parsed.errors)}`);
  const analysed = analyse(parsed.program, lang.descriptor);
  if (!analysed.ok) throw new Error(`analyse failed: ${JSON.stringify(analysed.errors)}`);
  return analysed.program;
}

describe("runtime", () => {
  it("register runs an initial evaluation from input defaults", () => {
    const lang = makeLang();
    const rt = createRuntime(lang.descriptor);
    const handle = rt.register("p", build(lang, "output out = Add($x, 1)"));
    expect(handle.initialOutputs.get("out")).toBe(1); // x default 0 → 0 + 1
  });

  it("updateInputs re-evaluates and notifies onOutput", () => {
    const lang = makeLang();
    const rt = createRuntime(lang.descriptor);
    const handle = rt.register("p", build(lang, "output out = Add($x, 1)"));
    const spy = vi.fn();
    handle.onOutput(spy);

    const results = rt.updateInputs({ x: 10 });
    expect(results.get("p")?.get("out")).toBe(11);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].get("out")).toBe(11);
  });

  it("only programs depending on the changed input are re-evaluated", () => {
    const lang = makeLang();
    const rt = createRuntime(lang.descriptor);
    const a = rt.register("a", build(lang, "output out = Add($x, 1)"));
    const b = rt.register("b", build(lang, "output out = Add($y, 1)"));
    const aSpy = vi.fn();
    const bSpy = vi.fn();
    a.onOutput(aSpy);
    b.onOutput(bSpy);

    const results = rt.updateInputs({ x: 5 });
    expect(results.has("a")).toBe(true);
    expect(results.has("b")).toBe(false);
    expect(aSpy).toHaveBeenCalledTimes(1);
    expect(bSpy).not.toHaveBeenCalled();
  });

  it("unregister removes the program from the input index and stops notifications", () => {
    const lang = makeLang();
    const rt = createRuntime(lang.descriptor);
    const handle = rt.register("p", build(lang, "output out = Add($x, 1)"));
    const spy = vi.fn();
    handle.onOutput(spy);

    handle.unregister();
    const results = rt.updateInputs({ x: 99 });
    expect(results.has("p")).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  // Regression: the runtime must catch the evaluator's EvalError (not the JS builtin),
  // routing it to onError rather than letting it propagate.
  it("routes evaluator errors to onError handlers", () => {
    const lang = makeLang();
    const rt = createRuntime(lang.descriptor);
    const handle = rt.register("p", build(lang, "output out = Boom($x)")); // x=0 → ok initially
    const onError = vi.fn();
    handle.onError(onError);

    const results = rt.updateInputs({ x: 7 }); // Boom throws → host_error
    expect(onError).toHaveBeenCalledTimes(1);
    const err = onError.mock.calls[0][0];
    expect(err).toBeInstanceOf(EvalError);
    expect(err.kind).toBe("host_error");
    expect(results.has("p")).toBe(false); // errored program produces no outputs
  });

  it("fireTrigger evaluates with the fired value then resets to the default", () => {
    const lang = makeLang();
    const rt = createRuntime(lang.descriptor);
    const handle = rt.register("p", build(lang, "output out = Add($trig, 0)"));
    const spy = vi.fn();
    handle.onOutput(spy);

    const results = rt.fireTrigger("trig", 5);
    expect(results.get("p")?.get("out")).toBe(5); // returned value is the fired pass
    // Two notifications: fired value (5), then reset to default (0).
    expect(spy.mock.calls.map((c) => c[0].get("out"))).toEqual([5, 0]);
  });

  it("getOutputDependencies reflects the inputs an output transitively uses", () => {
    const lang = makeLang();
    const rt = createRuntime(lang.descriptor);
    rt.register("p", build(lang, "output out = Add($x, 1)"));
    const deps = rt.getOutputDependencies("p");
    expect([...(deps?.get("out") ?? [])]).toEqual(["x"]);
    expect(rt.getOutputDependencies("missing")).toBeUndefined();
  });
});

describe("runner", () => {
  it("run() evaluates one-shot from the provided inputs", () => {
    const lang = makeLang();
    const program = build(lang, "output out = Add($x, 1)");
    const outputs = run(program, lang.descriptor, { x: 41 });
    expect(outputs.get("out")).toBe(42);
  });

  it("ProgramRunner seeds from defaults and recomputes across runs", () => {
    const lang = makeLang();
    const runner = createProgramRunner(build(lang, "output out = Add($x, 1)"), lang.descriptor);
    expect(runner.run({}).get("out")).toBe(1); // x default 0
    expect(runner.run({ x: 100 }).get("out")).toBe(101);
  });
});
