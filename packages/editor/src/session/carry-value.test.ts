import {
  createEnvironment,
  createStdlib,
  createSubject,
  Policy,
  type ProgramDiagnostic,
  type ProgramInstance,
  serialiseSource,
  type Snapshot,
  Type,
} from "@dendrite-lang/core";
import { describe, expect, it, vi } from "vitest";

import { carryValue } from "./carry-value";

const DOC = { inputs: [{ name: "p", type: Type.number }], outputs: [] };

function instance() {
  const env = createEnvironment(createStdlib());
  const runtime = env.createRuntime({
    layers: [
      {
        id: "host",
        ports: { inputs: [{ name: "g", type: Type.number }], outputs: [] },
        policy: Policy.host,
      },
    ],
  });
  return env.createInstance(runtime, { program: serialiseSource("output out = $p", DOC), id: "i" });
}

describe("carryValue, in-process", () => {
  it("re-sets the value once the rename is published - synchronously, after the recompile", () => {
    const i = instance();
    i.setInput("p", 7);
    carryValue(i, "q", 7, () =>
      i.setLayer("document", { inputs: [{ name: "q", type: Type.number }], outputs: [] }),
    );
    expect(i.values.get()).toEqual({ q: 7 });
    expect(i.snapshot.get().inputValues).toEqual({ q: 7 });
  });

  it("gives up on a refused change, and does not fire on a later change that declares the name", () => {
    const i = instance();
    // Refused: `g` is the host's. Nothing moves; a `refused` diagnostic is what is published.
    carryValue(i, "g", 99, () =>
      i.setLayer("document", { inputs: [{ name: "g", type: Type.number }], outputs: [] }),
    );
    expect(i.values.get()).toEqual({ p: 0 });
    // A later change that adds `q` must not inherit a stale watch for it.
    carryValue(i, "q", 99, () =>
      i.setLayer("document", { inputs: [{ name: "g", type: Type.number }], outputs: [] }),
    );
    i.setLayer("document", {
      inputs: [
        { name: "p", type: Type.number },
        { name: "q", type: Type.number },
      ],
      outputs: [],
    });
    expect(i.values.get()).toEqual({ p: 0, q: 0 });
  });
});

describe("carryValue, over a wire", () => {
  // A replica: the change only sends; diagnostics and the snapshot arrive as later pushes.
  function replica() {
    const snapshot = createSubject<Snapshot>({ program: serialiseSource(""), inputValues: {} });
    const diagnostics = createSubject<readonly ProgramDiagnostic[]>([]);
    const setInput = vi.fn();
    const fake = { snapshot, diagnostics, setInput } as unknown as ProgramInstance;
    const refused: ProgramDiagnostic = {
      severity: "error",
      stage: "ports",
      kind: "duplicate_name",
      message: "",
      refused: true,
    };
    return {
      fake,
      setInput,
      declare: (...names: string[]) =>
        snapshot.set({
          program: serialiseSource("", {
            inputs: names.map((name) => ({ name, type: Type.number })),
            outputs: [],
          }),
          inputValues: {},
        }),
      applied: () => diagnostics.set([]),
      refuse: () => diagnostics.set([refused]),
    };
  }

  it("waits past the diagnostics push for the snapshot, then sets the value exactly once", () => {
    const { fake, setInput, declare, applied } = replica();
    const change = vi.fn();
    carryValue(fake, "q", 7, change);
    expect(change).toHaveBeenCalledOnce();
    applied(); // an applied change publishes its diagnostics BEFORE its snapshot
    expect(setInput).not.toHaveBeenCalled();
    declare("q");
    expect(setInput).toHaveBeenCalledExactlyOnceWith("q", 7);
    declare("q"); // a later push changes nothing
    expect(setInput).toHaveBeenCalledOnce();
  });

  it("a refused diagnostic means the change moved nothing: give up", () => {
    const { fake, setInput, declare, refuse } = replica();
    carryValue(fake, "q", 7, () => {});
    refuse();
    declare("q");
    expect(setInput).not.toHaveBeenCalled();
  });
});
