import { describe, expect, it } from "vitest";
import { hint, nearest } from "./nearest";

describe("nearest: the name a diagnostic suggests", () => {
  it("finds a name one edit away, and two; a transposition is one edit", () => {
    expect(nearest("totl", ["total"])).toBe("total");
    expect(nearest("Lenght", ["Length"])).toBe("Length");
    expect(nearest("Lengthh", ["Length"])).toBe("Length");
    expect(nearest("Lengt", ["Length"])).toBe("Length");
    expect(nearest("Flitre", ["Filter", "Find"])).toBe("Filter"); // two transpositions
  });

  it("gives nothing for three edits, or an empty list", () => {
    expect(nearest("Lengthhhh", ["Length"])).toBeUndefined();
    expect(nearest("Lengxyz", ["Length"])).toBeUndefined();
    expect(nearest("zzzzzz", ["total", "Length"])).toBeUndefined();
    expect(nearest("total", [])).toBeUndefined();
  });

  it("a short name takes one edit only, and a single letter none", () => {
    expect(nearest("m", ["n"])).toBeUndefined();
    expect(nearest("ab", ["abc"])).toBe("abc");
    expect(nearest("nmae", ["name"])).toBe("name");
    expect(nearest("abcd", ["abxy"])).toBeUndefined();
  });

  it("takes the closest, and the earlier candidate on a tie", () => {
    expect(nearest("Fiter", ["Fit", "Filter"])).toBe("Filter");
    expect(nearest("ac", ["ab", "ad"])).toBe("ab");
  });

  it("ignores case, and never suggests the name itself", () => {
    expect(nearest("length", ["Length"])).toBe("Length");
    expect(nearest("x", ["x"])).toBeUndefined();
  });

  it("hint is the sentence to append, or nothing", () => {
    expect(hint("totl", ["total"])).toBe(" Did you mean 'total'?");
    expect(hint("zzz", ["total"])).toBe("");
  });
});
