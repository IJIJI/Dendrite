import { describe, expect, it } from "vitest";

import { tokenise } from "../parser/lexer";
import { isIdentifier } from "./identifier";
import { EMPTY_PORTS, flattenPorts, isPorts, type PortLayer, Policy } from "./ports";
import { Type } from "./types";

const layer = (id: string, ports: Partial<PortLayer["ports"]>): PortLayer => ({
  id,
  ports: { inputs: [], outputs: [], ...ports },
  policy: Policy.user,
});

describe("Policy", () => {
  it("ships the two presets, frozen", () => {
    expect(Policy.host).toEqual({ editable: false, feeds: "host", persisted: false });
    expect(Policy.user).toEqual({ editable: true, feeds: "user", persisted: true });
    expect(Object.isFrozen(Policy.host)).toBe(true);
    expect(Object.isFrozen(Policy.user)).toBe(true);
  });

  it("custom overrides a base without touching it", () => {
    const scratch = Policy.custom(Policy.user, { persisted: false });
    expect(scratch).toEqual({ editable: true, feeds: "user", persisted: false });
    expect(Policy.user.persisted).toBe(true);
    expect(Object.isFrozen(scratch)).toBe(true);
  });
});

describe("flattenPorts", () => {
  it("concatenates layers in order and only mentions types when a layer has them", () => {
    const a = layer("a", { inputs: [{ name: "x", type: Type.number }] });
    const b = layer("b", {
      types: [{ name: "Bus" }],
      inputs: [{ name: "y", type: Type.string }],
      outputs: [{ name: "out", type: Type.number }],
    });
    expect(flattenPorts([a, b])).toEqual({
      types: [{ name: "Bus" }],
      inputs: [
        { name: "x", type: Type.number },
        { name: "y", type: Type.string },
      ],
      outputs: [{ name: "out", type: Type.number }],
    });
    expect(flattenPorts([a])).toEqual({ inputs: [{ name: "x", type: Type.number }], outputs: [] });
    expect(flattenPorts([])).toEqual(EMPTY_PORTS);
  });
});

describe("isPorts", () => {
  it("accepts stored ports in every legal shape", () => {
    expect(isPorts(EMPTY_PORTS)).toBe(true);
    expect(
      isPorts({
        types: [{ name: "Bus", fields: { state: Type.string } }],
        inputs: [{ name: "score", type: Type.number, default: 45 }],
        outputs: [{ name: "result", type: Type.array(Type.string), mode: "required" }],
      }),
    ).toBe(true);
  });

  it("rejects the shapes a corrupt payload would produce", () => {
    expect(isPorts(null)).toBe(false);
    expect(isPorts({ inputs: [] })).toBe(false); // outputs missing
    expect(isPorts({ inputs: {}, outputs: [] })).toBe(false); // not an array
    expect(isPorts({ inputs: [{ name: "x" }], outputs: [] })).toBe(false); // no type
    expect(isPorts({ inputs: [{ name: "x", type: "number" }], outputs: [] })).toBe(false); // unstructured type
    expect(isPorts({ types: [{}], inputs: [], outputs: [] })).toBe(false); // nameless type
    expect(isPorts({ types: [{ name: "Bus", fields: 3 }], inputs: [], outputs: [] })).toBe(false);
    expect(isPorts({ types: [{ name: "Bus", extends: 3 }], inputs: [], outputs: [] })).toBe(false);
  });
});

describe("isIdentifier (the port-name rule)", () => {
  const valid = ["score", "_x", "busState2", "let", "output"];
  const invalid = ["1st", "bus-state", "bus state", "", "$score", "true", "false", "null"];

  it("accepts identifiers and rejects everything else, literal words included", () => {
    for (const name of valid) expect(isIdentifier(name), name).toBe(true);
    for (const name of invalid) expect(isIdentifier(name), name).toBe(false);
  });

  it("agrees with the lexer: a valid name is exactly one ident token after the sigil", () => {
    const lexesAsInput = (name: string) => {
      const { tokens, errors } = tokenise(`$${name}`);
      const [sigil, ident, eof] = tokens;
      return (
        errors.length === 0 &&
        tokens.length === 3 &&
        sigil?.value === "$" &&
        ident?.kind === "ident" &&
        ident.value === name &&
        eof?.kind === "eof"
      );
    };
    for (const name of valid) expect(lexesAsInput(name), name).toBe(true);
    for (const name of invalid) expect(lexesAsInput(name), name).toBe(false);
  });
});
