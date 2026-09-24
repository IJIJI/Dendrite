import { describe, expect, it } from "vitest";
import { Convert } from "./convert";

// The rules themselves are pinned through the ops (evaluator.test.ts, "conversion ops"). This
// pins the export a host reaches for, and the one thing the ops cannot show: `undefined`.
describe("Convert: the conversion rules, as a host op sees them", () => {
  it("toString", () => {
    expect(Convert.toString(undefined)).toBe("");
    expect(Convert.toString(1.5)).toBe("1.5");
    expect(Convert.toString({ a: 1 })).toBe('{"a":1}');
  });

  it("toNumber", () => {
    expect(Convert.toNumber(" 42 ")).toBe(42);
    expect(Convert.toNumber("0x10")).toBeNull();
    expect(Convert.toNumber(undefined)).toBeNull();
  });

  it("toBool", () => {
    expect(Convert.toBool([])).toBe(false);
    expect(Convert.toBool([0])).toBe(true);
    expect(Convert.toBool(undefined)).toBe(false);
  });
});
