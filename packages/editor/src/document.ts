import { migrate, type SavedProgram } from "@dendrite-lang/core";

import { type SurfaceSpec } from "./surface";

//? EditorDocument: everything an editor session IS - the host envelope the architecture
// prescribes, wrapping a core SavedProgram (the program) with what the editor adds: the
// language surface it runs against and the values its inputs are evaluated with.
// Self-contained: a document round-trips through a URL or a store with no dependence on a
// host's presets (presets are just documents you can load in).
//
// Two version axes on purpose: `v` is THIS envelope's version; `program.version` is core's
// format version (core's migrate() owns that part; migrateDocument delegates to it). Only
// renames/removals bump `v` - optional additions (a future `id`/`meta`) do not. Today the
// editor only edits code-form programs; rete-form documents slot in with the editor era,
// with no change to this shape.

export const DOCUMENT_VERSION = 2;

export interface EditorDocument {
  v: typeof DOCUMENT_VERSION;
  program: SavedProgram;
  surface: SurfaceSpec;
  /**
   * Values the surface's inputs are evaluated with while editing. In the playground they
   * ARE the inputs; a host with live inputs (Beacon) treats them as the editing-time sample.
   */
  inputValues: Record<string, unknown>;
}

// v1 (2026-09-04): the same envelope with `values` instead of `inputValues`.
interface DocumentV1 {
  v: 1;
  program: SavedProgram;
  surface: SurfaceSpec;
  values: Record<string, unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Shared by every envelope version so far.
const hasProgramAndSurface = (value: Record<string, unknown>): boolean => {
  const program = value["program"];
  const surface = value["surface"];
  return (
    isRecord(program) &&
    typeof program["form"] === "string" &&
    isRecord(surface) &&
    Array.isArray(surface["inputs"]) &&
    Array.isArray(surface["outputs"])
  );
};

/** Lite structural check for a CURRENT-version document - enough to boot safely, not a schema. */
export function isDocument(value: unknown): value is EditorDocument {
  return (
    isRecord(value) &&
    value["v"] === DOCUMENT_VERSION &&
    hasProgramAndSurface(value) &&
    isRecord(value["inputValues"])
  );
}

const isV1 = (value: unknown): value is DocumentV1 =>
  isRecord(value) && value["v"] === 1 && hasProgramAndSurface(value) && isRecord(value["values"]);

const fromV1 = ({ values, ...rest }: DocumentV1): EditorDocument => ({
  ...rest,
  v: DOCUMENT_VERSION,
  inputValues: values,
});

/**
 * Any envelope version (or garbage) → a current document, or null. The inner program goes
 * through core's migrate(), so a document older on EITHER axis comes back current; one newer
 * than this build understands comes back null (fail soft - the caller falls back).
 */
export function migrateDocument(value: unknown): EditorDocument | null {
  const envelope = isDocument(value) ? value : isV1(value) ? fromV1(value) : null;
  if (!envelope) return null;
  try {
    const program = migrate(envelope.program);
    return program === envelope.program ? envelope : { ...envelope, program };
  } catch {
    return null; // core: unsupported (newer) program version
  }
}

/** Deep-clone a document (presets are shared module state; sessions must not mutate them). */
export function cloneDocument(doc: EditorDocument): EditorDocument {
  return JSON.parse(JSON.stringify(doc)) as EditorDocument;
}
