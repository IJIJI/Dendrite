import { describe, expect, it } from "vitest";
import { z } from "zod";

import { Type } from "../infra/types";
import { createLanguage } from "../language";
import { defaultValueFor } from "./seed";

const lang = createLanguage();
lang.registerType("Score", z.number(), { extends: "number" });
lang.registerType("Grade", z.number(), { extends: "Score" });
lang.registerType("Bus", z.unknown(), { fields: { n: Type.number } });
lang.registerType("Route", z.unknown(), { default: { stops: [] } });
lang.registerType("Loop", z.unknown(), { extends: "Loop" });
const d = lang.descriptor;

describe("defaultValueFor", () => {
  it("takes the input's own default first, null included", () => {
    expect(defaultValueFor({ name: "x", type: Type.number, default: 45 }, d)).toBe(45);
    expect(defaultValueFor({ name: "x", type: Type.number, default: null }, d)).toBe(null);
  });

  it("falls back to the type's default, walking extends upward", () => {
    expect(defaultValueFor({ name: "x", type: Type.number }, d)).toBe(0);
    expect(defaultValueFor({ name: "x", type: Type.boolean }, d)).toBe(false);
    expect(defaultValueFor({ name: "x", type: Type.string }, d)).toBe("");
    expect(defaultValueFor({ name: "x", type: Type.name("Score") }, d)).toBe(0);
    expect(defaultValueFor({ name: "x", type: Type.name("Grade") }, d)).toBe(0);
    expect(defaultValueFor({ name: "x", type: Type.name("Route") }, d)).toEqual({ stops: [] });
  });

  it("seeds arrays empty and everything without a default as null", () => {
    expect(defaultValueFor({ name: "x", type: Type.array(Type.number) }, d)).toEqual([]);
    expect(defaultValueFor({ name: "x", type: Type.name("Bus") }, d)).toBe(null); // opaque
    expect(defaultValueFor({ name: "x", type: Type.name("Nope") }, d)).toBe(null); // unknown
    expect(defaultValueFor({ name: "x", type: Type.any }, d)).toBe(null);
    expect(defaultValueFor({ name: "x", type: Type.fn([Type.number], Type.number) }, d)).toBe(null);
    expect(defaultValueFor({ name: "x", type: Type.name("Loop") }, d)).toBe(null); // cycle
  });
});
