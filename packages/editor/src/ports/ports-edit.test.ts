import { createStdlib, type Ports, Type } from "@dendrite-lang/core";
import { describe, expect, it } from "vitest";

import {
  addInput,
  addOutput,
  removeInput,
  removeOutput,
  typeFromLabel,
  typeOptions,
  typeOptionsFor,
  uniqueName,
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
    lang.registerType("Bus", {});
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

  it("offers the primitives with no vocabulary - a broken compose still allows a retype", () => {
    expect(typeOptions().map((o) => o.label)).toEqual([
      "number",
      "number[]",
      "boolean",
      "boolean[]",
      "string",
      "string[]",
      "any",
      "any[]",
    ]);
  });

  it("keeps a row's own type in its picker, even one the language no longer knows", () => {
    const lost = Type.name("Bus");
    const options = typeOptionsFor(createStdlib().descriptor, lost);
    expect(options[0]).toEqual({ label: "Bus", type: lost });
    // Already present → not duplicated.
    expect(
      typeOptionsFor(createStdlib().descriptor, Type.number).filter((o) => o.label === "number"),
    ).toHaveLength(1);
  });
});

describe("uniqueName", () => {
  it("takes the base when free, else the first free suffix", () => {
    expect(uniqueName([], "input")).toBe("input");
    expect(uniqueName(["input"], "input")).toBe("input2");
    expect(uniqueName(["input", "input2", "input3"], "input")).toBe("input4");
    // Gaps are filled rather than skipped.
    expect(uniqueName(["input", "input3"], "input")).toBe("input2");
  });
});
