//? What the HOST brings to a sample on the Host developers pages, so the page does not have
// to. A snippet about watching an instance says `report(error)`; the reader's application has
// a `report`, this file has a declaration of one, and the typechecker has enough to check the
// line that matters. Only host-side stand-ins belong here - anything Dendrite provides must
// come from a real import in the sample itself, or the sample stops proving anything - the
// `language` and the `instance` a sample uses are the ones Installation's own snippet built,
// reached with a `continues="installation"` tag on the fence.
//
// src/content/ts-samples.test.ts prepends this to every page it checks, so a name here is in
// scope in every ```ts fence on the site. `astro check` covers this file too.
//
// Most of these are `declare`d: a type to check against, and no value, which is all a sample
// that is only TYPECHECKED needs. The rule for the rest: **a name a `runs` fence uses is a value,
// not a `declare`**, because that fence is executed and `undefined(...)` is a TypeError. Two
// qualify today, `report` and `act`. Give a name a body only when a `runs` fence needs it:
// `element` with a body would drag a DOM into a suite that runs in node, for nobody.

import { type EditorDocument } from "@dendrite-lang/editor";
import { type WebSocketLike } from "@dendrite-lang/link";

/** A document the host is holding: loaded from its store, or new. */
export declare const doc: EditorDocument;

/** Where the host mounts a headless editor. */
export declare const element: HTMLElement;

/** The host's persistence: what an editor's `onChange` is wired to. */
export declare function save(document: EditorDocument): void;

/** The host acting on what came out, and on what went wrong. */
export declare function render(result: unknown): void;

/**
 * Real, because a `runs` fence calls it. It THROWS: a documented happy path that ends up
 * reporting an error has stopped being a happy path, and the test should say so rather than
 * pass quietly.
 */
export function report(error: unknown): void {
  throw error instanceof Error ? error : new Error(String(error));
}

/** Real, because a `runs` fence calls it. The host's reaction is not the sample's business. */
export function act(_value: unknown, _state: { stale: boolean }): void {}

/** Which inputs the host feeds itself, for the panes that must not offer them. */
export declare const live: Set<string>;

/** The address of the server half, in the editor half's sample. */
export declare const url: string;

/** A dropped command on the server: `serveInstance`'s own `onError`. */
export declare function onError(error: Error, message?: unknown): void;

/** A socket as a WebSocket server hands it over: a channel, plus a lifetime to hook. */
export interface HostSocket extends WebSocketLike {
  on(event: "close", listener: () => void): void;
}

/** The host's WebSocket server - `ws`, or anything with the same shape. */
export declare const wss: {
  on(event: "connection", listener: (socket: HostSocket) => void): void;
};
