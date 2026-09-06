import { createStdlib, Type } from "@dendrite-lang/core";
import { describe, expect, it } from "vitest";

import { type Diagnostic, type RunResult, EditorSession } from "./session";

const language = () => {
  const lang = createStdlib();
  lang.registerInput({ name: "n", type: Type.number, default: 2 });
  lang.registerInput({ name: "flag", type: Type.boolean }); // no default → zero value
  lang.registerOutput({ name: "double", type: Type.number });
  return lang;
};

const output = (result: RunResult, name: string): unknown => result.outputs?.get(name);

describe("EditorSession", () => {
  it("seeds inputs from declared defaults, else the type's zero value", () => {
    const session = new EditorSession(language());
    expect(session.inputs.get()).toEqual({ n: 2, flag: false });
  });

  it("compile publishes diagnostics and outputs", () => {
    const session = new EditorSession(language());
    const diagnostics: Diagnostic[][] = [];
    const results: RunResult[] = [];
    session.diagnostics.subscribe((d) => diagnostics.push(d));
    session.outputs.subscribe((r) => results.push(r));

    session.compile("output double = $n * 2");

    expect(diagnostics).toEqual([[]]);
    expect(results).toHaveLength(1);
    expect(output(results[0], "double")).toBe(4);
    expect(session.outputs.get()).toBe(results[0]);
  });

  it("setInput updates the value and re-evaluates incrementally", () => {
    const session = new EditorSession(language());
    session.compile("output double = $n * 2");
    const seen: unknown[] = [];
    session.inputs.subscribe((values) => seen.push(values.n));

    session.setInput("n", 5);

    expect(seen).toEqual([5]);
    expect(session.inputs.get().n).toBe(5);
    expect(output(session.outputs.get(), "double")).toBe(10);
  });

  it("setInput before any compile only stores the value", () => {
    const session = new EditorSession(language());
    session.setInput("n", 7);
    expect(session.inputs.get().n).toBe(7);
    expect(session.outputs.get()).toEqual({ outputs: null, error: null });
  });

  it("a parse error yields located error diagnostics and no outputs", () => {
    const session = new EditorSession(language());
    session.compile("output double = $n *");

    const [diagnostic] = session.diagnostics.get();
    expect(diagnostic.severity).toBe("error");
    expect(diagnostic.line).toBe(1);
    expect(session.outputs.get()).toEqual({ outputs: null, error: null });
  });

  it("an analysis error yields error diagnostics and no outputs", () => {
    const session = new EditorSession(language());
    // `Foo(...)` parses as an application of the ref `Foo` (the grammar does not know op
    // names), so the analyser reports the undeclared reference, not an unknown op.
    session.compile("output double = Foo($n)");

    const kinds = session.diagnostics.get().map((d) => `${d.severity}:${d.kind}`);
    expect(kinds).toContain("error:undeclared_binding_reference");
    expect(session.outputs.get().outputs).toBeNull();
  });

  it("warnings do not block evaluation", () => {
    const session = new EditorSession(language());
    session.compile("let unused = 1\noutput double = $n * 2");

    const kinds = session.diagnostics.get().map((d) => `${d.severity}:${d.kind}`);
    expect(kinds).toEqual(["warning:unused_binding"]);
    expect(output(session.outputs.get(), "double")).toBe(4);
  });

  it("a failed recompile drops the runner so stale outputs cannot be re-run", () => {
    const session = new EditorSession(language());
    session.compile("output double = $n * 2");
    session.compile("output double = $n *"); // now broken
    session.setInput("n", 9);
    expect(session.outputs.get()).toEqual({ outputs: null, error: null });
  });
});

describe("EditorSession.setLanguage", () => {
  it("swaps the language in place: same observables, values carried over, new inputs seeded", () => {
    const session = new EditorSession(language());
    session.compile("output double = $n * 2");
    session.setInput("n", 5);
    const seen: unknown[] = [];
    session.inputs.subscribe((values) => seen.push(values));

    const next = createStdlib();
    next.registerInput({ name: "n", type: Type.number, default: 2 }); // kept: 5, not 2
    next.registerInput({ name: "extra", type: Type.string }); // new: seeded ""
    next.registerOutput({ name: "double", type: Type.number });
    session.setLanguage(next); // "flag" is gone

    expect(session.language).toBe(next);
    expect(session.inputs.get()).toEqual({ n: 5, extra: "" });
    expect(seen).toHaveLength(1);

    session.compile("output double = $n * 2");
    expect(output(session.outputs.get(), "double")).toBe(10);
  });

  it("leaves everything untouched when the new language is malformed", () => {
    const session = new EditorSession(language());
    const broken = createStdlib();
    broken.registerInput({ name: "bad", type: Type.name("Nope") }); // dangling type
    expect(() => session.setLanguage(broken)).toThrow(/Nope/);
    expect(session.inputs.get()).toEqual({ n: 2, flag: false });
  });
});
