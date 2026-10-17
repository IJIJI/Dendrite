import {
  createStdlib,
  Policy,
  type PortLayer,
  type Ports,
  serialiseSource,
  Type,
} from "@dendrite-lang/core";
import { describe, expect, it } from "vitest";

import { hoverAt } from "../code/hover";
import { type SourcePart } from "../code/source";
import { ownStack } from "./connection";
import { DOCUMENT_VERSION } from "./document";
import { type HoverContent, hoverContent } from "./hover";

// What the hover says, over a real instance; the tooltip itself is CodeMirror's, and a
// browser matter.

// A host contract beneath the document: one global input, one desired output (a required
// one would be an error in every program here that does not write it).
const HOST: PortLayer = {
  id: "host",
  ports: {
    inputs: [{ name: "g", type: Type.number }],
    outputs: [{ name: "out", type: Type.number, mode: "desired" }],
  },
  policy: Policy.host,
};

// The document's own declarations: a plain input, a trigger, a list, an output with no mode.
const PORTS: Ports = {
  inputs: [
    { name: "p", type: Type.number },
    { name: "go", type: Type.boolean, trigger: true },
    { name: "xs", type: Type.array(Type.number) },
  ],
  outputs: [{ name: "plain", type: Type.number }],
};

function stack(source: string, ports: Ports = PORTS) {
  const language = createStdlib();
  language.registerType("Point", { fields: { x: Type.number, y: Type.number } });
  language.registerType("Grade", { extends: "string" });
  return ownStack({
    document: {
      version: DOCUMENT_VERSION,
      program: serialiseSource(source, ports),
      inputValues: { p: 1 },
    },
    language,
    layers: { global: [HOST] },
  });
}

const join = (parts: readonly SourcePart[]): string => parts.map((part) => part.text).join("");
const plain = (content: HoverContent) => ({
  head: join(content.head),
  notes: content.notes,
  code: content.code.map(join),
});

// The hover at the first character of `needle`, as plain text.
function hover(source: string, needle: string, connection = stack(source)) {
  const { instance, language } = connection;
  const target = hoverAt(source, source.indexOf(needle), 1, language);
  if (!target) throw new Error(`nothing to hover at '${needle}'`);
  const content = hoverContent(target, instance, language);
  return content && plain(content);
}

describe("hoverContent: an op", () => {
  it("shows the signature, the description and the first example", () => {
    const filter = createStdlib().descriptor.ops.get("Filter")!;
    expect(hover("output big = Filter([1], item => item > 0)", "Filter")).toEqual({
      head: "Filter(list: any[], predicate: (any) -> boolean) -> any[]",
      notes: [filter.description],
      code: [filter.examples![0]!.form === "code" ? filter.examples![0]!.source : ""],
    });
  });
});

describe("hoverContent: an input", () => {
  it("shows a program-level input's type, start, layer and value", () => {
    expect(hover("output plain = $p + 1", "$p")).toEqual({
      head: "$p: number",
      notes: ["Starts at 0.", "Declared by layer 'document', fed by the user.", "Value: 1"],
      code: [],
    });
  });

  it("says a trigger is one", () => {
    expect(hover("output plain = If($go, 1, 2)", "go")?.notes.slice(0, 2)).toEqual([
      "A trigger: it goes back to its start value after it fires.",
      "Starts at false.",
    ]);
  });

  it("shows no value for a global input: the runtime holds it, not the instance", () => {
    expect(hover("output out = $g", "$g")?.notes).toEqual([
      "Starts at 0.",
      "Declared by layer 'host', fed by the host.",
      "A global input: its value is the host's.",
    ]);
  });

  it("says when no layer declares it", () => {
    expect(hover("output plain = $nope", "$nope")).toEqual({
      head: "$nope",
      notes: ["No layer declares it."],
      code: [],
    });
  });

  it("reads the value when it is asked, not when the stack was built", () => {
    const source = "output plain = $p + 1";
    const connection = stack(source);
    connection.instance.setInput("p", 5);
    expect(hover(source, "$p", connection)?.notes.at(-1)).toBe("Value: 5");
  });

  it("cuts a long value short", () => {
    const source = "output plain = Length($xs)";
    const connection = stack(source);
    connection.instance.setInput(
      "xs",
      Array.from({ length: 100 }, (_, i) => i),
    );
    const value = hover(source, "$xs", connection)!.notes.at(-1)!;
    expect(value).toHaveLength("Value: ".length + 120);
    expect(value.endsWith("…")).toBe(true);
  });
});

describe("hoverContent: an output", () => {
  it("shows a declared output's type, layer, mode and value", () => {
    expect(hover("output out = $g", "out =")).toEqual({
      head: "output out: number",
      notes: ["Declared by layer 'host', desired.", "Value: 0"],
      code: [],
    });
  });

  it("calls an output with no mode declared optional", () => {
    expect(hover("output plain = 1", "plain")?.notes).toEqual([
      "Declared by layer 'document', optional.",
      "Value: 1",
    ]);
  });

  it("still shows the value of an output no layer declares", () => {
    expect(hover("output extra = 2", "extra")).toEqual({
      head: "output extra",
      notes: ["No layer declares it.", "Value: 2"],
      code: [],
    });
  });

  it("says when there is no value yet, and when the value is stale", () => {
    expect(hover("output plain = $nope", "plain")?.notes.at(-1)).toBe("No value yet.");

    const connection = stack("output plain = 1");
    connection.instance.setProgram(serialiseSource("output plain = $nope"));
    expect(hover("output plain = $nope", "plain", connection)?.notes.at(-1)).toBe(
      "Value: 1 (stale)",
    );
  });
});

describe("hoverContent: a type", () => {
  it("shows a struct's fields, one per line", () => {
    expect(hover("output f = (pt: Point) => pt.x", "Point")).toEqual({
      head: "Point",
      notes: ["An input of this type starts at null."],
      code: ["x: number\ny: number"],
    });
  });

  it("shows what a type extends, and the start it takes from its parent", () => {
    expect(hover("output f = (g: Grade) => g", "Grade")).toEqual({
      head: "Grade",
      notes: ["Extends string.", 'An input of this type starts at "".'],
      code: [],
    });
  });

  it("explains a built-in type by what an input of it starts at", () => {
    expect(hover("output f = (n: number) => n", "number")).toEqual({
      head: "number",
      notes: ["An input of this type starts at 0."],
      code: [],
    });
  });
});

describe("hoverContent: ports that do not compose", () => {
  it("says nothing about an input or an output, and still explains an op", () => {
    const broken: Ports = {
      inputs: [
        { name: "p", type: Type.number },
        { name: "p", type: Type.number },
      ],
      outputs: [],
    };
    const source = "output plain = Abs($p)";
    const connection = stack(source, broken);
    expect(connection.instance.ports.get().composed.ok).toBe(false);
    expect(hover(source, "$p", connection)).toBeUndefined();
    expect(hover(source, "plain", connection)).toBeUndefined();
    expect(hover(source, "Abs", connection)?.head).toBe("Abs(value: number) -> number");
  });
});
