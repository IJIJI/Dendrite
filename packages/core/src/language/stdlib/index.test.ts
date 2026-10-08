import { describe, expect, it } from "vitest";

import { createEnvironment } from "../environment";
import { createLanguage, type Language } from "../language";
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
  symbols: [...lang.grammar.symbols].sort(),
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
