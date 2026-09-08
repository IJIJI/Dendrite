import {
  createEnvironment,
  createStdlib,
  Policy,
  type PortLayer,
  serialiseSource,
  Type,
} from "@dendrite-lang/core";
import { WebSocketServer } from "ws";

import { serveInstance, webSocketChannel } from "../src/index";

//? A host, as small as one gets: one runtime with a host contract, one program on it,
// served to every WebSocket that connects. A global input ticks once a second so a
// connected editor visibly follows. Run: `yarn workspace @dendrite-lang/link example`.

const PORT = Number(process.env["PORT"] ?? 8787);

const language = createStdlib();
const host: PortLayer = {
  id: "host",
  ports: {
    inputs: [{ name: "tick", type: Type.number }],
    outputs: [{ name: "out", type: Type.number }],
  },
  policy: Policy.host,
};

const env = createEnvironment(language);
const runtime = env.createRuntime({ layers: [host] });
const instance = env.createInstance(runtime, {
  id: "lighthouse",
  program: serialiseSource("output out = Add($tick, $offset)", {
    inputs: [{ name: "offset", type: Type.number }],
    outputs: [],
  }),
});

const server = new WebSocketServer({ port: PORT });
server.on("connection", (socket, request) => {
  const who = request.socket.remoteAddress ?? "?";
  console.log(`+ ${who}`);
  const stop = serveInstance(instance, webSocketChannel(socket), {
    language,
    onError: (error, message) => console.warn(`  dropped from ${who}: ${error.message}`, message),
  });
  socket.on("close", () => {
    stop();
    console.log(`- ${who}`);
  });
});

let tick = 0;
setInterval(() => runtime.updateInputs({ tick: (tick += 1) % 100 }), 1000);

console.log(`serving '${instance.id}' on ws://localhost:${PORT}`);
