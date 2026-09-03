import { type SurfaceSpec } from "./surface";

//? PlaygroundDocument: everything a playground session IS, the source text.
// The language surface it runs against, and the current input values. Self-contained:
// a document round-trips through the URL with no dependence on shipped examples
// (presets are just documents you can load in).

export const DOCUMENT_VERSION = 1;

export interface PlaygroundDocument {
  v: typeof DOCUMENT_VERSION;
  source: string;
  surface: SurfaceSpec;
  values: Record<string, unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Lite structural check for decoded payloads - enough to boot safely, not a schema. */
export function isDocument(value: unknown): value is PlaygroundDocument {
  if (!isRecord(value)) return false;
  const surface = value["surface"];
  return (
    value["v"] === DOCUMENT_VERSION &&
    typeof value["source"] === "string" &&
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
