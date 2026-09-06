import { describe, expect, it, vi } from "vitest";

import { analyse } from "../analyser/analyser";
import { EvalError } from "../evaluator/types";
import { EMPTY_PORTS, type PortLayer, type Ports, Policy } from "../infra/ports";
import { CoreProgram } from "../infra/program";
import { Type } from "../infra/types";
import { type Language, parseSource } from "../language";
import { createStdlib } from "../stdlib";
import { withLayers, withPorts } from "../../testing";
import { createRuntime } from "./runtime";
import { createProgramRunner, run } from "./runner";

// A stdlib language with a `Boom` op that throws once its input goes positive, so the
// initial default-valued eval is fine but a later input change errors - exercising the
// runtime's error path.
function makeLang(): Language {
  const lang = createStdlib();
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

// The host contract: two numeric inputs, one trigger, one output. No explicit defaults -
// seeding derives them from the types (number → 0).
const PORTS: Ports = {
  inputs: [
    { name: "x", type: Type.number },
    { name: "y", type: Type.number },
    { name: "trig", type: Type.number, trigger: true },
  ],
  outputs: [{ name: "out", type: Type.number }],
};
const host = (ports: Ports = PORTS): PortLayer => ({ id: "host", ports, policy: Policy.host });
const runtimeFor = (lang: Language, ports: Ports = PORTS) =>
  createRuntime(lang.descriptor, { layers: [host(ports)] });

// Analyse `src` against the host layer plus whatever the program declares itself.
function build(
  lang: Language,
  src: string,
  options: { ports?: Ports; global?: Ports } = {},
): CoreProgram {
  const program = [{ id: "p", ports: options.ports ?? EMPTY_PORTS, policy: Policy.user }];
  const descriptor = withLayers(lang, [host(options.global)], program);
  const parsed = parseSource(src, lang);
  if (!parsed.ok) throw new Error(`parse failed: ${JSON.stringify(parsed.errors)}`);
  const analysed = analyse(parsed.program, descriptor);
  if (!analysed.ok) throw new Error(`analyse failed: ${JSON.stringify(analysed.errors)}`);
  return analysed.program;
}

const P: Ports = { inputs: [{ name: "p", type: Type.number }], outputs: [] };

describe("runtime", () => {
  it("register runs an initial evaluation from input defaults", () => {
    const lang = makeLang();
    const rt = runtimeFor(lang);
    const handle = rt.register("p", build(lang, "output out = Add($x, 1)"));
    expect(handle.initialOutputs.get("out")).toBe(1); // x seeds 0 → 0 + 1
  });

  it("updateInputs re-evaluates and notifies onOutput", () => {
    const lang = makeLang();
    const rt = runtimeFor(lang);
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
    const rt = runtimeFor(lang);
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
    const rt = runtimeFor(lang);
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
    const rt = runtimeFor(lang);
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
    const rt = runtimeFor(lang);
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
    const rt = runtimeFor(lang);
    rt.register("p", build(lang, "output out = Add($x, 1)"));
    const deps = rt.getOutputDependencies("p");
    expect([...(deps?.get("out") ?? [])]).toEqual(["x"]);
    expect(rt.getOutputDependencies("missing")).toBeUndefined();
  });

  it("register refuses an id that is already taken", () => {
    const lang = makeLang();
    const rt = runtimeFor(lang);
    rt.register("p", build(lang, "output out = Add($x, 1)"));
    expect(() => rt.register("p", build(lang, "output out = Add($y, 1)"))).toThrow(/use replace/);
  });
});

describe("runtime - program-level ports", () => {
  it("seeds and evaluates a program's own inputs", () => {
    const lang = makeLang();
    const rt = runtimeFor(lang);
    const handle = rt.register("a", build(lang, "output out = Add($x, $p)", { ports: P }), {
      ports: P,
    });
    expect(handle.initialOutputs.get("out")).toBe(0);
    expect(handle.setInput("p", 4).get("out")).toBe(4);
  });

  it("takes starting values for its own inputs and ignores every other name", () => {
    const lang = makeLang();
    const rt = runtimeFor(lang);
    const handle = rt.register("a", build(lang, "output out = Add($x, $p)", { ports: P }), {
      ports: P,
      values: { p: 7, x: 100, nope: 1 },
    });
    expect(handle.initialOutputs.get("out")).toBe(7); // x stayed at its own default
  });

  it("seeds a program-level input through a type the program's own layer declares", () => {
    const lang = makeLang();
    const ports: Ports = {
      types: [{ name: "Bus", fields: { n: Type.number }, default: { n: 7 } }],
      inputs: [{ name: "b", type: Type.name("Bus") }],
      outputs: [],
    };
    const rt = runtimeFor(lang);
    const handle = rt.register("a", build(lang, "output out = $b.n", { ports }), { ports });
    expect(handle.initialOutputs.get("out")).toBe(7);
  });

  it("keeps two programs' same-named inputs apart", () => {
    const lang = makeLang();
    const rt = runtimeFor(lang);
    const a = rt.register("a", build(lang, "output out = Add($p, 0)", { ports: P }), { ports: P });
    const b = rt.register("b", build(lang, "output out = Add($p, 0)", { ports: P }), { ports: P });
    const bSpy = vi.fn();
    b.onOutput(bSpy);

    expect(a.setInput("p", 9).get("out")).toBe(9);
    expect(bSpy).not.toHaveBeenCalled();
    expect(b.setInput("p", 2).get("out")).toBe(2);
  });

  it("stores nothing for a program-level name pushed through updateInputs", () => {
    const lang = makeLang();
    const rt = runtimeFor(lang);
    rt.register("a", build(lang, "output out = Add($x, $p)", { ports: P }), { ports: P });
    expect(rt.updateInputs({ p: 99 }).size).toBe(0); // not a global name

    // Nothing was stored globally either: a replace re-seeds p from its default.
    const replaced = rt.replace("a", build(lang, "output out = Add($x, $p)", { ports: P }));
    expect(replaced.initialOutputs.get("out")).toBe(0);
  });

  it("fires a program-level trigger and resets it", () => {
    const lang = makeLang();
    const ports: Ports = { inputs: [{ name: "t", type: Type.number, trigger: true }], outputs: [] };
    const rt = runtimeFor(lang);
    const handle = rt.register("a", build(lang, "output out = Add($t, 0)", { ports }), { ports });
    const spy = vi.fn();
    handle.onOutput(spy);

    expect(handle.fireTrigger("t", 5).get("out")).toBe(5);
    expect(spy.mock.calls.map((c) => c[0].get("out"))).toEqual([5, 0]);
  });

  it("refuses a global name through the handle", () => {
    const lang = makeLang();
    const rt = runtimeFor(lang);
    const handle = rt.register("a", build(lang, "output out = Add($x, $p)", { ports: P }), {
      ports: P,
    });
    expect(() => handle.setInput("x", 1)).toThrow(/not a program-level input/);
  });

  it("throws when a program's ports collide with a global name", () => {
    const lang = makeLang();
    const rt = runtimeFor(lang);
    const clash: Ports = { inputs: [{ name: "x", type: Type.number }], outputs: [] };
    const program = build(lang, "output out = Add($x, 1)");
    expect(() => rt.register("a", program, { ports: clash })).toThrow(/do not compose/);

    rt.register("b", program);
    expect(() => rt.replace("b", program, { ports: clash })).toThrow(/do not compose/);
  });
});

describe("runtime - replace", () => {
  it("keeps subscriptions and surviving values, drops the rest", () => {
    const lang = makeLang();
    const PQ: Ports = {
      inputs: [
        { name: "p", type: Type.number },
        { name: "q", type: Type.number },
      ],
      outputs: [],
    };
    const rt = runtimeFor(lang);
    const handle = rt.register("a", build(lang, "output out = Add($p, $q)", { ports: PQ }), {
      ports: PQ,
    });
    const spy = vi.fn();
    handle.onOutput(spy);
    handle.setInput("p", 3);
    handle.setInput("q", 4);
    spy.mockClear();

    const replaced = rt.replace("a", build(lang, "output out = Add($x, $p)", { ports: P }), {
      ports: P,
    });
    expect(replaced.initialOutputs.get("out")).toBe(3); // p kept, q gone with its input
    expect(spy).toHaveBeenCalledTimes(1); // the original subscription still fires
    expect(rt.updateInputs({ x: 10 }).get("a")?.get("out")).toBe(13); // re-indexed on x
  });

  it("keeps the current ports when the caller omits them", () => {
    const lang = makeLang();
    const rt = runtimeFor(lang);
    const handle = rt.register("a", build(lang, "output out = Add($x, $p)", { ports: P }), {
      ports: P,
    });
    handle.setInput("p", 6);
    expect(
      rt
        .replace("a", build(lang, "output out = Add($p, 1)", { ports: P }))
        .initialOutputs.get("out"),
    ).toBe(7);
  });

  it("throws on an unknown id", () => {
    const lang = makeLang();
    const rt = runtimeFor(lang);
    expect(() => rt.replace("nope", build(lang, "output out = Add($x, 1)"))).toThrow(
      /not registered/,
    );
  });
});

describe("runtime - first evaluation errors", () => {
  const BOOM: Ports = { inputs: [{ name: "p", type: Type.number, default: 1 }], outputs: [] };

  it("register routes a first-evaluation error instead of throwing", () => {
    const lang = makeLang();
    const rt = runtimeFor(lang);
    const onError = vi.fn();
    rt.onError(onError);

    const handle = rt.register("a", build(lang, "output out = Boom($p)", { ports: BOOM }), {
      ports: BOOM,
    });
    expect(handle.initialOutputs.size).toBe(0);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][1]).toBeInstanceOf(EvalError);
  });

  it("replace does the same", () => {
    const lang = makeLang();
    const rt = runtimeFor(lang);
    const handle = rt.register("a", build(lang, "output out = Add($x, 1)"));
    const onError = vi.fn();
    handle.onError(onError);

    const replaced = rt.replace("a", build(lang, "output out = Boom($p)", { ports: BOOM }), {
      ports: BOOM,
    });
    expect(replaced.initialOutputs.size).toBe(0);
    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe("runtime - global layers", () => {
  it("rejects a layer change that does not compose, leaving everything untouched", () => {
    const lang = makeLang();
    const rt = runtimeFor(lang);
    const before = rt.layers;
    const problems = rt.setLayer("host", {
      inputs: [
        { name: "x", type: Type.number },
        { name: "x", type: Type.string },
      ],
      outputs: [],
    });
    expect(problems.map((p) => p.kind)).toEqual(["duplicate_name"]);
    expect(rt.layers).toBe(before);
    expect(rt.register("a", build(lang, "output out = Add($x, 1)")).initialOutputs.get("out")).toBe(
      1,
    );
  });

  it("applies a change, prunes dropped values and notifies listeners last", () => {
    const lang = makeLang();
    const rt = runtimeFor(lang);
    rt.updateInputs({ x: 10, y: 20 });

    const seen: unknown[] = [];
    rt.onLayerChange((layers) => seen.push(layers[0]?.ports.inputs.map((i) => i.name)));
    const next: Ports = {
      inputs: [
        { name: "x", type: Type.number },
        { name: "trig", type: Type.number, trigger: true },
        { name: "z", type: Type.number, default: 3 },
      ],
      outputs: [{ name: "out", type: Type.number }],
    };
    expect(rt.setLayer("host", next)).toEqual([]);
    expect(rt.layers[0].ports).toBe(next);
    expect(seen).toEqual([["x", "trig", "z"]]);

    // x survived with its value, y's value went with the input, z seeds its own default.
    const handle = rt.register("a", build(lang, "output out = Add($x, $z)", { global: next }), {});
    expect(handle.initialOutputs.get("out")).toBe(13);
  });

  it("unsubscribes a layer listener", () => {
    const lang = makeLang();
    const rt = runtimeFor(lang);
    const listener = vi.fn();
    rt.onLayerChange(listener)();
    rt.setLayer("host", PORTS);
    expect(listener).not.toHaveBeenCalled();
  });

  it("throws on an unknown layer id", () => {
    expect(() => runtimeFor(makeLang()).setLayer("nope", PORTS)).toThrow(/No global layer/);
  });

  it("refuses global layers that do not compose at creation", () => {
    const lang = makeLang();
    const clash: PortLayer = { id: "other", ports: PORTS, policy: Policy.host };
    expect(() => createRuntime(lang.descriptor, { layers: [host(), clash] })).toThrow(
      /Global port layers do not compose/,
    );
  });

  it("runs without any layers at all", () => {
    const lang = makeLang();
    const rt = createRuntime(lang.descriptor);
    expect(rt.layers).toEqual([]);
    const ports: Ports = {
      inputs: [{ name: "p", type: Type.number }],
      outputs: [{ name: "out", type: Type.number }],
    };
    const descriptor = withPorts(lang, ports);
    const parsed = parseSource("output out = Add($p, 1)", lang);
    if (!parsed.ok) throw new Error("parse failed");
    const analysed = analyse(parsed.program, descriptor);
    if (!analysed.ok) throw new Error("analyse failed");
    expect(rt.register("a", analysed.program, { ports }).initialOutputs.get("out")).toBe(1);
  });
});

describe("runner", () => {
  it("run() evaluates one-shot from the provided inputs", () => {
    const lang = makeLang();
    const program = build(lang, "output out = Add($x, 1)");
    const outputs = run(program, withLayers(lang, [host()], []), { x: 41 });
    expect(outputs.get("out")).toBe(42);
  });

  it("ProgramRunner seeds from defaults and recomputes across runs", () => {
    const lang = makeLang();
    const descriptor = withLayers(lang, [host()], []);
    const runner = createProgramRunner(build(lang, "output out = Add($x, 1)"), descriptor);
    expect(runner.run({}).get("out")).toBe(1); // x seeds 0
    expect(runner.run({ x: 100 }).get("out")).toBe(101);
  });

  it("ProgramRunner seeds through the type's default chain", () => {
    const lang = makeLang();
    const ports: Ports = {
      types: [{ name: "Score", extends: "number" }],
      inputs: [{ name: "s", type: Type.name("Score") }],
      outputs: [{ name: "out", type: Type.number }],
    };
    const descriptor = withPorts(lang, ports);
    const parsed = parseSource("output out = Add($s, 1)", lang);
    if (!parsed.ok) throw new Error("parse failed");
    const analysed = analyse(parsed.program, descriptor);
    if (!analysed.ok) throw new Error("analyse failed");
    expect(createProgramRunner(analysed.program, descriptor).run({}).get("out")).toBe(1);
  });
});
