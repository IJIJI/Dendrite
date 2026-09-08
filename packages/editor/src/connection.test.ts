import {
  createEnvironment,
  createStdlib,
  type Language,
  Policy,
  type PortLayer,
  type Runtime,
  serialiseSource,
  Type,
} from "@dendrite-lang/core";
import { describe, expect, it } from "vitest";

import { attach, joinRuntime, ownStack } from "./connection";
import { DOCUMENT_VERSION, type EditorDocument } from "./document";

// A host contract: one global input every program reads.
const HOST: PortLayer = {
  id: "host",
  ports: {
    inputs: [{ name: "g", type: Type.number }],
    outputs: [{ name: "out", type: Type.number }],
  },
  policy: Policy.host,
};

const document = (): EditorDocument => ({
  version: DOCUMENT_VERSION,
  program: serialiseSource("output out = Add($g, $p)", {
    inputs: [{ name: "p", type: Type.number }],
    outputs: [],
  }),
  inputValues: { p: 1 },
});

// Which programs a global change reached - the runtime's own view of who is registered.
const reached = (runtime: Runtime, g: number) => [...runtime.updateInputs({ g }).keys()];

function host(): { language: Language; runtime: Runtime } {
  const language = createStdlib();
  const runtime = createEnvironment(language).createRuntime({ layers: [HOST] });
  return { language, runtime };
}

describe("ownStack", () => {
  it("runs the document on a private stack and never touches the host's language", () => {
    const language = createStdlib();
    const opsBefore = [...language.descriptor.ops.keys()];
    const connection = ownStack({ document: document(), language, layers: { global: [HOST] } });

    expect(connection.instance.outputs.get().outputs?.get("out")).toBe(1); // g seeds 0, p is 1
    expect(connection.language).not.toBe(language);
    expect([...language.descriptor.ops.keys()]).toEqual(opsBefore);
    expect(() => connection.release?.()).not.toThrow();
  });
});

describe("joinRuntime", () => {
  it("registers the editor's program on the host runtime and unregisters it on release", () => {
    const { language, runtime } = host();
    const connection = joinRuntime(language, runtime, { document: document() });
    const id = connection.instance.id;

    expect(reached(runtime, 5)).toContain(id);
    expect(connection.instance.outputs.get().outputs?.get("out")).toBe(6); // it saw the host's g
    expect(connection.language).toBe(language);

    connection.release?.();
    expect(reached(runtime, 7)).not.toContain(id);
  });

  it("two editors on one runtime do not collide", () => {
    const { language, runtime } = host();
    const a = joinRuntime(language, runtime, { document: document() });
    const b = joinRuntime(language, runtime, { document: document() });
    expect(a.instance.id).not.toBe(b.instance.id);
    expect(reached(runtime, 1)).toEqual(expect.arrayContaining([a.instance.id, b.instance.id]));
  });
});

describe("attach", () => {
  it("drives the host's instance and leaves it running when released", () => {
    const { language, runtime } = host();
    const live = createEnvironment(language).createInstance(runtime, {
      program: document().program,
      id: "lighthouse",
    });
    const connection = attach(language, live);

    expect(connection.instance).toBe(live);
    expect(connection.release).toBeUndefined();
    connection.release?.();
    expect(reached(runtime, 3)).toContain("lighthouse"); // the point: closing the editor stops nothing
  });
});
