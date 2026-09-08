import { createSubject } from "@dendrite-lang/core";

import { type Channel, type ChannelStatus } from "../protocol";

//? A Channel over a WebSocket - the browser's, node's, or `ws` on either side: all three
// share the shape below, so this imports none of them. JSON frames. `status` follows the
// socket's open and close, and a send while it is not open is DROPPED, not queued: an edit
// fired thirty seconds late into a live show is worse than one that never went.
//
// A WebSocket does not reconnect. A host that wants to gets a new socket, and either
// wraps a reconnecting client of its own in a Channel (status flips, the replica sends
// hello again) or connects a fresh replica.

export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  addEventListener(type: "open" | "close", listener: () => void): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
}

const OPEN = 1; // WebSocket.OPEN, on every implementation

export function webSocketChannel<Out, In>(socket: WebSocketLike): Channel<Out, In> {
  const status = createSubject<ChannelStatus>(
    socket.readyState === OPEN ? "connected" : "disconnected",
  );
  socket.addEventListener("open", () => status.set("connected"));
  socket.addEventListener("close", () => status.set("disconnected"));

  return {
    status,
    send(message) {
      if (socket.readyState === OPEN) socket.send(JSON.stringify(message));
    },
    onMessage(listener) {
      const handler = (event: { data: unknown }): void => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(String(event.data));
        } catch {
          return; // not ours to guess at; the guards on either end never see it
        }
        listener(parsed as In);
      };
      socket.addEventListener("message", handler);
      return () => socket.removeEventListener("message", handler);
    },
  };
}
