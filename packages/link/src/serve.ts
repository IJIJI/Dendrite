import {
  type AttachedLayer,
  type Language,
  type ProgramInstance,
  type TypeDefinition,
} from "@dendrite-lang/core";

import {
  type Command,
  encodeOutputs,
  fingerprint,
  fingerprintDiff,
  isCommand,
  PROTOCOL,
  type Push,
  type PushBody,
  type ServerChannel,
  type WireState,
} from "./protocol";

//? The host's end: one ProgramInstance served over one channel. Several editors on one
// instance are several calls, each with its own sequence. This function only wires; the
// judgement is in the helpers below, which is what keeps it small when a fourth concern
// arrives.
//
// The server is the trust boundary. Core trusts its caller on purpose (`decisions.md`,
// "Policy is data") - setInput accepts any program-level name so a host can seed its own
// sensor - but a client is not the host, so what a layer's policy declares is enforced
// here: no editing a layer that is not editable, no feeding an input the host feeds.
// Authorisation proper - who is this client - is the host's, at its own API.

export interface ServeOptions {
  /** The language the instance runs on. A client speaking another one is refused. */
  language: Language;
  /** A dropped command, and why: malformed, refused by policy, or thrown by core. */
  onError?(error: Error, message?: unknown): void;
}

/** Why a command is refused before core sees it, or null to let it through. */
export function enforcePolicy(layers: readonly AttachedLayer[], command: Command): string | null {
  const program = layers.filter((attached) => attached.level === "program");
  switch (command.kind) {
    case "setLayer": {
      const target = program.find(({ layer }) => layer.id === command.id);
      // Unknown ids are core's to refuse (it throws); only a known, locked layer is ours.
      return target && !target.layer.policy.editable
        ? `layer '${command.id}' is not editable`
        : null;
    }
    case "setInput":
    case "fireTrigger": {
      const owner = program.find(({ layer }) =>
        layer.ports.inputs.some((input) => input.name === command.name),
      );
      return owner && owner.layer.policy.feeds === "host"
        ? `input '${command.name}' is fed by the host`
        : null;
    }
    default:
      return null;
  }
}

// A zod schema is a graph of functions: it survives neither JSON nor structured clone.
// The replica validates nothing yet, so nothing is lost by leaving it behind.
export const stripSchemas = (layers: readonly AttachedLayer[]): AttachedLayer[] =>
  layers.map((attached) => {
    const { types } = attached.layer.ports;
    if (!types?.some((type) => type.schema !== undefined)) return attached;
    const stripped = types.map(({ schema: _schema, ...type }): TypeDefinition => type);
    return {
      ...attached,
      layer: { ...attached.layer, ports: { ...attached.layer.ports, types: stripped } },
    };
  });

/**
 * Serve `instance` over `channel` until the returned function is called. Never closes the
 * channel: the host opened it.
 */
export function serveInstance(
  instance: ProgramInstance,
  channel: ServerChannel,
  options: ServeOptions,
): () => void {
  // The last command SEEN on this channel, applied or refused - stamped on every push, so
  // the client can tell a push that predates its latest command from one that follows it.
  // Refused counts: the client advanced its clock on sending, and a push stamped behind it
  // would be dropped over there until the next command. Core publishes synchronously
  // inside a command, so the stamp is exact.
  let seq = 0;
  const push = (message: PushBody): void => channel.send({ ...message, seq } as Push);
  const fail = (error: unknown, message?: unknown): void =>
    options.onError?.(error instanceof Error ? error : new Error(String(error)), message);

  const state = (): WireState => ({
    id: instance.id,
    diagnostics: instance.diagnostics.get(),
    layers: stripSchemas(instance.ports.get().layers),
    outputs: encodeOutputs(instance.outputs.get()),
    values: instance.values.get(),
    snapshot: instance.snapshot.get(),
  });

  const apply = (command: Command): void => {
    switch (command.kind) {
      case "hello": {
        if (command.protocol !== PROTOCOL) {
          push({
            kind: "rejected",
            reason: `protocol ${command.protocol} - this side speaks ${PROTOCOL}`,
          });
          return;
        }
        const diff = fingerprintDiff(command.vocabulary, fingerprint(options.language));
        if (diff.length > 0) {
          push({ kind: "rejected", reason: `language mismatch: ${diff.join("; ")}` });
          return;
        }
        push({ kind: "state", state: state() });
        return;
      }
      case "setInput":
        instance.setInput(command.name, command.value);
        return;
      case "fireTrigger":
        instance.fireTrigger(command.name, command.value);
        return;
      case "setProgram":
        instance.setProgram(command.program);
        return;
      case "setLayer":
        instance.setLayer(command.id, command.ports);
        return;
    }
  };

  const handle = (message: unknown): void => {
    if (!isCommand(message)) return fail(new Error("malformed command"), message);
    seq = message.seq;
    const refused = enforcePolicy(instance.ports.get().layers, message);
    if (refused) return fail(new Error(refused), message);
    try {
      apply(message);
    } catch (error) {
      fail(error, message); // a host bug reaching core, e.g. ports with no persisted layer
    }
  };

  const unsubscribes = [
    instance.diagnostics.subscribe((diagnostics) => push({ kind: "diagnostics", diagnostics })),
    instance.ports.subscribe((ports) =>
      push({ kind: "layers", layers: stripSchemas(ports.layers) }),
    ),
    instance.outputs.subscribe((outputs) =>
      push({ kind: "outputs", outputs: encodeOutputs(outputs) }),
    ),
    instance.values.subscribe((values) => push({ kind: "values", values })),
    instance.snapshot.subscribe((snapshot) => push({ kind: "snapshot", snapshot })),
    channel.onMessage(handle),
  ];
  return () => {
    for (const unsubscribe of unsubscribes.splice(0)) unsubscribe();
  };
}
