---
title: "@dendrite-lang/link"
description: "Serve an instance on the host, connect a replica where it is edited, and adapt your own transport."
sidebar:
  order: 3
---

The link drives a program across a channel. The host **serves** an instance. Somewhere else, an
editor **connects** a replica that *is* a `ProgramInstance` - the same five observables and four
commands - and cannot be told from the local thing.

The split of responsibility is the whole design: **Dendrite owns the message shapes and both ends.
You own the pipe.**

## Both ends

```ts
// The host: wherever core runs - node, an Electron main process, a worker.
import { serveInstance, webSocketChannel } from "@dendrite-lang/link";

wss.on("connection", (socket) => {
  const stop = serveInstance(instance, webSocketChannel(socket), { language, onError });
  socket.on("close", stop);
});
```

```ts
// The editor: a browser, usually.
import { connectInstance, webSocketChannel } from "@dendrite-lang/link";
import { attach } from "@dendrite-lang/editor";

const replica = await connectInstance(language, webSocketChannel(new WebSocket(url)));
// <Editor connection={attach(language, replica)} />
```

Both ends import **the same language**. That is not a formality: a composed descriptor holds
functions - evaluators, `inferOutput` - and functions do not travel. So the server sends the layers,
and the replica composes them with its own copy of the language. The handshake carries a fingerprint
of the vocabulary, and two builds that disagree are refused with the difference named, rather than
being silently wrong.

## The wire

Every instance command already returns nothing and reports through the observables, which is
exactly the shape a network wants. So the protocol is two directions of JSON:

| Direction | Message | Notes |
| --- | --- | --- |
| client → server | `hello { protocol, vocabulary }` | on every connect and reconnect. Answered with `state`, or `rejected` |
| | `setInput` · `fireTrigger` · `setProgram` · `setLayer` | fire and forget, each stamped with a sequence number |
| server → client | `state` | all five observables at once, so a replica never renders empty |
| | `diagnostics` · `layers` · `outputs` · `values` · `snapshot` | one per observable, stamped with the last command the server had seen |

## What makes remote feel local

All of it lives in the replica, so a host does nothing to get it.

- **An input change echoes at once.** `setInput` updates the replica's own `values` immediately,
  rather than waiting for the round trip, or a dragged slider would fight the network.
- **Late news is dropped.** A `values` push stamped before your latest command is ignored, so the
  slider does not snap back to where it was a moment ago.
- **A dropped connection goes stale.** Outputs flip to `stale: true` the moment the channel closes,
  which is exactly what the flag already means. On reconnect the replica says `hello` again and gets
  fresh state. Nothing is replayed.
- **Refusals happen locally.** What a local instance would refuse - an undeclared input, say - the
  replica refuses too, and sends nothing.

A replica also has a `status`: `connected`, `disconnected`, or `rejected`, the last meaning a
re-handshake was refused because the server now runs a different language, and nothing will move
again until the page reloads.

## The server is the trust boundary

Core trusts its caller, on purpose: a host is the host. A client is not. So `serveInstance` enforces
what each layer's policy declares, where core itself would not:

- no `setLayer` on a layer that is not `editable`
- no `setInput` on an input owned by a `feeds: "host"` layer

A malformed command, a refused one, or one core throws on is dropped, and reported through
`onError` so you can see it. Type schemas are stripped before anything is sent, because a schema is a
graph of functions.

What the link does **not** decide is *who* a client is. Authentication, which program a user may
open, and listing programs are your application's, at your own API, before the channel exists.

## Adapting your transport

A `Channel` is the one thing a host implements:

```ts
interface Channel<Out, In> {
  send(message: Out): void;
  onMessage(listener: (message: In) => void): () => void; // returns unsubscribe
  status?: Observable<"connected" | "disconnected">; // absent means always connected
}
```

Two come built in:

- **`webSocketChannel(socket)`** - the browser's WebSocket, node's, or `ws`, on either side. JSON
  frames, `status` from open and close. A send while the socket is not open is **dropped, never
  queued**: an edit fired thirty seconds late into a running system is worse than one that never
  went.
- **`messagePortChannel(port)`** - a Worker, an iframe, or a `MessageChannel` within one page.
  Structured clone, always connected.

Anything else - server-sent events with a POST back, Electron IPC, a request and response stream -
is about ten lines of the same shape. A raw WebSocket does not reconnect by itself: wrap a
reconnecting client in a `Channel` whose `status` flips, and the replica re-handshakes on its own.

## Not yet

- **Local analysis.** Diagnostics mirror the server's, which costs one round trip of latency. The
  replica already has everything it would need to analyse locally.
- **Two writers.** The editor never reads the program back from the instance. If something else
  changes the program while you edit, the text and the running program can disagree until your next
  keystroke, when your text wins. Detecting that is what a document's revision field is reserved for.
- **Queueing while disconnected.** Deliberately not.

## Trying it

The repository has a runnable server: `yarn build` at the root, then
`yarn workspace @dendrite-lang/link example` serves one program on `ws://localhost:8787` with a
global input ticking once a second. Point a replica at it from any page using the standard library.
