import { isPorts, migrate, type SavedProgram, type Snapshot } from "@dendrite-lang/core";

//? EditorDocument: everything an editor session IS - the host envelope the architecture
// prescribes, wrapping a core Snapshot (the program, including the ports it declares, plus
// the values those inputs are evaluated with). Self-contained: a document round-trips
// through a URL or a store with no dependence on a host's presets (presets are just
// documents you can load in).
//
// Two version axes on purpose: `version` is THIS envelope's version; `program.version` is
// core's format version (core's migrate() owns that part; migrateDocument delegates to it).
// Only renames/removals bump `version` - optional additions (a future `id`/`meta`) do not.
// Today the editor only edits code-form programs; rete-form documents slot in with the
// editor era, with no change to this shape.

export const DOCUMENT_VERSION = 2;

export interface EditorDocument extends Snapshot {
  version: typeof DOCUMENT_VERSION;
  /**
   * The program and, in `program.ports`, what it declares for itself. In the playground
   * those inputs ARE the inputs; a host with live ones (Beacon) treats the values below as
   * the editing-time sample.
   */
  program: SavedProgram;
  inputValues: Record<string, unknown>;
  /**
   * The host's revision of this document, if it keeps one. Two people editing one program
   * is a conflict a client cannot detect without it, so the slot exists before any store
   * does: retrofitting it into stored documents would be the unpleasant version. Optional
   * addition, so no version bump; the editor carries it and never interprets it.
   */
  revision?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Lite structural check for a CURRENT-version document - enough to boot safely, not a schema. */
export function isDocument(value: unknown): value is EditorDocument {
  if (!isRecord(value) || value["version"] !== DOCUMENT_VERSION) return false;
  const program = value["program"];
  return (
    isRecord(program) &&
    typeof program["form"] === "string" &&
    (program["ports"] === undefined || isPorts(program["ports"])) &&
    isRecord(value["inputValues"]) &&
    (value["revision"] === undefined || typeof value["revision"] === "number")
  );
}

// ── Migrations ───────────────────────────────────────────────────────────────
// One entry per RETIRED envelope version: how to lift a document at that version to the
// next. Written when the version is retired and never edited again - migrateDocument chains
// the steps, so a fixture from any old version keeps proving the whole path as versions
// accrue.

/** Lifts a document at one version to the next, or rejects it (null). */
export type Migration = (doc: Record<string, unknown>) => Record<string, unknown> | null;

const MIGRATIONS: Readonly<Record<number, Migration>> = {
  // v1 kept a separate `surface`: the types, inputs and outputs the document declared on top
  // of the language. Those are the program's own ports now, so the move IS the migration.
  1: (doc) => {
    const { surface, program, ...rest } = doc;
    if (!isRecord(program)) return null;
    const ports = isRecord(surface) ? { ...surface } : undefined;
    if (ports && ports["types"] === undefined) delete ports["types"];
    return { ...rest, version: 2, program: ports ? { ...program, ports } : program };
  },
};

const versionOf = (doc: Record<string, unknown>): number | undefined =>
  typeof doc["version"] === "number" ? doc["version"] : undefined;

/**
 * Step `doc` through `migrations` from its `version` up to `target`. Null when a version has
 * no migration, a step rejects its input, or a step fails to advance the version (loop
 * guard). Generic on purpose: a host wrapping EditorDocument in its own envelope chains its
 * versions the same way.
 */
export function applyMigrations(
  doc: Record<string, unknown>,
  migrations: Readonly<Record<number, Migration>>,
  target: number,
): Record<string, unknown> | null {
  let current = doc;
  for (;;) {
    const from = versionOf(current);
    if (from === undefined || from >= target) return current;
    const next = migrations[from]?.(current);
    const to = next ? versionOf(next) : undefined;
    if (!next || to === undefined || to <= from) return null;
    current = next;
  }
}

/**
 * Any envelope version (or garbage) → a current document, or null. The envelope is chained
 * up through MIGRATIONS and the inner program goes through core's migrate(), so a document
 * older on EITHER axis comes back current; one newer than this build understands comes back
 * null (fail soft - the caller falls back).
 */
export function migrateDocument(value: unknown): EditorDocument | null {
  const envelope = isRecord(value) ? applyMigrations(value, MIGRATIONS, DOCUMENT_VERSION) : null;
  if (!isDocument(envelope)) return null;
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
