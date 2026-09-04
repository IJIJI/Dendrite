import { serialiseSource } from "@dendrite-lang/core";
import { describe, expect, it } from "vitest";

import { DOCUMENT_VERSION, type EditorDocument } from "./document";
import { decodePayload, encodeDocument } from "./permalink";

// A real v1 share link (the playground's "Bus tally" preset, captured 2026-09-04 before the
// envelope moved to v2). Existing share URLs must keep decoding.
const V1_TALLY_PAYLOAD =
  "1VJNi9swEP0rw7CHBLSbZgulGNLSPRRa2Pawx00OY3sSi8qSkUZJTfB_L5K9IWkbKHvrTdjvY96bOeIei6XCzrudpxaLI-7ZB-1s_rx1vsUCK1czKgwu-oqxwMUCHpgqZ2-D9IZByJi-gEOjqwYOJFXDNYxo0AGM3rMCEjg0JNB57byW_uPaLhZwU8YQOCQYgfRdIoqPlQB5Tz3cgvgeuNai7Q6kYfj69P0bOJvfXu8aUVnIeWh1CB0bAwRbzaaGWRnDXRBimYM4CMwv4tJ3Sa9Ks4KWu7VdW8MCVIneM6zgszbCfjaNp6CMAVYf4JOtsyhbKg3XCp5cy6NNjhsUZNwXW5lYc5jdTHUoCPP5fJ58XJQuylgarOCRfs4eqZuN1ienaXThRMJBYYh-S6n-I6aeAhbPR7TUpoU8xIAKc-iQAJmYHj-0rbEYYeoFbWNbsk-aU4yryNI5wzTaj_nOoHlBqJANt2zlqkgQr-0Oh2EYNgq17aJcDD9WjCrHeoV-Cj8MCmveUjSSpacC7t-cZRQf-SzHM5JwW1TULlGd3ve4GdSJv3z3L_y3F5z3Z5QtmXDNczNk1hRiOpPXt3Bq-byISzuF4-ldtJ_P8E_bv19MGhn3ZOJ4CNPm_p_C1ann3_4MvwA";

const doc = (): EditorDocument => ({
  v: DOCUMENT_VERSION,
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

  it("decodes an existing v1 share link into a current document", async () => {
    const decoded = await decodePayload(V1_TALLY_PAYLOAD);
    expect(decoded).not.toBeNull();
    expect(decoded!.v).toBe(DOCUMENT_VERSION);
    expect(decoded!.program.form).toBe("code");
    expect(decoded!.program.form === "code" && decoded!.program.source).toContain("output tally");
    expect(decoded!.surface.inputs.map((i) => i.name)).toEqual(["busses", "watched"]);
    expect(decoded!.inputValues.watched).toEqual(["atem:cam1"]);
    expect("values" in decoded!).toBe(false);
  });

  it("fails soft on malformed or foreign payloads", async () => {
    expect(await decodePayload("not-a-payload")).toBeNull();
    expect(await decodePayload("")).toBeNull();
    const foreign = await encodeDocument({ hello: "world" } as unknown as EditorDocument);
    expect(await decodePayload(foreign)).toBeNull();
  });
});
