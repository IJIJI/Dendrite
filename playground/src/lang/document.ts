import { type SavedProgram } from "@dendrite-lang/core";

import { type SurfaceSpec } from "./surface";

//? PlaygroundDocument: everything a playground session IS - the host envelope the
// architecture prescribes, wrapping a core SavedProgram (the program) with what the
// playground adds: the language surface it runs against and the current input values.
// Self-contained: a document round-trips through the URL with no dependence on shipped
// examples (presets are just documents you can load in).
//
// Two version axes on purpose: `v` is THIS envelope's version; `program.version` is
// core's format version (core's migrate() owns that part). Today the playground only
// edits code-form programs; rete-form documents slot in with the editor era, with no
// change to this shape.

export const DOCUMENT_VERSION = 1;

export interface PlaygroundDocument {
  v: typeof DOCUMENT_VERSION;
  program: SavedProgram;
  surface: SurfaceSpec;
  values: Record<string, unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Lite structural check for decoded payloads - enough to boot safely, not a schema. */
export function isDocument(value: unknown): value is PlaygroundDocument {
  if (!isRecord(value)) return false;
  const program = value["program"];
  const surface = value["surface"];
  return (
    value["v"] === DOCUMENT_VERSION &&
    isRecord(program) &&
    typeof program["form"] === "string" &&
    isRecord(surface) &&
    Array.isArray(surface["inputs"]) &&
    Array.isArray(surface["outputs"]) &&
    isRecord(value["values"])
  );
}

/** Deep-clone a document (presets are shared module state; sessions must not mutate them). */
export function cloneDocument(doc: PlaygroundDocument): PlaygroundDocument {
  return JSON.parse(JSON.stringify(doc)) as PlaygroundDocument;
}
