import { createStdlib, type Ports, Type } from "@dendrite-lang/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  addInput,
  addOutput,
  removeInput,
  removeOutput,
  typeFromLabel,
  typeOptions,
  updateInput,
  updateOutput,
} from "./ports-edit";

const base: Ports = {
  inputs: [{ name: "score", type: Type.number, default: 45 }],
  outputs: [{ name: "result", type: Type.string }],
};

describe("port edits are pure", () => {
  it("add / update / remove inputs return new specs and leave the old one alone", () => {
    const added = addInput(base, { name: "bonus", type: Type.number });
    expect(added.inputs.map((i: { name: string }) => i.name)).toEqual(["score", "bonus"]);
    expect(base.inputs).toHaveLength(1);

    const updated = updateInput(added, "score", { default: 60 });
    expect(updated.inputs[0]).toEqual({ name: "score", type: Type.number, default: 60 });
    expect(added.inputs[0]!.default).toBe(45);

    const removed = removeInput(updated, "score");
    expect(removed.inputs.map((i: { name: string }) => i.name)).toEqual(["bonus"]);
    expect(removed.outputs).toBe(base.outputs); // untouched parts are shared, not copied
  });

  it("add / update / remove outputs", () => {
    const added = addOutput(base, { name: "final", type: Type.number, mode: "required" });
    const updated = updateOutput(added, "final", { mode: "desired" });
    expect(updated.outputs[1]).toEqual({ name: "final", type: Type.number, mode: "desired" });
    expect(removeOutput(updated, "result").outputs.map((o: { name: string }) => o.name)).toEqual([
      "final",
    ]);
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
