import { serialiseSource } from "@dendrite-lang/core";
import { describe, expect, it } from "vitest";

import {
  applyMigrations,
  cloneDocument,
  DOCUMENT_VERSION,
  type EditorDocument,
  isDocument,
  type Migration,
  migrateDocument,
} from "./document";

const current = (): EditorDocument => ({
  version: DOCUMENT_VERSION,
  program: serialiseSource("output out = $a"),
  surface: { inputs: [{ name: "a", type: { kind: "name", name: "number" } }], outputs: [] },
  inputValues: { a: 1 },
});

describe("isDocument", () => {
  it("accepts a current-version document", () => {
    expect(isDocument(current())).toBe(true);
  });

  it("rejects non-documents and other versions", () => {
    expect(isDocument(null)).toBe(false);
    expect(isDocument({ version: DOCUMENT_VERSION })).toBe(false);
    expect(isDocument({ ...current(), version: DOCUMENT_VERSION + 1 })).toBe(false);
    expect(isDocument({ ...current(), program: "not a program" })).toBe(false);
    expect(isDocument({ ...current(), inputValues: [] })).toBe(false);
  });
});

describe("migrateDocument", () => {
  it("returns a current document unchanged", () => {
    const doc = current();
    expect(migrateDocument(doc)).toBe(doc);
  });

  it("rejects garbage and unknown newer envelopes", () => {
    expect(migrateDocument(undefined)).toBeNull();
    expect(migrateDocument("nope")).toBeNull();
    expect(migrateDocument({ ...current(), version: DOCUMENT_VERSION + 1 })).toBeNull();
  });

  it("rejects a document whose program format is newer than core understands", () => {
    const doc = current();
    const futureProgram = { ...doc.program, version: 999 };
    expect(migrateDocument({ ...doc, program: futureProgram })).toBeNull();
  });

  it("rejects an older version with no migration on record", () => {
    expect(migrateDocument({ ...current(), version: 0 })).toBeNull();
  });
});

describe("applyMigrations", () => {
  // A fake three-version history: each step tags the doc so the order is observable.
  const chain: Record<number, Migration> = {
    1: (doc) => ({ ...doc, version: 2, path: [...(doc.path as string[]), "1→2"] }),
    2: (doc) => ({ ...doc, version: 3, path: [...(doc.path as string[]), "2→3"] }),
  };

  it("chains every step from the document's version up to the target", () => {
    expect(applyMigrations({ version: 1, path: [] }, chain, 3)).toEqual({
      version: 3,
      path: ["1→2", "2→3"],
    });
    expect(applyMigrations({ version: 2, path: [] }, chain, 3)).toEqual({
      version: 3,
      path: ["2→3"],
    });
  });

  it("returns a current or newer document untouched", () => {
    const doc = { version: 3, path: [] };
    expect(applyMigrations(doc, chain, 3)).toBe(doc);
    expect(applyMigrations({ version: 4 }, chain, 3)).toEqual({ version: 4 });
  });

  it("leaves a document without a readable version untouched (the caller's guard rejects it)", () => {
    const doc = { v: 1 };
    expect(applyMigrations(doc, chain, 3)).toBe(doc);
  });

  it("returns null when a step is missing or rejects its input", () => {
    expect(applyMigrations({ version: 0, path: [] }, chain, 3)).toBeNull();
    expect(applyMigrations({ version: 1 }, { 1: () => null }, 2)).toBeNull();
  });

  it("returns null instead of looping when a step fails to advance the version", () => {
    const stuck: Record<number, Migration> = { 1: (doc) => ({ ...doc }) };
    expect(applyMigrations({ version: 1 }, stuck, 2)).toBeNull();
    const backwards: Record<number, Migration> = { 1: (doc) => ({ ...doc, version: 0 }) };
    expect(applyMigrations({ version: 1 }, backwards, 2)).toBeNull();
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
