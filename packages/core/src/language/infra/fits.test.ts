import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createLanguage } from "../language";
import { valueFits } from "./fits";
import { Type } from "./types";

// A language with one of each: a primitive, a rule on a subtype, a struct, a struct that
// extends a struct, an opaque handle, and a struct whose field is a rule-bearing subtype.
const lang = createLanguage();
lang.registerType("Grade", { extends: "number", schema: z.number().int().min(0).max(10) });
lang.registerType("Bus", { fields: { id: Type.number, name: Type.string } });
lang.registerType("Line", { extends: "Bus", fields: { colour: Type.string } });
lang.registerType("Handle", {});
lang.registerType("Report", { fields: { grade: Type.name("Grade") } });
const fits = (value: unknown, type: Type) => valueFits(value, type, lang.descriptor);

describe("valueFits: a runtime value against a Type", () => {
  it("any fits everything, a null value fits every type", () => {
    expect(fits(5, Type.any)).toBe(true);
    expect(fits([1, "a"], Type.any)).toBe(true);
    expect(fits(null, Type.number)).toBe(true);
    expect(fits(null, Type.array(Type.name("Bus")))).toBe(true);
    expect(fits(null, Type.fn([], Type.number))).toBe(true);
    expect(fits(undefined, Type.string)).toBe(true);
  });

  it("a primitive is checked by its schema, so NaN and Infinity are not numbers", () => {
    expect(fits(5, Type.number)).toBe(true);
    expect(fits("5", Type.number)).toBe(false);
    expect(fits(NaN, Type.number)).toBe(false);
    expect(fits(Infinity, Type.number)).toBe(false);
    expect(fits("a", Type.string)).toBe(true);
    expect(fits(true, Type.boolean)).toBe(true);
    expect(fits(1, Type.boolean)).toBe(false);
  });

  it("a list fits when each item fits the element type", () => {
    expect(fits([1, 2], Type.array(Type.number))).toBe(true);
    expect(fits([], Type.array(Type.number))).toBe(true);
    expect(fits([1, null], Type.array(Type.number))).toBe(true);
    expect(fits([1, "a"], Type.array(Type.number))).toBe(false);
    expect(fits(5, Type.array(Type.number))).toBe(false);
    expect(fits([[1], [2, "a"]], Type.array(Type.array(Type.number)))).toBe(false);
  });

  it("a subtype applies every rule on its extends chain", () => {
    expect(fits(7, Type.name("Grade"))).toBe(true);
    expect(fits(11, Type.name("Grade"))).toBe(false); // Grade's own rule
    expect(fits(2.5, Type.name("Grade"))).toBe(false);
    expect(fits("7", Type.name("Grade"))).toBe(false); // number's rule, inherited
  });

  it("a struct needs each declared field present, and extra fields are fine", () => {
    const bus = Type.name("Bus");
    expect(fits({ id: 1, name: "one" }, bus)).toBe(true);
    expect(fits({ id: 1, name: "one", extra: true }, bus)).toBe(true);
    expect(fits({ id: 1, name: null }, bus)).toBe(true); // a field may be null
    expect(fits({ id: 1 }, bus)).toBe(false); // but it may not be missing
    expect(fits({}, bus)).toBe(false);
    expect(fits({ id: "1", name: "one" }, bus)).toBe(false);
    expect(fits(5, bus)).toBe(false);
    expect(fits([{ id: 1, name: "one" }], bus)).toBe(false);
  });

  it("a struct that extends a struct needs both sets of fields", () => {
    const line = Type.name("Line");
    expect(fits({ id: 1, name: "one", colour: "red" }, line)).toBe(true);
    expect(fits({ colour: "red" }, line)).toBe(false);
    expect(fits({ id: 1, name: "one" }, line)).toBe(false);
  });

  it("a field's own rules apply through the struct", () => {
    expect(fits({ grade: 7 }, Type.name("Report"))).toBe(true);
    expect(fits({ grade: 11 }, Type.name("Report"))).toBe(false);
  });

  it("a type with no fields and no schema fits anything: an opaque handle", () => {
    expect(fits(5, Type.name("Handle"))).toBe(true);
    expect(fits({ anything: true }, Type.name("Handle"))).toBe(true);
  });

  it("a function type never fits, and neither does a name nothing registered", () => {
    expect(fits(() => 1, Type.fn([], Type.number))).toBe(false);
    expect(fits(5, Type.name("Nope"))).toBe(false);
    expect(() => fits(5, Type.name("Nope"))).not.toThrow();
  });

  it("the null type: only null fits it", () => {
    expect(fits(null, Type.null)).toBe(true);
    expect(fits(0, Type.null)).toBe(false);
  });
});
