import { serialiseSource } from "@dendrite-lang/core";
import { describe, expect, it } from "vitest";

import { DOCUMENT_VERSION, type EditorDocument } from "./document";
import { decodePayload, encodeDocument } from "./permalink";

const doc = (): EditorDocument => ({
  version: DOCUMENT_VERSION,
  program: serialiseSource("// hello\noutput out = $a * 2"),
  surface: { inputs: [{ name: "a", type: { kind: "name", name: "number" } }], outputs: [] },
  inputValues: { a: 21 },
});

describe("permalink codec", () => {
  it("round-trips a document through a URL-safe payload", async () => {
    const payload = await encodeDocument(doc());
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decodePayload(payload)).toEqual(doc());
  });

  it("decodes through migrateDocument, so a payload from another version fails soft", async () => {
    const newer = await encodeDocument({
      ...doc(),
      version: DOCUMENT_VERSION + 1,
    } as EditorDocument);
    expect(await decodePayload(newer)).toBeNull();
  });

  it("fails soft on malformed or foreign payloads", async () => {
    expect(await decodePayload("not-a-payload")).toBeNull();
    expect(await decodePayload("")).toBeNull();
    const foreign = await encodeDocument({ hello: "world" } as unknown as EditorDocument);
    expect(await decodePayload(foreign)).toBeNull();
  });
});
