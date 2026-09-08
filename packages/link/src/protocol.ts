import {
  type AttachedLayer,
  EvalError,
  type EvalErrorKind,
  type EvalResult,
  isPorts,
  type Language,
  type Observable,
  type Ports,
  type ProgramDiagnostic,
  type SavedProgram,
  type Snapshot,
} from "@dendrite-lang/core";

//? The wire, as data. A ProgramInstance is five observables and four commands, every
// command returning nothing and reporting through the observables - which is exactly the
// shape a wire wants. So the link is two message types: Commands go client → server,
// sequence-numbered and fire-and-forget; Pushes go server → client, one per observable,
// each stamped with the last command the server had applied when it sent it.
//
// Dendrite owns these shapes and both ends (serve.ts, connect.ts). The host owns the
// PIPE: a Channel is the one thing it implements, over whatever it already has - a
// WebSocket, a MessagePort, an IPC bridge, a request + an event stream. Everything here
// is JSON-safe on purpose; the codecs at the bottom are the two places core's runtime
// shapes are not.

/** The wire format this build speaks. Both ends must agree, so `hello` carries it. */
export const PROTOCOL = 1;

export type ChannelStatus = "connected" | "disconnected";

/**
 * The host's pipe. `Out` and `In` are the two message types, one way each; the two ends
 * of a link see them swapped (ClientChannel / ServerChannel). `status` is optional:
 * absent means "always connected" - a MessagePort, an in-process pair.
 */
export interface Channel<Out, In> {
  send(message: Out): void;
  /** Listen for messages. Returns the unsubscribe function. */
  onMessage(listener: (message: In) => void): () => void;
  status?: Observable<ChannelStatus>;
}

export type ClientChannel = Channel<Command, Push>;
export type ServerChannel = Channel<Push, Command>;

/** Sorted op and type names: enough to catch two builds of a language disagreeing. */
export interface Fingerprint {
  ops: string[];
  types: string[];
}

export const fingerprint = (language: Language): Fingerprint => ({
  ops: [...language.descriptor.ops.keys()].sort(),
  types: [...language.descriptor.types.keys()].sort(),
});

/** What one side has that the other lacks, as text. Empty when the two agree. */
export function fingerprintDiff(client: Fingerprint, server: Fingerprint): string[] {
  const lines: string[] = [];
  for (const kind of ["ops", "types"] as const) {
    const here = new Set(server[kind]);
    const there = new Set(client[kind]);
    const onlyClient = client[kind].filter((name) => !here.has(name));
    const onlyServer = server[kind].filter((name) => !there.has(name));
    if (onlyClient.length) lines.push(`${kind} only the client knows: ${onlyClient.join(", ")}`);
    if (onlyServer.length) lines.push(`${kind} only the server knows: ${onlyServer.join(", ")}`);
  }
  return lines;
}

// ── client → server ──────────────────────────────────────────────────────────

/** A command before the client stamps its sequence number on it. */
export type CommandBody =
  /** Sent on every (re)connect; answered with `state`, or `rejected`. */
  | { kind: "hello"; protocol: number; vocabulary: Fingerprint }
  | { kind: "setInput"; name: string; value: unknown }
  | { kind: "fireTrigger"; name: string; value: unknown }
  | { kind: "setProgram"; program: SavedProgram }
  | { kind: "setLayer"; id: string; ports: Ports };

export type Command = CommandBody & { seq: number };

// ── server → client ──────────────────────────────────────────────────────────

/** A push before the server stamps it with the last command it applied on this channel. */
export type PushBody =
  | { kind: "rejected"; reason: string }
  | { kind: "state"; state: WireState }
  | { kind: "diagnostics"; diagnostics: readonly ProgramDiagnostic[] }
  /** The layers only - the client recomposes; a composed descriptor holds functions. */
  | { kind: "layers"; layers: readonly AttachedLayer[] }
  | { kind: "outputs"; outputs: WireOutputs }
  | { kind: "values"; values: Readonly<Record<string, unknown>> }
  | { kind: "snapshot"; snapshot: Snapshot };

export type Push = PushBody & { seq: number };

export interface WireOutputs {
  outputs: [string, unknown][] | null;
  error: { kind: EvalErrorKind; message: string } | null;
  stale: boolean;
}

/** All five observables at once, so a replica never renders empty. */
export interface WireState {
  id: string;
  diagnostics: readonly ProgramDiagnostic[];
  layers: readonly AttachedLayer[];
  outputs: WireOutputs;
  values: Readonly<Record<string, unknown>>;
  snapshot: Snapshot;
}

// ── codecs: the two runtime shapes that are not JSON ─────────────────────────

export const encodeOutputs = (result: EvalResult): WireOutputs => ({
  outputs: result.outputs ? [...result.outputs] : null,
  error: result.error ? { kind: result.error.kind, message: result.error.message } : null,
  stale: result.stale,
});

export const decodeOutputs = (wire: WireOutputs): EvalResult => ({
  outputs: wire.outputs ? new Map(wire.outputs) : null,
  error: wire.error ? new EvalError(wire.error.kind, wire.error.message) : null,
  stale: wire.stale,
});

// ── guards: the trust boundary ───────────────────────────────────────────────
// Structural, not schemas: enough that a message cannot make either end throw on a shape
// it never expected. Core's own loaders judge the rest - a malformed program becomes a
// `load` diagnostic, a bad port name a `ports` one.

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isStamped = (value: unknown): value is Record<string, unknown> & { seq: number } =>
  isRecord(value) && Number.isInteger(value["seq"]);

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const isFingerprint = (value: unknown): value is Fingerprint =>
  isRecord(value) && isStringArray(value["ops"]) && isStringArray(value["types"]);

const isSavedProgram = (value: unknown): value is SavedProgram =>
  isRecord(value) &&
  typeof value["version"] === "number" &&
  (value["form"] === "code" || value["form"] === "ast" || value["form"] === "rete") &&
  (value["form"] !== "code" || typeof value["source"] === "string") &&
  (value["ports"] === undefined || isPorts(value["ports"]));

const isAttachedLayer = (value: unknown): value is AttachedLayer =>
  isRecord(value) &&
  (value["level"] === "global" || value["level"] === "program") &&
  isRecord(value["layer"]) &&
  typeof value["layer"]["id"] === "string" &&
  isPorts(value["layer"]["ports"]) &&
  isRecord(value["layer"]["policy"]);

const isWireOutputs = (value: unknown): value is WireOutputs =>
  isRecord(value) &&
  (value["outputs"] === null || Array.isArray(value["outputs"])) &&
  (value["error"] === null || isRecord(value["error"])) &&
  typeof value["stale"] === "boolean";

export function isCommand(value: unknown): value is Command {
  if (!isStamped(value)) return false;
  switch (value["kind"]) {
    case "hello":
      return typeof value["protocol"] === "number" && isFingerprint(value["vocabulary"]);
    case "setInput":
    case "fireTrigger":
      return typeof value["name"] === "string";
    case "setProgram":
      return isSavedProgram(value["program"]);
    case "setLayer":
      return typeof value["id"] === "string" && isPorts(value["ports"]);
    default:
      return false;
  }
}

export function isPush(value: unknown): value is Push {
  if (!isStamped(value)) return false;
  switch (value["kind"]) {
    case "rejected":
      return typeof value["reason"] === "string";
    case "state": {
      const state = value["state"];
      return (
        isRecord(state) &&
        typeof state["id"] === "string" &&
        Array.isArray(state["diagnostics"]) &&
        Array.isArray(state["layers"]) &&
        state["layers"].every(isAttachedLayer) &&
        isWireOutputs(state["outputs"]) &&
        isRecord(state["values"]) &&
        isRecord(state["snapshot"])
      );
    }
    case "diagnostics":
      return Array.isArray(value["diagnostics"]);
    case "layers":
      return Array.isArray(value["layers"]) && value["layers"].every(isAttachedLayer);
    case "outputs":
      return isWireOutputs(value["outputs"]);
    case "values":
      return isRecord(value["values"]);
    case "snapshot":
      return isRecord(value["snapshot"]);
    default:
      return false;
  }
}
