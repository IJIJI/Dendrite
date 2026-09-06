import { AST_NODE_KINDS, type ASTNode } from "./nodes";
import { isPorts, type Ports } from "./ports";
import { type RawProgram } from "./program";

//? SavedProgram: the durable JSON form of a program.
//
// Principle: the AUTHORING ARTIFACT is canonical, the RawProgram is derived. An AST
// loses comments, formatting, and the operator surface (desugaring is destructive).
// So SavedProgram is a tagged union of authoring forms (names mirror SourceRef kinds):
//   code - text-authored; the source string IS the program (re-parsed on load)
//   rete - graph-authored; an OPAQUE blob whose schema + loader belong to the future
//          editor package (until then env.load fails it with unsupported_form)
//   ast  - programmatic / exported-for-headless; plain-record RawProgram
// Loading always RE-ANALYSES against the load-time language, so descriptor drift
// surfaces as errors instead of silent staleness. SourceRefs are kept verbatim in the
// ast form. Provenance is preserved uniformly; whether a ref's referent still exists
// is the host's business.
//
// A program may carry its own port declarations (`ports`): the inputs, outputs and struct
// types its persisted layer contributes on top of the language and the host's layers. A
// program without `ports` declares nothing of its own.
//
// Core owns the FORMAT version (+ migrate seam below); hosts wrap their own envelope
// (ids, names, timestamps, revisions) around SavedProgram.

// Deliberately DECOUPLED from the package version: the package bumps constantly, the
// format rarely. When v2 ever exists, migrate() becomes a chain of per-version upgrade
// functions keyed off this constant.
export const SAVED_PROGRAM_VERSION = 1;

interface SavedProgramBase {
  version: typeof SAVED_PROGRAM_VERSION;
  /** The program's own port declarations (its persisted layer). Absent = declares nothing. */
  ports?: Ports;
}

export interface SavedCodeProgram extends SavedProgramBase {
  form: "code";
  source: string;
}

export interface SavedReteProgram extends SavedProgramBase {
  form: "rete";
  graph: unknown;
}

export interface SavedAstProgram extends SavedProgramBase {
  form: "ast";
  bindings: Record<string, ASTNode>;
  outputs: Record<string, ASTNode>;
}

export type SavedProgram = SavedCodeProgram | SavedReteProgram | SavedAstProgram;

// The `ports` key is written only when there is something to write, so a program that
// declares nothing serialises exactly as it did before ports existed.
const portsKey = (ports: Ports | undefined): { ports?: Ports } => (ports ? { ports } : {});

/** Wrap authored source text as a saved program (code form). */
export function serialiseSource(source: string, ports?: Ports): SavedCodeProgram {
  return { version: SAVED_PROGRAM_VERSION, form: "code", source, ...portsKey(ports) };
}

/**
 * Serialise a RawProgram to the ast form. Nodes are already JSON-safe plain objects
 * (structured Types, no functions/Maps/Sets inside), so this is a structural deep-clone
 * (decoupling the saved object from the live program) with Maps → records at the top.
 */
export function serialiseAst(program: RawProgram, ports?: Ports): SavedAstProgram {
  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
  return {
    version: SAVED_PROGRAM_VERSION,
    form: "ast",
    bindings: clone(Object.fromEntries(program.bindings)),
    outputs: clone(Object.fromEntries(program.outputs)),
    ...portsKey(ports && clone(ports)),
  };
}

/**
 * The format-migration seam: bring a SavedProgram of any supported older version up to
 * the current one.
 */
export function migrate(saved: SavedProgram): SavedProgram {
  if (saved.version !== SAVED_PROGRAM_VERSION) {
    throw new Error(
      `Unsupported SavedProgram version ${String((saved as { version: unknown }).version)} - this build supports up to v${SAVED_PROGRAM_VERSION}`,
    );
  }
  return saved;
}

// ── Structural guard ─────────────────────────────────────────────────────────
// Cheap shape validation for untrusted ast-form input (disk/DB/network). Catches
// malformed containers and unknown node kinds with descriptive errors; SEMANTIC
// validity (types, op existence, arity) is the analyser's job on load.

// Derived (not duplicated) from the compile-checked kind list in nodes.ts.
const NODE_KINDS = new Set<string>(AST_NODE_KINDS);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function assertNode(value: unknown, path: string): void {
  if (!isRecord(value)) throw new Error(`Malformed SavedProgram: ${path} is not a node object`);
  const kind = value["kind"];
  if (typeof kind !== "string" || !NODE_KINDS.has(kind)) {
    throw new Error(`Malformed SavedProgram: ${path} has unknown node kind '${String(kind)}'`);
  }
  switch (kind) {
    case "array":
      assertArray(value["items"], `${path}.items`);
      break;
    case "field":
      assertNode(value["struct"], `${path}.struct`);
      break;
    case "operation": {
      if (!isRecord(value["inputs"])) {
        throw new Error(`Malformed SavedProgram: ${path}.inputs is not a record`);
      }
      for (const [name, input] of Object.entries(value["inputs"])) {
        if (Array.isArray(input)) assertArray(input, `${path}.inputs.${name}`);
        else assertNode(input, `${path}.inputs.${name}`);
      }
      break;
    }
    case "lambda":
      if (!Array.isArray(value["params"])) {
        throw new Error(`Malformed SavedProgram: ${path}.params is not an array`);
      }
      assertNode(value["body"], `${path}.body`);
      break;
    case "app": {
      assertNode(value["callee"], `${path}.callee`);
      assertArray(value["positional"], `${path}.positional`);
      if (!isRecord(value["named"])) {
        throw new Error(`Malformed SavedProgram: ${path}.named is not a record`);
      }
      for (const [name, arg] of Object.entries(value["named"])) {
        assertNode(arg, `${path}.named.${name}`);
      }
      break;
    }
    // literal / input / ref carry no child nodes.
  }
}

function assertArray(value: unknown, path: string): void {
  if (!Array.isArray(value)) throw new Error(`Malformed SavedProgram: ${path} is not an array`);
  value.forEach((item, i) => assertNode(item, `${path}[${i}]`));
}

function assertNodeRecord(value: unknown, path: string): void {
  if (!isRecord(value)) throw new Error(`Malformed SavedProgram: ${path} is not a record`);
  for (const [name, node] of Object.entries(value)) assertNode(node, `${path}.${name}`);
}

/**
 * Guard the optional `ports` of a saved program of any form (throws descriptively). Part of
 * deserialise for the ast form; loaders of the other forms call it before trusting `ports`.
 */
export function assertSavedPorts(saved: SavedProgram): void {
  if (saved.ports !== undefined && !isPorts(saved.ports)) {
    throw new Error("Malformed SavedProgram: ports is not a Ports record");
  }
}

/**
 * Deserialise an ast-form SavedProgram back to a RawProgram. Guards the structure
 * (throws descriptively on malformed input); nodes are used as-is - only the top-level
 * records convert back to Maps.
 */
export function deserialise(saved: SavedAstProgram): RawProgram {
  assertSavedPorts(saved);
  assertNodeRecord(saved.bindings, "bindings");
  assertNodeRecord(saved.outputs, "outputs");
  return {
    bindings: new Map(Object.entries(saved.bindings)),
    outputs: new Map(Object.entries(saved.outputs)),
  };
}
