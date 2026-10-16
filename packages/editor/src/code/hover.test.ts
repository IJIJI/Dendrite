import { createStdlib, Type } from "@dendrite-lang/core";
import { describe, expect, it } from "vitest";

import { hoverAt, signatureParts } from "./hover";

// The hover's two pure halves; the tooltip itself is CodeMirror's, and a browser matter.

const language = createStdlib();
const op = (name: string) => language.descriptor.ops.get(name)!;
const text = (name: string) =>
  signatureParts(op(name), language)
    .map((part) => part.text)
    .join("");
// Each token with its class, for the colouring: `[text, cls]`, plain text left out.
const classes = (name: string) =>
  signatureParts(op(name), language)
    .filter((part) => part.cls)
    .map((part) => [part.text, part.cls]);

describe("signatureParts: the signature as the reference prints it", () => {
  it("marks a converting and an optional input on the name", () => {
    expect(text("Join")).toBe("Join(parts~: string[], separator?: string) -> string");
  });

  it("marks a lazy input on the type, and a variadic one on the name", () => {
    expect(text("If")).toBe("If(condition: boolean, then: lazy any, else: lazy any) -> any");
    expect(text("And")).toBe("And(nodes...: lazy boolean) -> boolean");
  });

  it("writes a function input as Dendrite writes a function type", () => {
    expect(text("Filter")).toBe("Filter(list: any[], predicate: (any) -> boolean) -> any[]");
  });

  it("colours as the code does: the op, its types, and a type after the lazy mark", () => {
    const parts = classes("If");
    expect(parts[0]).toEqual(["If", "op"]);
    expect(parts).toContainEqual(["boolean", "type"]);
    expect(parts).toContainEqual(["lazy", "keyword"]);
    // The `any` after `lazy`, which a one-line highlight would class as a plain name.
    expect(parts.filter(([t, c]) => t === "any" && c === "type")).toHaveLength(3);
  });

  it("serves a host's op as the library's", () => {
    const host = createStdlib();
    const Fahrenheit = host.registerOp({
      name: "Fahrenheit",
      inputs: [{ name: "celsius", type: Type.number }],
      output: Type.number,
    });
    const parts = signatureParts(Fahrenheit, host);
    expect(parts.map((p) => p.text).join("")).toBe("Fahrenheit(celsius: number) -> number");
    expect(parts[0]).toEqual({ text: "Fahrenheit", cls: "op" });
  });
});

describe("hoverAt: the op under the pointer", () => {
  const source = "output out = Upper(name) ++ x";
  // `Upper` spans 13 to 18; the `(` is at 18.
  const at = (pos: number, side: -1 | 1) => hoverAt(source, pos, side, language);

  it("finds the op from its first character to its last", () => {
    expect(at(13, 1)).toMatchObject({ op: { name: "Upper" }, from: 13, to: 18 });
    expect(at(18, -1)?.op.name).toBe("Upper"); // the pointer on the `r`, before position 18
  });

  it("is nothing just outside the name", () => {
    expect(at(13, -1)).toBeUndefined(); // the pointer on the space before it
    expect(at(18, 1)).toBeUndefined(); // the pointer on the `(`
  });

  it("is nothing on a keyword, a plain name, a symbol or an input", () => {
    expect(at(0, 1)).toBeUndefined(); // output
    expect(at(19, 1)).toBeUndefined(); // name, an identifier
    expect(at(25, 1)).toBeUndefined(); // ++
    expect(hoverAt("output out = $Upper", 15, 1, language)).toBeUndefined(); // an input
  });
});
