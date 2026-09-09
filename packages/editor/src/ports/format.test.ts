import { describe, expect, it } from "vitest";

import { formatValue } from "./format";

describe("formatValue", () => {
  it("renders data as JSON, one line by default", () => {
    expect(formatValue(42)).toBe("42");
    expect(formatValue("Fail")).toBe('"Fail"');
    expect(formatValue(null)).toBe("null");
    expect(formatValue({ a: [1, 2] })).toBe('{"a":[1,2]}');
  });

  it("pretty-prints with an indent", () => {
    expect(formatValue({ a: 1 }, 2)).toBe('{\n  "a": 1\n}');
  });

  it("marks the values JSON has no text for", () => {
    expect(formatValue(() => 1)).toBe("ƒ (function value)");
    expect(formatValue(undefined)).toBe("undefined");
    expect(formatValue(Symbol("s"))).toBe("Symbol(s)");
  });
});
