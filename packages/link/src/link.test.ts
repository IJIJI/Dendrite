import {
  createEnvironment,
  createStdlib,
  createSubject,
  type Language,
  Policy,
  type PortLayer,
  type Ports,
  type ProgramInstance,
  serialiseSource,
  type Subject,
  Type,
} from "@dendrite-lang/core";
import { type AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";
import WebSocket, { WebSocketServer } from "ws";
import { z } from "zod";

import { messagePortChannel } from "./channels/message-port";
import { webSocketChannel } from "./channels/web-socket";
import { connectInstance, type RemoteInstance } from "./connect";
import {
  type Channel,
  type ChannelStatus,
  type ClientChannel,
  type Command,
  type CommandBody,
  encodeOutputs,
  fingerprint,
  PROTOCOL,
  type Push,
  type ServerChannel,
} from "./protocol";
import { enforcePolicy, serveInstance, stripSchemas } from "./serve";

// ── fixtures ─────────────────────────────────────────────────────────────────

const HOST: PortLayer = {
  id: "host",
  ports: {
    inputs: [{ name: "g", type: Type.number }],
    outputs: [{ name: "out", type: Type.number }],
  },
  policy: Policy.host,
};
const DOC: Ports = { inputs: [{ name: "p", type: Type.number }], outputs: [] };
const SOURCE = "output out = Add($g, $p)";

function live(language: Language = createStdlib(), extraLayers: PortLayer[] = []) {
  const env = createEnvironment(language);
  const runtime = env.createRuntime({ layers: [HOST] });
  const instance = env.createInstance(runtime, {
    program: serialiseSource(SOURCE, DOC),
    layers: [...extraLayers, { id: "document", ports: DOC, policy: Policy.user }],
    id: "lighthouse",
  });
  return { language, runtime, instance };
}

/**
 * Two ends of an in-memory link, delivered only when the test says so - so ordering is the
 * test's to control. Messages round-trip through JSON, which is what a real pipe would do
 * and what catches a payload that is not data.
 */
function pair(): {
  client: ClientChannel;
  server: ServerChannel;
  flush(): void;
  status: Subject<ChannelStatus>;
  sent: { toServer: unknown[]; toClient: unknown[] };
} {
  const status = createSubject<ChannelStatus>("connected");
  const toServer: unknown[] = [];
  const toClient: unknown[] = [];
  const serverListeners = new Set<(m: Command) => void>();
  const clientListeners = new Set<(m: Push) => void>();
  const roundTrip = <T>(m: unknown): T => JSON.parse(JSON.stringify(m)) as T;
  const end = <Out, In>(
    queue: unknown[],
    listeners: Set<(m: In) => void>,
    withStatus: boolean,
  ): Channel<Out, In> => ({
    send: (m) => queue.push(roundTrip(m)),
    onMessage(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    ...(withStatus ? { status } : {}),
  });
  const flush = (): void => {
    while (toServer.length || toClient.length) {
      while (toServer.length) {
        const m = toServer.shift() as Command;
        for (const l of [...serverListeners]) l(m);
      }
      while (toClient.length) {
        const m = toClient.shift() as Push;
        for (const l of [...clientListeners]) l(m);
      }
    }
  };
  return {
    client: end<Command, Push>(toServer, clientListeners, true),
    server: end<Push, Command>(toClient, serverListeners, false),
    flush,
    status,
    sent: { toServer, toClient },
  };
}

/** A served instance and a connected replica over a manual pair, already handshaken. */
async function linked(options: { language?: Language; extraLayers?: PortLayer[] } = {}) {
  const host = live(options.language, options.extraLayers);
  const link = pair();
  const onError = vi.fn();
  const stop = serveInstance(host.instance, link.server, { language: host.language, onError });
  const pending = connectInstance(host.language, link.client);
  link.flush();
  const replica = await pending;
  return { ...host, ...link, stop, onError, replica };
}

const outputOf = (instance: ProgramInstance): unknown => instance.outputs.get().outputs?.get("out");

// ── the handshake ────────────────────────────────────────────────────────────

describe("connect", () => {
  it("resolves with the served instance's five observables", async () => {
    const { instance, replica } = await linked();
    expect(replica.id).toBe("lighthouse");
    expect(replica.diagnostics.get()).toEqual(instance.diagnostics.get());
    expect(replica.values.get()).toEqual(instance.values.get());
    expect(replica.snapshot.get()).toEqual(instance.snapshot.get());
    expect(replica.outputs.get()).toEqual(instance.outputs.get()); // a Map again
    expect(outputOf(replica)).toBe(0);
    // Recomposed here, from the layers: the descriptor is a real one, functions and all.
    const ports = replica.ports.get();
    expect(ports.layers.map((l) => l.layer.id)).toEqual(["host", "document"]);
    expect(ports.composed.ok && ports.composed.descriptor.inputs.has("g")).toBe(true);
    expect(ports.composed.ok && ports.composed.descriptor.ops.has("Add")).toBe(true);
  });

  it("refuses a client whose language differs, naming the difference", async () => {
    const host = live();
    const other = createStdlib();
    other.registerOp({ name: "Extra", inputs: [], output: Type.number });
    const link = pair();
    serveInstance(host.instance, link.server, { language: host.language });
    const pending = connectInstance(other, link.client);
    link.flush();
    await expect(pending).rejects.toThrow(/Extra/);
  });

  it("connects two separate builds of the same language", async () => {
    const host = live(createStdlib());
    const link = pair();
    serveInstance(host.instance, link.server, { language: host.language });
    const pending = connectInstance(createStdlib(), link.client);
    link.flush();
    await expect(pending).resolves.toBeDefined();
  });

  it("refuses another protocol version", () => {
    const host = live();
    const link = pair();
    serveInstance(host.instance, link.server, { language: host.language });
    const received: Push[] = [];
    link.client.onMessage((m) => received.push(m));
    link.client.send({
      seq: 1,
      kind: "hello",
      protocol: PROTOCOL + 1,
      vocabulary: fingerprint(host.language),
    });
    link.flush();
    expect(received).toEqual([
      expect.objectContaining({ kind: "rejected", reason: expect.stringMatching(/protocol 2/) }),
    ]);
  });
});

// ── commands and pushes ──────────────────────────────────────────────────────

describe("setInput", () => {
  it("echoes at once, reaches the server, and the outputs come back", async () => {
    const { instance, replica, flush } = await linked();
    replica.setInput("p", 4);
    expect(replica.values.get()).toEqual({ p: 4 }); // before any push
    expect(instance.values.get()).toEqual({ p: 0 }); // nothing delivered yet
    flush();
    expect(instance.values.get()).toEqual({ p: 4 });
    expect(outputOf(instance)).toBe(4);
    expect(outputOf(replica)).toBe(4);
  });

  it("echoes into the snapshot for a persisted input, and never for a host-fed one", async () => {
    const sensor: PortLayer = {
      id: "cap",
      ports: { inputs: [{ name: "sensor", type: Type.number }], outputs: [] },
      policy: Policy.host,
    };
    const { replica, instance, flush, onError } = await linked({ extraLayers: [sensor] });
    replica.setInput("p", 7);
    expect(replica.snapshot.get().inputValues).toEqual({ p: 7 }); // before any push

    replica.setInput("sensor", 9);
    expect(replica.values.get()["sensor"]).toBe(0); // not echoed: not the user's to feed
    flush();
    expect(instance.values.get()["sensor"]).toBe(0); // and refused over there
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/fed by the host/) }),
      expect.anything(),
    );
  });

  it("drops a values push older than the latest command, and adopts a state push's clock", async () => {
    const { replica, instance, flush, sent } = await linked();
    replica.setInput("p", 1);
    replica.setInput("p", 2); // seq 3 - hello was 1
    flush();
    // A push stamped before the server saw either: must not snap the slider back.
    (sent.toClient as Push[]).push({ kind: "values", seq: 2, values: { p: 1 } });
    flush();
    expect(replica.values.get()).toEqual({ p: 2 });

    // A state push is authoritative and resets the clock (a reconnected server counts
    // from zero again); what follows on that clock applies.
    (sent.toClient as Push[]).push({
      kind: "state",
      seq: 0,
      state: {
        id: "lighthouse",
        diagnostics: [],
        layers: instance.ports.get().layers,
        outputs: encodeOutputs(instance.outputs.get()),
        values: { p: 42 },
        snapshot: instance.snapshot.get(),
      },
    });
    (sent.toClient as Push[]).push({ kind: "values", seq: 0, values: { p: 43 } });
    flush();
    expect(replica.values.get()).toEqual({ p: 43 });
  });
});

describe("setLayer and setProgram", () => {
  it("a refused layer change arrives as a refused diagnostic; the layers stay", async () => {
    const { replica, flush } = await linked();
    const before = replica.ports.get();
    replica.setLayer("document", { inputs: [{ name: "g", type: Type.number }], outputs: [] });
    flush();
    expect(replica.diagnostics.get()).toEqual([
      expect.objectContaining({ stage: "ports", kind: "shadowed_name", refused: true }),
    ]);
    expect(replica.ports.get()).toBe(before);
  });

  it("an applied layer change recomposes the replica's descriptor", async () => {
    const { replica, flush } = await linked();
    replica.setLayer("document", {
      inputs: [
        { name: "p", type: Type.number },
        { name: "q", type: Type.string },
      ],
      outputs: [],
    });
    flush();
    const { composed } = replica.ports.get();
    expect(composed.ok && composed.descriptor.inputs.get("q")?.type).toEqual(Type.string);
    expect(replica.values.get()).toEqual({ p: 0, q: "" });
  });

  it("setProgram flows through: diagnostics, outputs and snapshot follow", async () => {
    const { instance, replica, flush } = await linked();
    replica.setProgram(serialiseSource("output out = Multiply($g, $p, 2)"));
    flush();
    expect(replica.snapshot.get()).toEqual(instance.snapshot.get());
    expect(replica.snapshot.get().program).toMatchObject({
      source: "output out = Multiply($g, $p, 2)",
    });
    replica.setInput("p", 3);
    flush();
    expect(outputOf(replica)).toBe(0); // g is 0
  });

  it("refuses locally what a local instance refuses, and sends nothing", async () => {
    const { replica, sent } = await linked();
    const before = sent.toServer.length;
    expect(() => replica.setInput("nope", 1)).toThrow(/not a program-level input/);
    expect(() => replica.setLayer("nope", DOC)).toThrow(/No program-level layer/);
    expect(sent.toServer.length).toBe(before);
  });

  it("setProgram with ports on an instance with no persisted layer throws locally", async () => {
    const env = createEnvironment(createStdlib());
    const runtime = env.createRuntime({ layers: [HOST] });
    const instance = env.createInstance(runtime, {
      program: serialiseSource("output out = $g"),
      layers: [],
    });
    const link = pair();
    serveInstance(instance, link.server, { language: env.language });
    const pending = connectInstance(env.language, link.client);
    link.flush();
    const replica = await pending;
    expect(() => replica.setProgram(serialiseSource("output out = $g", DOC))).toThrow(
      /no persisted layer/,
    );
  });
});

// ── the server as trust boundary ─────────────────────────────────────────────

describe("enforcePolicy", () => {
  const layers = [
    { level: "global" as const, layer: HOST },
    {
      level: "program" as const,
      layer: {
        id: "cap",
        ports: { inputs: [{ name: "sensor", type: Type.number }], outputs: [] },
        policy: Policy.host,
      },
    },
    { level: "program" as const, layer: { id: "document", ports: DOC, policy: Policy.user } },
  ];
  const cmd = (c: CommandBody): Command => ({ ...c, seq: 1 });

  it.each<[CommandBody, string | null]>([
    [{ kind: "setLayer", id: "document", ports: DOC }, null],
    [{ kind: "setLayer", id: "cap", ports: DOC }, "layer 'cap' is not editable"],
    [{ kind: "setLayer", id: "nope", ports: DOC }, null], // core's to throw
    [{ kind: "setInput", name: "p", value: 1 }, null],
    [{ kind: "setInput", name: "sensor", value: 1 }, "input 'sensor' is fed by the host"],
    [{ kind: "fireTrigger", name: "sensor", value: 1 }, "input 'sensor' is fed by the host"],
    [{ kind: "setInput", name: "g", value: 1 }, null], // global: core's to throw
    [{ kind: "hello", protocol: PROTOCOL, vocabulary: { ops: [], types: [] } }, null],
  ])("%o → %s", (command, verdict) => {
    expect(enforcePolicy(layers, cmd(command))).toBe(verdict);
  });

  it("holds on the wire: a locked layer is not edited and the instance is untouched", async () => {
    const cap: PortLayer = {
      id: "cap",
      ports: { inputs: [{ name: "sensor", type: Type.number }], outputs: [] },
      policy: Policy.host,
    };
    const { instance, replica, flush, onError } = await linked({ extraLayers: [cap] });
    const before = instance.ports.get();
    replica.setLayer("cap", { inputs: [], outputs: [] });
    flush();
    expect(instance.ports.get()).toBe(before);
    // A refused command still advanced the server's clock: what the host does next must
    // still reach the replica, not be dropped as predating the refused command.
    instance.setInput("p", 4);
    flush();
    expect(replica.values.get()["p"]).toBe(4);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "layer 'cap' is not editable" }),
      expect.anything(),
    );
  });

  it("drops malformed messages and core's own throws, reporting each", async () => {
    const { client, flush, onError, instance } = await linked();
    client.send({ nope: true } as unknown as Command);
    flush();
    expect(onError).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: "malformed command" }),
      { nope: true },
    );
    // Bypass the replica's local check: ports for an instance whose layers the server owns.
    client.send({ seq: 99, kind: "setLayer", id: "nope", ports: DOC });
    flush();
    expect(onError).toHaveBeenLastCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/No program-level layer .nope./) }),
      expect.anything(),
    );
    expect(outputOf(instance)).toBe(0);
  });
});

describe("what crosses", () => {
  it("strips a zod schema from a host layer's types; the replica still composes", async () => {
    const language = createStdlib();
    const typed: PortLayer = {
      id: "typed",
      ports: {
        types: [{ name: "Even", extends: "number", schema: z.number().refine((n) => n % 2 === 0) }],
        inputs: [{ name: "even", type: Type.name("Even") }],
        outputs: [],
      },
      policy: Policy.host,
    };
    const { replica, sent } = await linked({ language, extraLayers: [typed] });
    const layers = replica.ports.get().layers.map((l) => l.layer);
    const evenType = layers.find((l) => l.id === "typed")?.ports.types?.[0];
    expect(evenType).toEqual({ name: "Even", extends: "number" });
    expect(replica.ports.get().composed.ok).toBe(true);
    expect(JSON.stringify(sent)).not.toContain("schema");
  });

  it("stripSchemas leaves layers without schemas as the same objects", () => {
    const layers = [{ level: "global" as const, layer: HOST }];
    expect(stripSchemas(layers)[0]).toBe(layers[0]);
  });
});

// ── lifecycle ────────────────────────────────────────────────────────────────

describe("status", () => {
  it("marks outputs stale on disconnect and re-syncs on reconnect", async () => {
    const { replica, instance, status, flush, sent } = await linked();
    status.set("disconnected");
    expect(replica.status.get()).toBe("disconnected");
    expect(replica.outputs.get().stale).toBe(true);

    // Meanwhile the host moves on.
    instance.setInput("p", 11);
    sent.toClient.length = 0; // those pushes were lost with the connection

    status.set("connected");
    expect(sent.toServer.at(-1)).toMatchObject({ kind: "hello" });
    flush();
    expect(replica.status.get()).toBe("connected");
    expect(replica.outputs.get().stale).toBe(false);
    expect(replica.values.get()).toEqual({ p: 11 });
    expect(outputOf(replica)).toBe(11);
  });
});

describe("status", () => {
  it("reports a refused re-handshake: the server no longer speaks this language", async () => {
    const { replica, stop, server, status, flush } = await linked();
    stop();
    const other = createStdlib();
    other.registerType("Extra", {}); // a type, so the language still validates as a whole
    serveInstance(live(other).instance, server, { language: other });

    status.set("disconnected");
    status.set("connected");
    flush();
    expect(replica.status.get()).toBe("rejected");
    expect(replica.outputs.get().stale).toBe(true);
  });
});

describe("teardown", () => {
  it("stopping the server ends pushes; disposing the replica ends listening; the pipe stays", async () => {
    const { instance, replica, stop, flush, sent, client } = await linked();
    stop();
    instance.setInput("p", 5);
    expect(sent.toClient).toEqual([]);

    replica.dispose();
    let delivered = 0;
    client.onMessage(() => delivered++);
    // The pipe itself still works for anyone else listening on it.
    (sent.toClient as Push[]).push({ kind: "values", seq: 0, values: { p: 5 } });
    flush();
    expect(delivered).toBe(1);
    expect(replica.values.get()).toEqual({ p: 0 }); // the replica no longer listens
  });

  it("two clients on one instance each get every push, on their own clock", async () => {
    const host = live();
    const a = pair();
    const b = pair();
    serveInstance(host.instance, a.server, { language: host.language });
    serveInstance(host.instance, b.server, { language: host.language });
    const pa = connectInstance(host.language, a.client);
    const pb = connectInstance(host.language, b.client);
    a.flush();
    b.flush();
    const [ra, rb] = await Promise.all([pa, pb]);

    const seen: Push[] = [];
    b.client.onMessage((m) => seen.push(m));
    ra.setInput("p", 8);
    a.flush();
    b.flush();
    expect(rb.values.get()).toEqual({ p: 8 });
    // b sent only its hello (seq 1); a's command is not on b's clock.
    expect(seen.every((m) => m.seq === 1)).toBe(true);
  });
});

// ── a real pipe ──────────────────────────────────────────────────────────────

describe("over a MessageChannel", () => {
  it("round-trips through structured clone, asynchronously", async () => {
    const host = live();
    const { port1, port2 } = new MessageChannel();
    const stop = serveInstance(host.instance, messagePortChannel<Push, Command>(port1), {
      language: host.language,
    });
    const replica: RemoteInstance = await connectInstance(
      createStdlib(),
      messagePortChannel<Command, Push>(port2),
    );
    expect(outputOf(replica)).toBe(0);

    replica.setInput("p", 9);
    await vi.waitFor(() => expect(host.instance.values.get()).toEqual({ p: 9 }));
    await vi.waitFor(() => expect(outputOf(replica)).toBe(9));

    stop();
    replica.dispose();
    port1.close();
    port2.close();
  });
});

describe("over a WebSocket", () => {
  it("handshakes once the socket opens, round-trips JSON, and goes stale on close", async () => {
    const host = live();
    const wss = new WebSocketServer({ port: 0 });
    await new Promise((resolve) => wss.once("listening", resolve));
    const { port } = wss.address() as AddressInfo;
    const stops: (() => void)[] = [];
    wss.on("connection", (socket) => {
      stops.push(
        serveInstance(host.instance, webSocketChannel(socket), { language: host.language }),
      );
    });

    // connectInstance says hello at once, into a socket that is not open yet; that one is
    // dropped, and the one the channel's status flip triggers is the one that counts.
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    const replica = await connectInstance(createStdlib(), webSocketChannel(socket));
    expect(replica.status.get()).toBe("connected");
    expect(outputOf(replica)).toBe(0);

    replica.setInput("p", 6);
    await vi.waitFor(() => expect(host.instance.values.get()).toEqual({ p: 6 }));
    await vi.waitFor(() => expect(outputOf(replica)).toBe(6));

    socket.close();
    await vi.waitFor(() => expect(replica.status.get()).toBe("disconnected"));
    expect(replica.outputs.get().stale).toBe(true);

    for (const stop of stops) stop();
    replica.dispose();
    await new Promise((resolve) => wss.close(resolve));
  });
});
