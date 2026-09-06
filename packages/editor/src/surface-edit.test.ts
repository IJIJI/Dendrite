import { createStdlib, Type } from "@dendrite-lang/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { type SurfaceSpec } from "./surface";
import {
  addInput,
  addOutput,
  removeInput,
  removeOutput,
  typeFromLabel,
  typeOptions,
  updateInput,
  updateOutput,
  validateSurface,
} from "./surface-edit";

const base: SurfaceSpec = {
  inputs: [{ name: "score", type: Type.number, default: 45 }],
  outputs: [{ name: "result", type: Type.string }],
};

describe("surface edits are pure", () => {
  it("add / update / remove inputs return new specs and leave the old one alone", () => {
    const added = addInput(base, { name: "bonus", type: Type.number });
    expect(added.inputs.map((i) => i.name)).toEqual(["score", "bonus"]);
    expect(base.inputs).toHaveLength(1);

    const updated = updateInput(added, "score", { default: 60 });
    expect(updated.inputs[0]).toEqual({ name: "score", type: Type.number, default: 60 });
    expect(added.inputs[0]!.default).toBe(45);

    const removed = removeInput(updated, "score");
    expect(removed.inputs.map((i) => i.name)).toEqual(["bonus"]);
    expect(removed.outputs).toBe(base.outputs); // untouched parts are shared, not copied
  });

  it("add / update / remove outputs", () => {
    const added = addOutput(base, { name: "final", type: Type.number, mode: "required" });
    const updated = updateOutput(added, "final", { mode: "desired" });
    expect(updated.outputs[1]).toEqual({ name: "final", type: Type.number, mode: "desired" });
    expect(removeOutput(updated, "result").outputs.map((o) => o.name)).toEqual(["final"]);
  });
});

describe("validateSurface", () => {
  const descriptor = createStdlib().descriptor;

  it("accepts a well-formed surface", () => {
    expect(validateSurface(base, descriptor)).toEqual([]);
  });

  it("rejects bad names, duplicates and host-provided names", () => {
    const provided: SurfaceSpec = { inputs: [{ name: "busses", type: Type.any }], outputs: [] };
    const user: SurfaceSpec = {
      inputs: [
        { name: "1st", type: Type.number },
        { name: "x", type: Type.number },
        { name: "x", type: Type.string },
        { name: "busses", type: Type.any },
      ],
      outputs: [],
    };
    expect(validateSurface(user, descriptor, provided).map((p) => p.kind)).toEqual([
      "invalid_name",
      "duplicate_name",
      "reserved_name",
    ]);
  });

  it("rejects types the language does not know, through arrays", () => {
    const user: SurfaceSpec = {
      inputs: [{ name: "a", type: Type.array(Type.name("Bus")) }],
      outputs: [{ name: "b", type: Type.fn([Type.number], Type.number) }],
    };
    const problems = validateSurface(user, descriptor);
    expect(problems.map((p) => [p.kind, p.where])).toEqual([
      ["unknown_type", "input a"],
      ["unknown_type", "output b"],
    ]);
    // ...unless the surface declares the type itself
    const withType = { ...user, outputs: [], types: [{ name: "Bus" }] };
    expect(validateSurface(withType, descriptor)).toEqual([]);
  });
});

describe("typeOptions", () => {
  it("offers builtins first, then registered types, each with its list form; never null", () => {
    const lang = createStdlib();
    lang.registerType("Bus", z.unknown(), {});
    const labels = typeOptions(lang.descriptor).map((o) => o.label);
    expect(labels.slice(0, 4)).toEqual(["number", "number[]", "boolean", "boolean[]"]);
    expect(labels).toContain("Bus");
    expect(labels).toContain("Bus[]");
    expect(labels).not.toContain("null");
    expect(typeFromLabel(typeOptions(lang.descriptor), "Bus[]")).toEqual(
      Type.array(Type.name("Bus")),
    );
    expect(typeFromLabel(typeOptions(lang.descriptor), "nope")).toBeUndefined();
  });
});
