import {
  createEnvironment,
  createLanguage,
  createStdlib,
  EMPTY_PORTS,
  extendLanguage,
  type Language,
  Policy,
  type PortLayer,
  type ProgramInstance,
  type Runtime,
} from "@dendrite-lang/core";

import { type EditorDocument } from "./document";

//? A Connection is the editor's entire view of the outside: the ProgramInstance it edits
// and the Language it highlights with. Where those two come from is the host's business,
// and each way of obtaining them is one function here (Adapter): build a private stack,
// join a runtime the host already runs, or attach to an instance the host already has -
// local, or a replica of a remote one. The editor cannot tell them apart, which is the
// point. `release` lets go of what the connection MADE and never of what it was handed.

export interface Connection {
  readonly instance: ProgramInstance;
  readonly language: Language;
  /** Undo what this connection created. Absent when it created nothing. */
  release?(): void;
}

/** The document layer: the last program layer and the only persisted one, what a save captures. */
const documentLayer = (document: EditorDocument): PortLayer => ({
  id: "document",
  ports: document.program.ports ?? EMPTY_PORTS,
  policy: Policy.user,
});

/**
 * Own the whole stack - a private copy of the language, a runtime, an instance. The
 * playground, where the editor IS the application.
 */
export function ownStack(options: {
  document: EditorDocument;
  /** The vocabulary the document runs against. Default: the stdlib. */
  language?: Language;
  /**
   * Port layers beneath the document's own. `global` hangs on the runtime; `program` sits
   * under the document layer, for a capability a host feeds this program alone.
   */
  layers?: { global?: readonly PortLayer[]; program?: readonly PortLayer[] };
}): Connection {
  // A copy, so nothing the editor does can reach a host's own language object.
  const language = extendLanguage(createLanguage(), options.language ?? createStdlib());
  const env = createEnvironment(language);
  const runtime = env.createRuntime({ layers: options.layers?.global });
  const instance = env.createInstance(runtime, {
    program: options.document.program,
    layers: [...(options.layers?.program ?? []), documentLayer(options.document)],
    id: "editor",
    inputValues: options.document.inputValues,
  });
  return { instance, language, release: () => instance.dispose() };
}

/**
 * Join a runtime the host runs: the editor registers its own instance on it - a draft beside
 * the host's live programs, seeing the same global values - and releases only that. The
 * runtime must have been created from `language`; the editor builds its environment from it.
 * (Named join*, not on*: every on* in this codebase is a listener.)
 */
export function joinRuntime(
  language: Language,
  runtime: Runtime,
  options: {
    document: EditorDocument;
    /** Program layers under the document's own. Global layers are the runtime's already. */
    layers?: { program?: readonly PortLayer[] };
  },
): Connection {
  const instance = createEnvironment(language).createInstance(runtime, {
    program: options.document.program,
    layers: [...(options.layers?.program ?? []), documentLayer(options.document)],
    // No id: the runtime has the host's programs on it, so core numbers this one.
    inputValues: options.document.inputValues,
  });
  return { instance, language, release: () => instance.dispose() };
}

/**
 * Attach to a program the host already runs - an instance on its runtime, or a replica of
 * one across a wire. Edits go to it directly, so they are live. Nothing is created and
 * nothing is released: closing the editor stops nothing.
 */
export function attach(language: Language, instance: ProgramInstance): Connection {
  return { instance, language };
}
