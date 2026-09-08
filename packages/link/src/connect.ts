import {
  type AttachedLayer,
  composeLayers,
  createSubject,
  type EvalResult,
  type Language,
  type Observable,
  type PortLayer,
  type Ports,
  type PortsState,
  type ProgramDiagnostic,
  type ProgramInstance,
  type SavedProgram,
  serialiseSource,
  type Snapshot,
  type Subject,
} from "@dendrite-lang/core";

import {
  type ChannelStatus,
  type ClientChannel,
  type Command,
  type CommandBody,
  decodeOutputs,
  fingerprint,
  isPush,
  PROTOCOL,
  type Push,
  type WireState,
} from "./protocol";

//? The editor's end: a ProgramInstance that IS a replica of one served elsewhere. Every
// command goes out fire-and-forget; every observable is fed by pushes. An editor cannot
// tell it from the local thing, which is the point - and where it cannot help but differ,
// it differs in the direction of feeling local:
//
//   - values are echoed at once, or a dragged slider fights the round trip; the snapshot
//     with them when the input is the persisted layer's (core's own rule, `storeValue`),
//     because the editor's debounced save reads the snapshot and can beat a slow wire;
//   - a `values` push older than the latest command sent is dropped, or the slider snaps
//     back; a `state` push is authoritative and resets that clock (reconnect);
//   - the outputs go stale the moment the channel drops, and a reconnect re-requests state
//     rather than replaying anything - the flag already means "behind the inputs".
//
// `ports` is recomposed here from the layers the server sends, with the client's own
// language: a composed descriptor holds functions and cannot cross. That is why the client
// must import the same language package, and why `hello` carries its fingerprint.

/**
 * The link's state, which is the pipe's plus one of its own: `rejected` means the server
 * refused a re-handshake after a reconnect - it was redeployed with another language, or
 * another protocol - and nothing this replica shows will move again.
 */
export type LinkStatus = ChannelStatus | "rejected";

/** A served instance, seen from the other end of the channel. */
export interface RemoteInstance extends ProgramInstance {
  readonly status: Observable<LinkStatus>;
  /**
   * Stop listening. Unlike a local instance this cannot mean "unregister from the
   * runtime": the program keeps running where it is, and the channel stays open - the host
   * opened it.
   */
  dispose(): void;
}

/**
 * Connect to an instance served on `channel`. Resolves once the server has answered with
 * the full state, so a replica never renders empty; rejects when the server refuses the
 * handshake (protocol or language mismatch).
 */
export function connectInstance(
  language: Language,
  channel: ClientChannel,
): Promise<RemoteInstance> {
  return new Promise((resolve, reject) => {
    const replica = new Replica(language, channel);
    const first = channel.onMessage((push) => {
      if (push.kind === "rejected") {
        first();
        replica.dispose();
        reject(new Error(push.reason));
      } else if (push.kind === "state") {
        first();
        resolve(replica);
      }
    });
    replica.hello();
  });
}

class Replica implements RemoteInstance {
  id = "";

  private readonly diagnostics$ = createSubject<readonly ProgramDiagnostic[]>([]);
  private readonly ports$ = createSubject<PortsState>({
    layers: [],
    composed: { ok: false, problems: [] },
  });
  private readonly outputs$ = createSubject<EvalResult>({
    outputs: null,
    error: null,
    stale: false,
  });
  private readonly values$ = createSubject<Readonly<Record<string, unknown>>>({});
  private readonly snapshot$ = createSubject<Snapshot>({
    program: serialiseSource(""),
    inputValues: {},
  });
  private readonly status$: Subject<LinkStatus>;

  readonly diagnostics: Observable<readonly ProgramDiagnostic[]> = this.diagnostics$;
  readonly ports: Observable<PortsState> = this.ports$;
  readonly outputs: Observable<EvalResult> = this.outputs$;
  readonly values: Observable<Readonly<Record<string, unknown>>> = this.values$;
  readonly snapshot: Observable<Snapshot> = this.snapshot$;
  readonly status: Observable<LinkStatus>;

  // Our command counter, and the newest command a push must reflect to be applied.
  private seq = 0;
  private lastSent = 0;
  private readonly unsubscribes: (() => void)[] = [];

  constructor(
    private readonly language: Language,
    private readonly channel: ClientChannel,
  ) {
    this.status$ = createSubject<LinkStatus>(channel.status?.get() ?? "connected");
    this.status = this.status$;
    this.unsubscribes.push(channel.onMessage((push) => this.apply(push)));
    if (channel.status) {
      this.unsubscribes.push(channel.status.subscribe((status) => this.onStatus(status)));
    }
  }

  // ── commands ───────────────────────────────────────────────────────────────

  hello(): void {
    this.send({ kind: "hello", protocol: PROTOCOL, vocabulary: fingerprint(this.language) });
  }

  setInput(name: string, value: unknown): void {
    this.assertProgramInput(name);
    // Echo only what a user feeds: the server refuses a host-fed input, and a replica that
    // showed the write anyway would be lying until the next push.
    const owner = this.ownerOf(name);
    if (owner?.policy.feeds === "user") {
      this.values$.set({ ...this.values$.get(), [name]: value });
      if (owner.policy.persisted) {
        const snapshot = this.snapshot$.get();
        this.snapshot$.set({
          ...snapshot,
          inputValues: { ...snapshot.inputValues, [name]: value },
        });
      }
    }
    this.send({ kind: "setInput", name, value });
  }

  fireTrigger(name: string, value: unknown): void {
    this.assertProgramInput(name);
    this.send({ kind: "fireTrigger", name, value });
  }

  setProgram(program: SavedProgram): void {
    if (program.ports && !this.persistedLayer()) {
      throw new Error(
        `Instance '${this.id}' has no persisted layer, so a program's own ports have nowhere to go`,
      );
    }
    this.send({ kind: "setProgram", program });
  }

  setLayer(id: string, ports: Ports): void {
    if (!this.programLayers().some((layer) => layer.id === id)) {
      throw new Error(`No program-level layer '${id}' on instance '${this.id}'`);
    }
    this.send({ kind: "setLayer", id, ports });
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribes.splice(0)) unsubscribe();
  }

  // ── the wire ───────────────────────────────────────────────────────────────

  private send(command: CommandBody): void {
    this.seq += 1;
    this.lastSent = this.seq;
    this.channel.send({ ...command, seq: this.seq } as Command);
  }

  private apply(push: Push): void {
    if (!isPush(push)) return; // a server is trusted no further than a client is
    switch (push.kind) {
      case "state":
        // Authoritative: the server's clock, not ours, is the one pushes are stamped with
        // (it restarts per connection), and its state is by definition current.
        this.lastSent = push.seq;
        this.applyState(push.state);
        return;
      case "values":
        // Older than our latest command: the server had not seen it yet. Applying this
        // would snap a slider back to where it was.
        if (push.seq < this.lastSent) return;
        this.values$.set(push.values);
        return;
      case "diagnostics":
        this.diagnostics$.set(push.diagnostics);
        return;
      case "layers":
        this.ports$.set(this.compose(push.layers));
        return;
      case "outputs":
        this.outputs$.set(decodeOutputs(push.outputs));
        return;
      case "snapshot":
        this.snapshot$.set(push.snapshot);
        return;
      case "rejected":
        // Before the handshake completes connectInstance turns this into a rejection; after
        // it, a reconnect was refused, and what is on screen will not move again.
        this.status$.set("rejected");
        this.outputs$.set({ ...this.outputs$.get(), stale: true });
        return;
    }
  }

  private applyState(state: WireState): void {
    this.id = state.id;
    this.diagnostics$.set(state.diagnostics);
    this.ports$.set(this.compose(state.layers));
    this.outputs$.set(decodeOutputs(state.outputs));
    this.values$.set(state.values);
    this.snapshot$.set(state.snapshot);
  }

  private onStatus(status: ChannelStatus): void {
    this.status$.set(status);
    if (status === "disconnected") {
      // Whatever is on screen is now behind whatever the inputs are doing over there.
      this.outputs$.set({ ...this.outputs$.get(), stale: true });
    } else {
      this.hello();
    }
  }

  // Same shape Instance.recompile publishes, from the same function.
  private compose(layers: readonly AttachedLayer[]): PortsState {
    const of = (level: AttachedLayer["level"]): PortLayer[] =>
      layers.filter((attached) => attached.level === level).map((attached) => attached.layer);
    return {
      layers,
      composed: composeLayers(this.language.descriptor, of("global"), of("program")),
    };
  }

  // ── views over the layers, mirroring the local instance's rules ────────────

  private programLayers(): PortLayer[] {
    return this.ports$
      .get()
      .layers.filter((attached) => attached.level === "program")
      .map((attached) => attached.layer);
  }

  private persistedLayer(): PortLayer | undefined {
    return this.programLayers().find((layer) => layer.policy.persisted);
  }

  private ownerOf(name: string): PortLayer | undefined {
    return this.programLayers().find((layer) =>
      layer.ports.inputs.some((input) => input.name === name),
    );
  }

  private assertProgramInput(name: string): void {
    if (!this.ownerOf(name)) {
      throw new Error(`'${name}' is not a program-level input of instance '${this.id}'`);
    }
  }
}
