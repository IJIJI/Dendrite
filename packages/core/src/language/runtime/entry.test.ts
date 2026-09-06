import { describe, expect, it } from "vitest";

import { analyse } from "../analyser/analyser";
import { EvalError } from "../evaluator/types";
import { type CNode } from "../infra/nodes";
import { EMPTY_PORTS, type PortLayer, type Ports, Policy } from "../infra/ports";
import { Type } from "../infra/types";
import { type Language, parseSource } from "../language";
import { createStdlib } from "../stdlib";
import { withLayers } from "../../testing";
import { type BoundProgram, ProgramEntry } from "./entry";

// A stdlib language plus a `Boom` op that throws once its input goes positive, so a default
// valued evaluation is fine and a later program-level change errors.
function makeLang(): Language {
  const lang = createStdlib();
  lang.registerOp({
    name: "Boom",
    inputs: [{ name: "n", type: Type.number }],
    output: Type.number,
    category: "test",
  });
  lang.registerEvaluator({
    op: "Boom",
    evaluate: ({ n }) => {
      if ((n as number) > 0) throw new Error("boom");
      return n;
    },
  });
  return lang;
}

const HOST: PortLayer = {
  id: "host",
  ports: {
    inputs: [{ name: "g", type: Type.number }],
    outputs: [{ name: "out", type: Type.number }],
  },
  policy: Policy.host,
};

const NO_GLOBALS: ReadonlyMap<string, unknown> = new Map();

// Compile `src` against HOST plus one program-level layer of `ports`.
function bind(lang: Language, src: string, ports: Ports): BoundProgram {
  const composed = withLayers(lang, [HOST], [{ id: "doc", ports, policy: Policy.user }]);
  const parsed = parseSource(src, lang);
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
  const analysed = analyse(parsed.program, composed);
  if (!analysed.ok) throw new Error(JSON.stringify(analysed.errors));
  return { program: analysed.program, ports, composed };
}

const outOf = (entry: ProgramEntry, changed?: Set<string>): unknown => {
  const result = entry.evaluate(changed);
  if (!result.ok) throw result.error;
  return result.outputs.get("out");
};

const P: Ports = { inputs: [{ name: "p", type: Type.number }], outputs: [] };

describe("ProgramEntry", () => {
  it("seeds every input from its default, then overlays the runtime's global values", () => {
    const lang = makeLang();
    const bound = bind(lang, "output out = Add($g, $p)", P);
    expect(outOf(new ProgramEntry("e", bound, NO_GLOBALS))).toBe(0);
    expect(outOf(new ProgramEntry("e", bound, new Map([["g", 5]])))).toBe(5);
  });

  it("resolves program-layer types through the composed descriptor when seeding", () => {
    const lang = makeLang();
    const score = bind(lang, "output out = Add($s, 1)", {
      types: [{ name: "Score", extends: "number" }],
      inputs: [{ name: "s", type: Type.name("Score") }],
      outputs: [],
    });
    expect(outOf(new ProgramEntry("e", score, NO_GLOBALS))).toBe(1);

    const bus = bind(lang, "output out = $b.n", {
      types: [{ name: "Bus", fields: { n: Type.number }, default: { n: 7 } }],
      inputs: [{ name: "b", type: Type.name("Bus") }],
      outputs: [],
    });
    expect(outOf(new ProgramEntry("e", bus, NO_GLOBALS))).toBe(7);
  });

  it("indexes only the global names its outputs depend on", () => {
    const entry = new ProgramEntry(
      "e",
      bind(makeLang(), "output out = Add($g, $p)", P),
      NO_GLOBALS,
    );
    expect(entry.indexedNames()).toEqual(new Set(["g"]));
  });

  it("setInput accepts program-level names only and feeds the next evaluation", () => {
    const entry = new ProgramEntry(
      "e",
      bind(makeLang(), "output out = Add($g, $p)", P),
      new Map([["g", 5]]),
    );
    expect(() => entry.setInput("g", 1)).toThrow(/not a program-level input/);
    expect(() => entry.setInput("nope", 1)).toThrow(/not a program-level input/);

    entry.setInput("p", 3);
    expect(entry.programValues).toEqual(new Map([["p", 3]]));
    expect(outOf(entry, new Set(["p"]))).toBe(8);

    entry.resetInput("p");
    expect(entry.programValues.get("p")).toBe(0);
    expect(outOf(entry, new Set(["p"]))).toBe(5);
  });

  it("setGlobalInput feeds the state without joining the program's own values", () => {
    const entry = new ProgramEntry(
      "e",
      bind(makeLang(), "output out = Add($g, $p)", P),
      NO_GLOBALS,
    );
    entry.setGlobalInput("g", 4);
    expect(outOf(entry, new Set(["g"]))).toBe(4);
    expect(entry.programValues.has("g")).toBe(false); // the runtime owns it, not the entry
    expect(() => entry.setGlobalInput("p", 1)).toThrow(/is a program-level input/);
  });

  it("exposes the ports it was bound with, so replace can keep them", () => {
    const entry = new ProgramEntry(
      "e",
      bind(makeLang(), "output out = Add($g, $p)", P),
      NO_GLOBALS,
    );
    expect(entry.ports).toBe(P);
  });

  it("replace keeps values for names still declared and drops the rest", () => {
    const lang = makeLang();
    const PQ: Ports = {
      inputs: [
        { name: "p", type: Type.number },
        { name: "q", type: Type.number },
      ],
      outputs: [],
    };
    const entry = new ProgramEntry("e", bind(lang, "output out = Add($p, $q)", PQ), NO_GLOBALS);
    entry.setInput("p", 3);
    entry.setInput("q", 4);
    const handler = () => {};
    entry.outputHandlers.add(handler);

    entry.replace(bind(lang, "output out = Add($g, $p)", P), new Map([["g", 10]]));
    expect(entry.programValues).toEqual(new Map([["p", 3]]));
    expect(outOf(entry)).toBe(13);
    expect(entry.indexedNames()).toEqual(new Set(["g"]));
    expect(entry.outputHandlers.has(handler)).toBe(true); // subscribers survive a replace
  });

  it("returns an EvalError as an outcome and lets anything else propagate", () => {
    const entry = new ProgramEntry("e", bind(makeLang(), "output out = Boom($p)", P), NO_GLOBALS);
    expect(entry.evaluate(undefined).ok).toBe(true);
    entry.setInput("p", 1);
    const failed = entry.evaluate(new Set(["p"]));
    expect(failed.ok).toBe(false);
    if (failed.ok) return;
    expect(failed.error).toBeInstanceOf(EvalError);
    expect(failed.error.kind).toBe("host_error");

    const corrupt = { kind: "array", items: null, dependsOn: new Set() } as unknown as CNode;
    const broken: BoundProgram = {
      program: { bindings: new Map(), outputs: new Map([["out", corrupt]]) },
      ports: EMPTY_PORTS,
      composed: makeLang().descriptor,
    };
    expect(() => new ProgramEntry("e", broken, NO_GLOBALS).evaluate(undefined)).toThrow(TypeError);
  });
});
