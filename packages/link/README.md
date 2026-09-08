# @dendrite-lang/link

Drive a core `ProgramInstance` across a channel. A host **serves** one; an editor **connects**
a replica that _is_ a `ProgramInstance` - five observables, four commands - and cannot be told
from the local thing. Dendrite owns the message shapes and both ends; the host owns the pipe.

```ts
// the host (node, Electron main, a worker - wherever core runs)
import { serveInstance, webSocketChannel } from "@dendrite-lang/link";
wss.on("connection", (socket) => {
  const stop = serveInstance(instance, webSocketChannel(socket), { language, onError });
  socket.on("close", stop);
});

// the editor (a browser, usually)
import { connectInstance, webSocketChannel } from "@dendrite-lang/link";
import { attach } from "@dendrite-lang/editor";
const replica = await connectInstance(language, webSocketChannel(new WebSocket(url)));
<Editor connection={attach(language, replica)}>…</Editor>;
```

## The wire

Every instance command already returns nothing and reports through the observables, which is
exactly the shape a wire wants. So the link is two message types, JSON all the way:

| Direction       | Message                                                      | Notes                                                                                                |
| --------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| client → server | `hello { protocol, vocabulary }`                             | On every (re)connect. Answered with `state`, or `rejected` when the protocol or the language differs |
|                 | `setInput` · `fireTrigger` · `setProgram` · `setLayer`       | Fire-and-forget, each stamped with a client sequence number `seq`                                    |
| server → client | `state` (all five observables at once)                       | So a replica never renders empty                                                                     |
|                 | `diagnostics` · `layers` · `outputs` · `values` · `snapshot` | One per observable, stamped with the last command the server had seen on this channel                |

**The replica recomposes `ports` itself.** A composed descriptor holds functions (evaluators,
`inferOutput`), so the server sends the layers and the client composes them with _its_ language.
That is why the client imports the same language package - a language is code - and why `hello`
carries a fingerprint of it: two builds that disagree are refused with the difference named,
rather than being silently wrong.

**What makes remote feel local**, all in the replica:

- `setInput` echoes into `values` at once (and into `snapshot` for the persisted layer's inputs,
  so a debounced save cannot beat the round trip), or a dragged slider fights the wire.
- A `values` push stamped before the client's latest command is dropped, or the slider snaps
  back. A `state` push is authoritative and resets that clock, which is what makes a reconnect
  work when the server's per-connection counter restarts.
- Outputs go `stale: true` the moment the channel drops - the flag already means "behind the
  inputs". On reconnect the replica says `hello` again and gets fresh state; nothing is replayed.
- It refuses locally what a local instance refuses (an undeclared input name, a program with
  ports on an instance with no persisted layer), and sends nothing in that case.
- `status` is `connected` / `disconnected` / `rejected` - the last meaning a re-handshake was
  refused (the server was redeployed with another language) and nothing will move again.

**The server is the trust boundary.** Core trusts its caller on purpose; a client is not the
host. So `serveInstance` enforces what each layer's policy declares - no `setLayer` on a layer
that is not `editable`, no `setInput` on an input a `feeds: "host"` layer owns - and drops a
malformed command, a refused one, or one core throws on, reporting each through `onError`. It
also strips zod `schema`s from layer types before sending: a schema is a graph of functions and
survives neither JSON nor structured clone. Authorisation proper - _who_ is this client - is the
host's, at its own API, as is which program to open, revisions, and listing.

## Adapting your transport

A `Channel` is the one thing a host implements:

```ts
interface Channel<Out, In> {
  send(message: Out): void;
  onMessage(listener: (message: In) => void): () => void; // returns unsubscribe
  status?: Observable<"connected" | "disconnected">; // absent = always connected
}
```

Two come built in: `messagePortChannel(port)` (a Worker, an iframe, a `MessageChannel` in one
page; structured clone, no `status`) and `webSocketChannel(socket)` (the browser's, node's, or
`ws` on either side; JSON frames; `status` from open/close; a send while not open is **dropped**,
never queued - an edit fired thirty seconds late into a live show is worse than one that never
went). Anything else - SSE + POST, Electron IPC, a request/stream pair - is ten lines of the same
shape. A raw WebSocket does not reconnect: wrap a reconnecting client of your own in a Channel
whose `status` flips, and the replica re-handshakes on its own.

## What it does not do (yet)

- **Analyse locally.** Diagnostics mirror the server's - one truth, one round trip of latency.
  The replica already has everything a local analysis needs.
- **Detect two writers.** The editor never reads the program _back_ from the instance. After a
  reconnect `state` (or any `setProgram` from elsewhere) the text and the running program can
  differ until the next keystroke, when the editor's text wins. That is the conflict the
  document envelope's `revision` field exists to detect; detection is version history, later.
- **Queue while disconnected.** Deliberately.

## Trying it

`yarn build` once at the root (the example runs against the built core, as a host would), then
`yarn workspace @dendrite-lang/link example` serves one program on `ws://localhost:8787` (or
`PORT`) with a global input ticking once a second. Point a replica at it from any page that
imports this package and the same language (`createStdlib()`).
