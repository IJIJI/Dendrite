import { type EditorDocument, migrateDocument } from "./document";
import { decodePayload, encodeDocument } from "./permalink";

//? DocumentStore: where a host keeps a document. The editor never touches storage - a host
// wires the editor's changes to whichever store(s) it likes (Adapter + DIP). Three adapters
// ship as a convenience; a host with a backend writes its own in a few lines. The adapters
// here never reject: persistence failing (private mode, quota, history throttling) must not
// break editing - the next change simply saves again.

export interface DocumentStore {
  /** The stored document, or null when there is none or it is unreadable (fail soft). */
  load(): Promise<EditorDocument | null>;
  save(doc: EditorDocument): Promise<void>;
}

// ── Memory ───────────────────────────────────────────────────────────────────

/** Holds one document in memory: tests, docs embeds, anything that must not persist. */
export class MemoryStore implements DocumentStore {
  constructor(private doc: EditorDocument | null = null) {}

  async load(): Promise<EditorDocument | null> {
    return this.doc;
  }

  async save(doc: EditorDocument): Promise<void> {
    this.doc = doc;
  }
}

// ── localStorage ─────────────────────────────────────────────────────────────

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** One slot in a Storage (localStorage unless injected). */
export class LocalStorageStore implements DocumentStore {
  constructor(
    private readonly key: string,
    private readonly storage?: StorageLike,
  ) {}

  // Resolved per call, not in the constructor: merely touching `localStorage` throws in
  // some private-browsing modes, and that must not take the host down.
  private get target(): StorageLike | null {
    try {
      return this.storage ?? globalThis.localStorage ?? null;
    } catch {
      return null;
    }
  }

  async load(): Promise<EditorDocument | null> {
    try {
      const raw = this.target?.getItem(this.key);
      return raw ? migrateDocument(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }

  async save(doc: EditorDocument): Promise<void> {
    try {
      this.target?.setItem(this.key, JSON.stringify(doc));
    } catch {
      // quota exceeded / storage disabled - fail soft
    }
  }
}

// ── URL fragment ─────────────────────────────────────────────────────────────

/** The bits of location/history the URL store needs - injectable for tests. */
export interface LocationLike {
  hash(): string;
  replace(hash: string): void;
  push(hash: string): void;
}

const browserLocation: LocationLike = {
  hash: () => location.hash,
  replace: (hash) => history.replaceState(null, "", hash),
  push: (hash) => history.pushState(null, "", hash),
};

/**
 * The URL fragment IS the document (deflate + base64url payload after `#`, see permalink).
 * `save` replaces the current history entry (no history spam while editing); `push` adds
 * one (a host's "load preset" → Back restores the previous document). Encoding is async, so
 * writes are serialised last-write-wins: a slow older save can never clobber a newer one.
 */
export class UrlStore implements DocumentStore {
  private seq = 0;

  constructor(private readonly loc: LocationLike = browserLocation) {}

  async load(): Promise<EditorDocument | null> {
    return decodePayload(this.loc.hash().replace(/^#/, ""));
  }

  save(doc: EditorDocument): Promise<void> {
    return this.write(doc, "replace");
  }

  push(doc: EditorDocument): Promise<void> {
    return this.write(doc, "push");
  }

  private async write(doc: EditorDocument, how: "replace" | "push"): Promise<void> {
    const seq = ++this.seq;
    try {
      const payload = await encodeDocument(doc);
      if (seq === this.seq) this.loc[how](`#${payload}`);
    } catch {
      // encode hiccup / history throttling (Safari) - the next change re-syncs
    }
  }
}
