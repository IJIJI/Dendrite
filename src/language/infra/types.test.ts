import { describe, expect, it } from "vitest";
import { Type, typeToString, typesEqual, isAny, isAnyOrNull, elementOf } from "./types";

describe("typeToString", () => {
  it("named types", () => {
    expect(typeToString(Type.number)).toBe("number");
    expect(typeToString(Type.name("Source"))).toBe("Source");
  });

  it("arrays nest", () => {
    expect(typeToString(Type.array(Type.number))).toBe("number[]");
    expect(typeToString(Type.array(Type.array(Type.boolean)))).toBe("boolean[][]");
  });

  it("function types use ->", () => {
    expect(typeToString(Type.fn([Type.number, Type.boolean], Type.string))).toBe(
      "(number, boolean) -> string",
    );
    expect(typeToString(Type.fn([], Type.number))).toBe("() -> number");
    expect(typeToString(Type.fn([Type.fn([Type.number], Type.boolean)], Type.string))).toBe(
      "((number) -> boolean) -> string",
    );
  });
});

describe("typesEqual", () => {
  it("structural equality within a kind", () => {
    expect(typesEqual(Type.number, Type.number)).toBe(true);
    expect(typesEqual(Type.number, Type.boolean)).toBe(false);
    expect(typesEqual(Type.array(Type.number), Type.array(Type.number))).toBe(true);
    expect(typesEqual(Type.array(Type.number), Type.array(Type.boolean))).toBe(false);
    expect(
      typesEqual(Type.fn([Type.number], Type.boolean), Type.fn([Type.number], Type.boolean)),
    ).toBe(true);
    expect(
      typesEqual(Type.fn([Type.number], Type.boolean), Type.fn([Type.string], Type.boolean)),
    ).toBe(false);
  });

  it("different kinds are unequal", () => {
    expect(typesEqual(Type.number, Type.array(Type.number))).toBe(false);
  });
});

describe("type predicates / accessors", () => {
  it("isAny / isAnyOrNull", () => {
    expect(isAny(Type.any)).toBe(true);
    expect(isAny(Type.null)).toBe(false);
    expect(isAny(Type.number)).toBe(false);
    expect(isAnyOrNull(Type.any)).toBe(true);
    expect(isAnyOrNull(Type.null)).toBe(true);
    expect(isAnyOrNull(Type.number)).toBe(false);
  });

  it("elementOf returns the array element, else any", () => {
    expect(elementOf(Type.array(Type.number))).toEqual(Type.number);
    expect(elementOf(Type.number)).toEqual(Type.any);
    expect(elementOf(undefined)).toEqual(Type.any);
  });
});
