import { describe, expect, it } from "vitest";

import { analyse, getOutputType } from "./analyser/analyser";
import { composeLayers, type PortProblem } from "./compose";
import { type PortLayer, type Ports, Policy } from "./infra/ports";
import { Type } from "./infra/types";
import { createLanguage, parseSource } from "./language";
import { createStdlib } from "./stdlib";
import { withPorts } from "../testing";

const layer = (id: string, ports: Partial<Ports>, policy = Policy.user): PortLayer => ({
  id,
  ports: { inputs: [], outputs: [], ...ports },
  policy,
});

const problemsOf = (result: ReturnType<typeof composeLayers>): PortProblem[] =>
  result.ok ? [] : result.problems;

describe("composeLayers", () => {
  it("stacks a layer onto the language and records where every port came from", () => {
    const host = layer(
      "host",
      {
        types: [{ name: "Bus", fields: { state: Type.string } }],
        inputs: [{ name: "busses", type: Type.array(Type.name("Bus")) }],
        outputs: [{ name: "tally", type: Type.string, mode: "required" }],
      },
      Policy.host,
    );
    const doc = layer("document", { inputs: [{ name: "threshold", type: Type.number }] });

    const result = composeLayers(createStdlib().descriptor, [host], [doc]);
    if (!result.ok) throw new Error(JSON.stringify(result.problems));
    const { descriptor, provenance } = result;

    expect(descriptor.types.get("Bus")).toMatchObject({
      name: "Bus",
      fields: { state: Type.string },
    });
    expect(descriptor.types.get("number")).toBeDefined(); // language types stay
    expect(descriptor.inputs.get("busses")?.type).toEqual(Type.array(Type.name("Bus")));
    expect(descriptor.outputs.get("tally")?.mode).toBe("required");
    expect(provenance.types.get("Bus")).toEqual({ layerId: "host", level: "global" });
    expect(provenance.inputs.get("busses")).toEqual({ layerId: "host", level: "global" });
    expect(provenance.inputs.get("threshold")).toEqual({ layerId: "document", level: "program" });
    expect(provenance.outputs.get("tally")).toEqual({ layerId: "host", level: "global" });
  });

  it("keeps ops and evaluators by reference and never mutates the language descriptor", () => {
    const lang = createStdlib();
    const before = lang.descriptor.inputs.size;
    const result = composeLayers(
      lang.descriptor,
      [],
      [layer("d", { inputs: [{ name: "x", type: Type.number }] })],
    );
    expect(result.ok && result.descriptor.ops).toBe(lang.descriptor.ops);
    expect(lang.descriptor.inputs.size).toBe(before);
  });

  it("flags a name declared twice in one layer", () => {
    const result = composeLayers(
      createStdlib().descriptor,
      [],
      [
        layer("d", {
          inputs: [
            { name: "x", type: Type.number },
            { name: "x", type: Type.string },
          ],
        }),
      ],
    );
    expect(problemsOf(result)).toEqual([
      expect.objectContaining({ kind: "duplicate_name", layerId: "d", where: "input x" }),
    ]);
  });

  it("attributes a shadowed name to the later layer and names both", () => {
    const host = layer("host", { inputs: [{ name: "x", type: Type.number }] }, Policy.host);
    const doc = layer("document", { inputs: [{ name: "x", type: Type.number }] });
    const [problem] = problemsOf(composeLayers(createStdlib().descriptor, [host], [doc]));
    expect(problem).toMatchObject({ kind: "shadowed_name", layerId: "document", where: "input x" });
    expect(problem?.message).toContain("layer 'host'");

    // two global layers: still the later one
    const second = layer("lighthouse", { inputs: [{ name: "x", type: Type.number }] }, Policy.host);
    expect(
      problemsOf(composeLayers(createStdlib().descriptor, [host, second], []))[0],
    ).toMatchObject({
      kind: "shadowed_name",
      layerId: "lighthouse",
    });
  });

  it("refuses a layer type that shadows a language type", () => {
    const [problem] = problemsOf(
      composeLayers(createStdlib().descriptor, [], [layer("d", { types: [{ name: "number" }] })]),
    );
    expect(problem).toMatchObject({ kind: "shadowed_name", layerId: "d", where: "type number" });
    expect(problem?.message).toContain("the language");
  });

  it("reports an unknown type through an array, attributed to the declaring layer", () => {
    const [problem] = problemsOf(
      composeLayers(
        createStdlib().descriptor,
        [],
        [layer("d", { inputs: [{ name: "a", type: Type.array(Type.name("Nope")) }] })],
      ),
    );
    expect(problem).toMatchObject({ kind: "unknown_type", layerId: "d", where: "input a" });
    expect(problem?.message).toContain("Nope");
  });

  it("rejects names the lexer would not read as one identifier", () => {
    const result = composeLayers(
      createStdlib().descriptor,
      [],
      [
        layer("d", {
          inputs: [{ name: "1st", type: Type.number }],
          outputs: [{ name: "true", type: Type.boolean }],
        }),
      ],
    );
    expect(problemsOf(result).map((p) => [p.kind, p.where])).toEqual([
      ["invalid_name", "input 1st"],
      ["invalid_name", "output true"],
    ]);
  });

  it("attributes an unsound field override to the layer type that declares it", () => {
    const [problem] = problemsOf(
      composeLayers(
        createStdlib().descriptor,
        [],
        [
          layer("d", {
            types: [
              { name: "Base", fields: { state: Type.string } },
              { name: "Derived", extends: "Base", fields: { state: Type.number } },
            ],
          }),
        ],
      ),
    );
    expect(problem).toMatchObject({
      kind: "incompatible_field_override",
      layerId: "d",
      where: "type Derived",
    });
  });

  it("collects every problem, not just the first", () => {
    const result = composeLayers(
      createStdlib().descriptor,
      [],
      [
        layer("d", {
          inputs: [
            { name: "1st", type: Type.number },
            { name: "b", type: Type.name("Nope") },
          ],
        }),
      ],
    );
    expect(problemsOf(result).map((p) => p.kind)).toEqual(["invalid_name", "unknown_type"]);
  });

  it("carries a layer type's default into the descriptor", () => {
    const result = composeLayers(
      createStdlib().descriptor,
      [],
      [layer("d", { types: [{ name: "Mode", extends: "string", default: "idle" }] })],
    );
    expect(result.ok && result.descriptor.types.get("Mode")?.default).toBe("idle");
  });

  it("throws on a duplicate layer id (a configuration bug, not a port problem)", () => {
    const a = layer("same", {});
    expect(() => composeLayers(createStdlib().descriptor, [a], [a])).toThrow(/Duplicate layer id/);
  });

  it("yields a descriptor the analyser types inputs against", () => {
    const lang = createStdlib();
    const parsed = parseSource("output out = $x", lang);
    if (!parsed.ok) throw new Error("parse failed");

    const bare = analyse(parsed.program, lang.descriptor);
    expect(bare.errors.map((e) => e.kind)).toContain("unknown_program_input");

    const composed = withPorts(lang, {
      inputs: [{ name: "x", type: Type.number }],
      outputs: [{ name: "out", type: Type.number }],
    });
    const typed = analyse(parsed.program, composed);
    expect(typed.ok).toBe(true);
    const out = typed.program.outputs.get("out");
    expect(out && getOutputType(out)).toEqual(Type.number);
  });

  it("withPorts fails loudly on a broken fixture", () => {
    expect(() =>
      withPorts(createLanguage(), {
        inputs: [{ name: "x", type: Type.name("Nope") }],
        outputs: [],
      }),
    ).toThrow(/input x/);
  });
});
