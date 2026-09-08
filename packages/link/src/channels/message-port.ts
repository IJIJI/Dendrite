import { type Channel } from "../protocol";

//? A Channel over a MessagePort: a Worker, an iframe, or the two ends of a MessageChannel
// in one page. Structured clone carries the messages, so nothing is stringified. Typed
// structurally so this needs no DOM lib and works on node's port too. No `status`: a port
// is up until it is closed, and closing it is the host's.

export interface MessagePortLike {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  /** Ports created by MessageChannel deliver nothing until started. */
  start?(): void;
}

export function messagePortChannel<Out, In>(port: MessagePortLike): Channel<Out, In> {
  return {
    send: (message) => port.postMessage(message),
    onMessage(listener) {
      const handler = (event: { data: unknown }): void => listener(event.data as In);
      port.addEventListener("message", handler);
      port.start?.();
      return () => port.removeEventListener("message", handler);
    },
  };
}
