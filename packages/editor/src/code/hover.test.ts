import { createStdlib, Type } from "@dendrite-lang/core";
import { describe, expect, it } from "vitest";

import { hoverAt, signatureOf } from "./hover";

// The hover's two pure halves; the tooltip itself is CodeMirror's, and a browser matter.

const language = createStdlib();
const op = (name: string) => language.descriptor.ops.get(name)!;

describe("signatureOf: the signature as the reference prints it", () => {
  it("marks a converting and an optional input on the name", () => {
    expect(signatureOf(op("Join"))).toBe("Join(parts~: string[], separator?: string) -> string");
  });

  it("marks a lazy input on the type, and a variadic one on the name", () => {
    expect(signatureOf(op("If"))).toBe(
      "If(condition: boolean, then: lazy any, else: lazy any) -> any",
    );
    expect(signatureOf(op("And"))).toBe("And(nodes...: lazy boolean) -> boolean");
  });

  it("writes a function input as Dendrite writes a function type", () => {
    expect(signatureOf(op("Filter"))).toBe(
      "Filter(list: any[], predicate: (any) -> boolean) -> any[]",
    );
  });

  it("serves a host's op as the library's", () => {
    const host = createStdlib();
    const Fahrenheit = host.registerOp({
      name: "Fahrenheit",
      inputs: [{ name: "celsius", type: Type.number }],
      output: Type.number,
    });
    expect(signatureOf(Fahrenheit)).toBe("Fahrenheit(celsius: number) -> number");
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
