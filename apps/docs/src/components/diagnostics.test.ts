import { diagnosticList, type Ports, type SavedAstProgram, Type } from "@dendrite-lang/core";
import { describe, expect, it } from "vitest";

import { declarationsOf, hostCodeParts, partsText } from "./diagnostics";

//? The two printers behind the diagnostics page. The page is generated from core's registry,
// so a sample gaining a declaration the printer cannot show would silently vanish from the
// page - hence the last test, which walks every sample the registry holds.

const text = (parts: { text: string }[]): string => parts.map((p) => p.text).join("");

describe("declarationsOf", () => {
  it("prints types, inputs and outputs, with what makes each one special", () => {
    const ports: Ports = {
      types: [
        { name: "Reading" },
        { name: "Bus", fields: { id: Type.number, live: Type.boolean } },
        { name: "Child", extends: "Bus", fields: { id: Type.string } },
      ],
      inputs: [
        { name: "bus", type: Type.name("Bus") },
        { name: "n", type: Type.number, default: 20 },
        { name: "go", type: Type.boolean, trigger: true },
        { name: "rows", type: Type.array(Type.number) },
      ],
      outputs: [
        { name: "x", type: Type.any },
        { name: "needed", type: Type.number, mode: "required" },
      ],
    };

    const declarations = declarationsOf(ports)!;
    expect(declarations.types.map(text)).toEqual([
      "Reading",
      "Bus { id: number, live: boolean }",
      "Child extends Bus { id: string }",
    ]);
    expect(
      declarations.inputs.map((line) => [line.name, text(line.type), line.tags] as const),
    ).toEqual([
      ["$bus", "Bus", []],
      ["$n", "number", ["= 20"]],
      ["$go", "boolean", ["trigger"]],
      ["$rows", "number[]", []],
    ]);
    expect(
      declarations.outputs.map((line) => [line.name, text(line.type), line.tags] as const),
    ).toEqual([
      ["x", "any", []],
      ["needed", "number", ["required"]],
    ]);
    // Every type is coloured with the editor's own token classes, never bare text.
    expect(declarations.inputs[0]!.type[0]!.cls).toBe("ident");
  });

  it("knows an empty layer from no layer at all", () => {
    const one = declarationsOf({ inputs: [], outputs: [{ name: "x", type: Type.any }] })!;
    expect(one.empty).toBe(false);
    expect(one.outputs).toHaveLength(1);
    // An empty layer is a declaration in itself: `unknown_program_output` is about an output
    // nobody asked for, which only reads as one if the page says nobody asked.
    expect(declarationsOf({ inputs: [], outputs: [] })!.empty).toBe(true);
    expect(declarationsOf(undefined)).toBeNull();
  });
});

describe("hostCodeParts", () => {
  it("prints an operation node as the constructor a host calls", () => {
    const example: SavedAstProgram = {
      version: 1,
      form: "ast",
      bindings: {},
      outputs: {
        x: {
          kind: "operation",
          op: "Nope",
          inputs: { a: { kind: "literal", value: 1 } },
          output: Type.any,
        },
      },
    };

    expect(partsText(hostCodeParts(example))).toBe(
      [
        "bindings: {},",
        'outputs: { x: operationNode("Nope", { a: { kind: "literal", value: 1 } }) },',
      ].join("\n"),
    );
  });

  it("prints a lambda's annotation, and never the parser's source spans", () => {
    const example: SavedAstProgram = {
      version: 1,
      form: "ast",
      bindings: {
        f: {
          kind: "lambda",
          params: [{ name: "n", type: Type.number }],
          returnType: Type.string,
          body: { kind: "ref", name: "n", source: { line: 1, column: 1 } as never },
        },
      },
      outputs: { x: { kind: "ref", name: "f" } },
    };

    const printed = partsText(hostCodeParts(example));
    expect(printed).toContain("returnType: Type.string");
    expect(printed).toContain('params: [{ name: "n", type: Type.number }]');
    expect(printed).not.toContain("source");
  });
});

describe("every sample in the registry", () => {
  it("is printable: code samples show their program, graph samples their host code", () => {
    for (const entry of diagnosticList) {
      const example = entry.example;
      if (!example) {
        expect(entry.triggeredBy, `${entry.kind} has no sample and no reason why`).toBeTruthy();
        continue;
      }
      if (example.form === "ast") {
        expect(
          partsText(hostCodeParts(example)).length,
          `${entry.kind} printed as nothing`,
        ).toBeGreaterThan(10);
        continue;
      }
      expect(example.form, `${entry.kind} is a form the page cannot print`).toBe("code");
      // Every declaration a sample carries has to survive the printer, coloured.
      const declarations = declarationsOf(example.ports);
      for (const line of [...(declarations?.inputs ?? []), ...(declarations?.outputs ?? [])]) {
        expect(line.name.length, `${entry.kind} has a nameless port`).toBeGreaterThan(0);
        expect(text(line.type).length, `${entry.kind}: ${line.name} has no type`).toBeGreaterThan(
          0,
        );
      }
    }
  });
});
