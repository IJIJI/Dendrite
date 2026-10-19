import { describe, expect, it } from "vitest";

import { createEnvironment } from "../environment";
import { createLanguage, type Language, symbolsOf } from "../language";
import { createStdlib, type StdlibSegment } from "./index";

//? createStdlib({ segments }): a host takes part of the library. What is pinned here is the
// contract of that choice - every segment stands alone, an op and a symbol come with their
// segment and leave with it - not what any op computes (evaluator.test.ts does that).

// Written out rather than read from the library: this is the public list, and a segment that
// is added without a line here fails the first test.
const ALL: StdlibSegment[] = [
  "logic",
  "control",
  "array",
  "arithmetic",
  "list",
  "conversion",
  "string",
];

const names = (lang: Language) => ({
  ops: [...lang.descriptor.ops.keys()],
  evaluators: [...lang.descriptor.evaluators.keys()],
  symbols: [...symbolsOf(lang.grammar)].sort(),
});

// `output r` on a library of these segments: the stage that refused it, the kind of every
// error (compile is ok with errors on its list when an output was dropped), and the value.
function run(segments: StdlibSegment[], source: string) {
  const composed = createEnvironment(createStdlib({ segments })).forProgram([], []);
  if (!composed.ok) throw new Error(`[${segments.join(", ")}] does not compose`);
  const result = composed.environment.compile(source);
  return {
    stage: result.ok ? undefined : result.stage,
    errors: result.errors.map((error) => error.kind),
    value: result.ok ? composed.environment.run(result.program, {}).get("r") : undefined,
  };
}

describe("createStdlib({ segments })", () => {
  it("installs every segment when none is named", () => {
    expect(names(createStdlib())).toEqual(names(createStdlib({ segments: ALL })));
  });

  it("installs in the library's order, whatever order the list is in", () => {
    const reversed = createStdlib({ segments: [...ALL].reverse() });
    expect(names(reversed)).toEqual(names(createStdlib()));
  });

  it("an empty list is the bare language", () => {
    expect(names(createStdlib({ segments: [] }))).toEqual(names(createLanguage()));
  });

  for (const segment of ALL) {
    // The reference page of a segment is the ops whose `category` is its name, so an op filed
    // under another name would be installed and documented nowhere.
    it(`${segment}: every op it installs carries its name as category`, () => {
      const ops = [...createStdlib({ segments: [segment] }).descriptor.ops.values()];
      expect(ops.length).toBeGreaterThan(0);
      expect(ops.filter((op) => op.category !== segment).map((op) => op.name)).toEqual([]);
    });

    // createEnvironment validates the vocabulary (every op has its evaluator, every flag is
    // legal) and throws when it does not hold; composing with no layers is the rest of it.
    it(`${segment}: stands alone`, () => {
      const env = createEnvironment(createStdlib({ segments: [segment] }));
      expect(env.forProgram([], []).ok).toBe(true);
    });
  }

  // The edge that put the comparison ops in logic: `>=` is Not(LessThan(…)), two ops of one
  // segment, so no segment needs another for its own symbols.
  it("logic alone has >=", () => {
    expect(run(["logic"], "output r = 1 >= 2")).toEqual({ errors: [], value: false });
  });

  it("string alone has ++ and the template, both sugar over Join", () => {
    expect(run(["string"], 'output r = "a" ++ 1')).toEqual({ errors: [], value: "a1" });
    expect(run(["string"], "output r = `n = {1}`")).toEqual({ errors: [], value: "n = 1" });
  });

  it("leaves out the ops of a segment that was not chosen", () => {
    expect(createStdlib({ segments: ["logic"] }).descriptor.ops.has("Length")).toBe(false);
    // A name that is no op reads as a binding, as any unknown name does.
    expect(run(["logic"], "output r = Length([1])").errors).toEqual([
      "undeclared_binding_reference",
    ]);
  });

  it("a symbol leaves with its segment", () => {
    // Negative numbers are Negate's: the lexer learns `-` from the grammar, and without
    // arithmetic nothing registers it.
    expect(run(["logic"], "output r = -14")).toMatchObject({
      stage: "parse",
      errors: ["unknown_character"],
    });
    expect(run(["arithmetic"], "output r = -14")).toEqual({ errors: [], value: -14 });
    // The lexer cuts a template whatever the language; the rule that reads it is string's.
    expect(run(["logic"], "output r = `n`")).toMatchObject({
      stage: "parse",
      errors: ["unexpected_token"],
    });
  });

  // The finite check on an evaluator's result is off (`finiteCheck: false`) on the promise that
  // no number it returns, at any depth, is a NaN or an infinity. The library says so where its
  // result cannot hold one: the ops that hand values on, because what they hand on was read by
  // the evaluator already; `Range`, whose items are whole numbers between two finite bounds; and
  // `Split`, whose items are text.
  // Every other op's result is a bare number, read anyway. A new op that returns a list, a
  // struct or `any` has to decide, and lands here.
  it("the evaluators whose result cannot hold a NaN turn the finite check off, and no other", () => {
    const marked = [...createStdlib().descriptor.evaluators.values()]
      .filter((evaluator) => evaluator.finiteCheck === false)
      .map((evaluator) => evaluator.op)
      .sort();
    expect(marked).toEqual([
      "At",
      "Concat",
      "Default",
      "Filter",
      "Find",
      "First",
      "Flatten",
      "If",
      "Last",
      "Map",
      "Range",
      "Reduce",
      "Reverse",
      "Slice",
      "Sort",
      "Split",
      "Unique",
    ]);
  });

  it("refuses a segment name it does not know", () => {
    expect(() => createStdlib({ segments: ["maths" as StdlibSegment] })).toThrow(
      "unknown segment 'maths'",
    );
    // A name every object has is no segment either.
    expect(() => createStdlib({ segments: ["toString" as StdlibSegment] })).toThrow(
      "unknown segment 'toString'",
    );
  });
});
