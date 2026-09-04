import { serialiseSource } from "@dendrite-lang/core";
import { describe, expect, it } from "vitest";

import {
  cloneDocument,
  DOCUMENT_VERSION,
  type EditorDocument,
  isDocument,
  migrateDocument,
} from "./document";

const current = (): EditorDocument => ({
  v: DOCUMENT_VERSION,
  program: serialiseSource("output out = $a"),
  surface: { inputs: [{ name: "a", type: { kind: "name", name: "number" } }], outputs: [] },
  inputValues: { a: 1 },
});

// The v1 envelope: `values` instead of `inputValues`.
const v1 = () => {
  const { inputValues, ...rest } = current();
  return { ...rest, v: 1, values: inputValues };
};

describe("isDocument", () => {
  it("accepts a current-version document", () => {
    expect(isDocument(current())).toBe(true);
  });

  it("rejects the v1 envelope and non-documents", () => {
    expect(isDocument(v1())).toBe(false);
    expect(isDocument(null)).toBe(false);
    expect(isDocument({ v: DOCUMENT_VERSION })).toBe(false);
    expect(isDocument({ ...current(), program: "not a program" })).toBe(false);
  });
});

describe("migrateDocument", () => {
  it("returns a current document unchanged", () => {
    const doc = current();
    expect(migrateDocument(doc)).toBe(doc);
  });

  it("migrates v1 (`values`) to the current envelope (`inputValues`)", () => {
    const migrated = migrateDocument(v1());
    expect(migrated).toEqual(current());
    expect(migrated && "values" in migrated).toBe(false);
  });

  it("rejects garbage and unknown newer envelopes", () => {
    expect(migrateDocument(undefined)).toBeNull();
    expect(migrateDocument("nope")).toBeNull();
    expect(migrateDocument({ ...current(), v: DOCUMENT_VERSION + 1 })).toBeNull();
  });

  it("rejects a document whose program format is newer than core understands", () => {
    const doc = current();
    const futureProgram = { ...doc.program, version: 999 };
    expect(migrateDocument({ ...doc, program: futureProgram })).toBeNull();
  });
});

describe("cloneDocument", () => {
  it("deep-clones so sessions cannot mutate shared presets", () => {
    const doc = current();
    const clone = cloneDocument(doc);
    (clone.inputValues as Record<string, unknown>).a = 99;
    clone.surface.inputs.push({ name: "b", type: { kind: "name", name: "string" } });
    expect(doc.inputValues.a).toBe(1);
    expect(doc.surface.inputs).toHaveLength(1);
  });
});
