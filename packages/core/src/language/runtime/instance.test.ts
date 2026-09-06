import { describe, expect, it, vi } from "vitest";

import { createEnvironment } from "../environment";
import { type PortLayer, type Ports, Policy } from "../infra/ports";
import { serialiseAst, serialiseSource } from "../infra/serialise";
import { Type } from "../infra/types";
import { type Language } from "../language";
import { createStdlib } from "../stdlib";
import { type InstanceOptions, type ProgramInstance, type Snapshot } from "./instance";

// The host's contract, global to the runtime: one shared input and the output every
// program is expected to produce.
const HOST: Ports = {
  inputs: [{ name: "g", type: Type.number }],
  outputs: [{ name: "out", type: Type.number }],
};
// What a document declares for itself.
const DOC: Ports = { inputs: [{ name: "p", type: Type.number }], outputs: [] };
const SOURCE = "output out = Add($g, $p)";

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

function setup(options: Partial<InstanceOptions> = {}) {
  const env = createEnvironment(makeLang());
  const runtime = env.createRuntime({ layers: [{ id: "host", ports: HOST, policy: Policy.host }] });
  const instance = env.createInstance(runtime, {
    program: serialiseSource(SOURCE, DOC),
    id: "doc",
    ...options,
  });
  return { env, runtime, instance };
}

const outputsOf = (instance: ProgramInstance) => instance.outputs.get().outputs?.get("out");
const kinds = (instance: ProgramInstance) => instance.diagnostics.get().map((d) => d.kind);
const record = (instance: ProgramInstance): Snapshot[] => {
  const seen: Snapshot[] = [];
  instance.snapshot.subscribe((s) => seen.push(s));
  return seen;
};

describe("createInstance - boot", () => {
  it("publishes all five observables", () => {
    const { instance } = setup();

    expect(instance.diagnostics.get()).toEqual([]);
    const ports = instance.ports.get();
    expect(ports.layers.map((a) => [a.layer.id, a.level])).toEqual([
      ["host", "global"],
      ["document", "program"],
    ]);
    expect(ports.composed.ok).toBe(true);
    expect(instance.outputs.get()).toMatchObject({ error: null, stale: false });
    expect(outputsOf(instance)).toBe(0);
    expect(instance.values.get()).toEqual({ p: 0 });
    expect(instance.snapshot.get()).toEqual({
      program: serialiseSource(SOURCE, DOC),
      inputValues: { p: 0 },
    });
  });

  it("derives its document layer from the program's own ports, and round-trips them", () => {
    const { instance } = setup();
    expect(instance.snapshot.get().program.ports).toEqual(DOC);
  });

  it("takes starting values for the persisted layer only", () => {
    const sensor: PortLayer = {
      id: "cap",
      ports: { inputs: [{ name: "sensor", type: Type.number }], outputs: [] },
      policy: Policy.host,
    };
    const { instance } = setup({
      program: serialiseSource("output out = Add($sensor, $p)"),
      layers: [sensor, { id: "document", ports: DOC, policy: Policy.user }],
      inputValues: { p: 7, sensor: 99 },
    });
    expect(instance.values.get()).toEqual({ sensor: 0, p: 7 }); // the host's own is not accepted
    expect(instance.snapshot.get().inputValues).toEqual({ p: 7 });
  });

  it("refuses more than one persisted layer", () => {
    expect(() =>
      setup({
        layers: [
          { id: "a", ports: DOC, policy: Policy.user },
          { id: "b", ports: { inputs: [], outputs: [] }, policy: Policy.user },
        ],
      }),
    ).toThrow(/more than one persisted layer/);
  });

  it("reports a program that does not compile, with nothing ever registered", () => {
    const { instance } = setup({ program: serialiseSource("output out = Add($g,", DOC) });
    expect(kinds(instance)).toContain("unexpected_end");
    expect(instance.diagnostics.get()[0].stage).toBe("parse");
    expect(instance.outputs.get()).toEqual({ outputs: null, error: null, stale: false });
  });
});

describe("ProgramInstance - values", () => {
  it("setInput updates values, outputs and the snapshot", () => {
    const { instance } = setup();
    const snapshots = record(instance);

    instance.setInput("p", 5);
    expect(instance.values.get()).toEqual({ p: 5 });
    expect(outputsOf(instance)).toBe(5);
    expect(snapshots.map((s) => s.inputValues)).toEqual([{ p: 5 }]);
  });

  it("leaves the snapshot silent for an input its own layer does not own", () => {
    const sensor: PortLayer = {
      id: "cap",
      ports: { inputs: [{ name: "sensor", type: Type.number }], outputs: [] },
      policy: Policy.host,
    };
    const { instance } = setup({
      program: serialiseSource("output out = Add($sensor, $p)"),
      layers: [sensor, { id: "document", ports: DOC, policy: Policy.user }],
    });
    const snapshots = record(instance);

    instance.setInput("sensor", 3);
    expect(instance.values.get()).toEqual({ sensor: 3, p: 0 });
    expect(outputsOf(instance)).toBe(3);
    expect(snapshots).toEqual([]);
  });

  it("ignores a set that changes nothing and refuses a global name", () => {
    const { instance } = setup();
    const snapshots = record(instance);
    instance.setInput("p", 0);
    expect(snapshots).toEqual([]);
    expect(() => instance.setInput("g", 1)).toThrow(/not a program-level input/);
  });

  it("fires a program-level trigger and returns it to its default", () => {
    const ports: Ports = {
      inputs: [{ name: "t", type: Type.number, trigger: true }],
      outputs: [],
    };
    const { instance } = setup({ program: serialiseSource("output out = Add($t, 0)", ports) });
    const seen: unknown[] = [];
    instance.outputs.subscribe((r) => seen.push(r.outputs?.get("out")));

    instance.fireTrigger("t", 5);
    expect(seen).toEqual([5, 0]);
    expect(instance.values.get()).toEqual({ t: 0 });
  });
});

describe("ProgramInstance - staleness", () => {
  it("keeps the last outputs when a new program fails, and recovers with the values kept", () => {
    const { instance, runtime } = setup();
    instance.setInput("p", 5);

    instance.setProgram(serialiseSource("output out = Add($g,", DOC));
    expect(instance.outputs.get()).toMatchObject({ stale: true });
    expect(outputsOf(instance)).toBe(5); // what the lights are still following
    expect(kinds(instance)).toContain("unexpected_end");

    // The runtime keeps driving the last good program, and says so.
    runtime.updateInputs({ g: 10 });
    expect(outputsOf(instance)).toBe(15);
    expect(instance.outputs.get().stale).toBe(true);

    // A value typed against the broken source is stored, not fed to the old program.
    instance.setInput("p", 8);
    expect(instance.values.get()).toEqual({ p: 8 });
    expect(outputsOf(instance)).toBe(15);

    instance.setProgram(serialiseSource(SOURCE, DOC));
    expect(instance.outputs.get().stale).toBe(false);
    expect(outputsOf(instance)).toBe(18); // g 10 + the p typed while it was broken
    expect(instance.diagnostics.get()).toEqual([]);
  });

  it("reports an error thrown by the very first evaluation", () => {
    const ports: Ports = { inputs: [{ name: "p", type: Type.number, default: 1 }], outputs: [] };
    const { instance } = setup({ program: serialiseSource("output out = Boom($p)", ports) });

    // That evaluation runs inside register(), before the instance can subscribe.
    expect(instance.outputs.get().error?.kind).toBe("host_error");
    expect(instance.outputs.get().stale).toBe(true);
  });

  it("marks outputs stale when an evaluation throws, and clears it on the next good one", () => {
    const ports: Ports = { inputs: [{ name: "p", type: Type.number }], outputs: [] };
    const { instance } = setup({ program: serialiseSource("output out = Boom($p)", ports) });
    expect(instance.outputs.get()).toMatchObject({ stale: false, error: null });

    instance.setInput("p", 1); // Boom throws
    const failed = instance.outputs.get();
    expect(failed.stale).toBe(true);
    expect(failed.error?.kind).toBe("host_error");

    instance.setInput("p", 0); // an input change is how you recover
    expect(instance.outputs.get()).toMatchObject({ stale: false, error: null });
  });
});

describe("ProgramInstance - layers", () => {
  it("setLayer seeds an added input and drops a removed one's value", () => {
    const { instance } = setup();
    instance.setInput("p", 5);

    expect(
      instance.setLayer("document", {
        inputs: [
          { name: "p", type: Type.number },
          { name: "q", type: Type.number, default: 2 },
        ],
        outputs: [],
      }),
    ).toEqual([]);
    expect(instance.values.get()).toEqual({ p: 5, q: 2 });

    // Removing an input the program never referenced drops its value and nothing else.
    expect(instance.setLayer("document", DOC)).toEqual([]);
    expect(instance.values.get()).toEqual({ p: 5 });
    expect(instance.snapshot.get()).toEqual({
      program: serialiseSource(SOURCE, DOC),
      inputValues: { p: 5 },
    });
  });

  it("refuses a layer change that takes a name an earlier layer owns", () => {
    const { instance } = setup();
    const before = instance.ports.get();

    const problems = instance.setLayer("document", {
      inputs: [{ name: "g", type: Type.number }],
      outputs: [],
    });
    expect(problems).toEqual([
      expect.objectContaining({ kind: "shadowed_name", layerId: "document", where: "input g" }),
    ]);
    expect(instance.ports.get()).toBe(before); // nothing moved
    expect(outputsOf(instance)).toBe(0);
  });

  it("applies a change that breaks a LATER layer, and flags that layer instead", () => {
    const sensor: PortLayer = {
      id: "cap",
      ports: { inputs: [{ name: "sensor", type: Type.number }], outputs: [] },
      policy: Policy.host,
    };
    const { instance } = setup({
      program: serialiseSource("output out = Add($sensor, $p)"),
      layers: [sensor, { id: "document", ports: DOC, policy: Policy.user }],
    });

    // The capability layer takes the document's name. It is earlier, so it wins.
    const problems = instance.setLayer("cap", {
      inputs: [{ name: "p", type: Type.number }],
      outputs: [],
    });
    expect(problems).toEqual([]);
    expect(instance.diagnostics.get()).toEqual([
      expect.objectContaining({
        stage: "ports",
        kind: "shadowed_name",
        layerId: "document",
        where: "input p",
      }),
    ]);
    expect(instance.outputs.get().stale).toBe(true);
  });

  it("throws on an unknown layer id", () => {
    const { instance } = setup();
    expect(() => instance.setLayer("nope", DOC)).toThrow(/No program-level layer/);
  });

  it("recompiles when the runtime's global layers change", () => {
    const { instance, runtime } = setup();
    const snapshots = record(instance);

    // Drop the global input the program reads.
    expect(runtime.setLayer("host", { inputs: [], outputs: HOST.outputs })).toEqual([]);
    expect(kinds(instance)).toContain("unknown_program_input");
    expect(instance.outputs.get().stale).toBe(true);
    expect(instance.ports.get().layers[0].layer.ports.inputs).toEqual([]);
    expect(snapshots).toEqual([]); // a global change is not the document's business
  });
});

describe("ProgramInstance - snapshot and disposal", () => {
  it("carries the persisted layer's ports and values, and copies them", () => {
    const { instance } = setup();
    instance.setInput("p", 4);

    const snapshot = instance.snapshot.get();
    expect(snapshot).toEqual({
      program: serialiseSource(SOURCE, DOC),
      inputValues: { p: 4 },
    });
    snapshot.inputValues.p = 999;
    expect(instance.values.get()).toEqual({ p: 4 });
  });

  it("omits ports entirely when no layer is persisted", () => {
    const { instance } = setup({
      program: serialiseSource(SOURCE, DOC),
      layers: [{ id: "host-only", ports: DOC, policy: Policy.host }],
    });
    expect("ports" in instance.snapshot.get().program).toBe(false);
    expect(instance.snapshot.get().inputValues).toEqual({});
  });

  it("works on the ast form too", () => {
    const env = createEnvironment(makeLang());
    const parsed = env.parse(SOURCE);
    if (!parsed.ok) throw new Error("parse failed");
    const { instance } = setup({ program: serialiseAst(parsed.program, DOC) });
    expect(outputsOf(instance)).toBe(0);
    expect(instance.snapshot.get().program.form).toBe("ast");
  });

  it("setProgram replaces the persisted ports when given, leaves them when not", () => {
    const { instance } = setup();
    const wider: Ports = {
      inputs: [
        { name: "p", type: Type.number },
        { name: "q", type: Type.number },
      ],
      outputs: [],
    };

    instance.setProgram(serialiseSource("output out = Add($p, $q)", wider));
    expect(instance.snapshot.get().program.ports).toEqual(wider);
    expect(instance.values.get()).toEqual({ p: 0, q: 0 });

    instance.setProgram(serialiseSource("output out = Add($p, 1)"));
    expect(instance.snapshot.get().program.ports).toEqual(wider); // untouched
  });

  it("refuses a program's own ports when nothing is persisted", () => {
    const { instance } = setup({ layers: [{ id: "h", ports: DOC, policy: Policy.host }] });
    expect(() => instance.setProgram(serialiseSource(SOURCE, DOC))).toThrow(/no persisted layer/);
  });

  it("dispose unregisters and stops publishing", () => {
    const { instance, runtime } = setup();
    const listener = vi.fn();
    instance.outputs.subscribe(listener);

    instance.dispose();
    expect(runtime.getOutputDependencies("doc")).toBeUndefined();
    runtime.updateInputs({ g: 3 });
    expect(listener).not.toHaveBeenCalled();
  });
});
