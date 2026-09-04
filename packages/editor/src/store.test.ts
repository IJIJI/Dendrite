import { serialiseSource } from "@dendrite-lang/core";
import { describe, expect, it } from "vitest";

import { DOCUMENT_VERSION, type EditorDocument } from "./document";
import {
  LocalStorageStore,
  type LocationLike,
  MemoryStore,
  type StorageLike,
  UrlStore,
} from "./store";

const doc = (a = 1): EditorDocument => ({
  version: DOCUMENT_VERSION,
  program: serialiseSource("output out = $a"),
  surface: { inputs: [{ name: "a", type: { kind: "name", name: "number" } }], outputs: [] },
  inputValues: { a },
});

const fakeStorage = () => {
  const map = new Map<string, string>();
  const storage: StorageLike = {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
  };
  return { map, storage };
};

const fakeLocation = (initial = "") => {
  const state = { current: initial, replaced: [] as string[], pushed: [] as string[] };
  const loc: LocationLike = {
    hash: () => state.current,
    replace: (hash) => {
      state.replaced.push(hash);
      state.current = hash;
    },
    push: (hash) => {
      state.pushed.push(hash);
      state.current = hash;
    },
  };
  return { state, loc };
};

describe("MemoryStore", () => {
  it("starts empty and returns what was saved", async () => {
    const store = new MemoryStore();
    expect(await store.load()).toBeNull();
    await store.save(doc());
    expect(await store.load()).toEqual(doc());
  });
});

describe("LocalStorageStore", () => {
  it("round-trips through the injected storage under its key", async () => {
    const { map, storage } = fakeStorage();
    const store = new LocalStorageStore("slot", storage);
    await store.save(doc(7));
    expect(map.has("slot")).toBe(true);
    expect(await store.load()).toEqual(doc(7));
  });

  it("fails soft on garbage, a throwing storage, and no storage at all", async () => {
    const { map, storage } = fakeStorage();
    map.set("slot", "{not json");
    expect(await new LocalStorageStore("slot", storage).load()).toBeNull();

    const throwing: StorageLike = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    const broken = new LocalStorageStore("slot", throwing);
    expect(await broken.load()).toBeNull();
    await expect(broken.save(doc())).resolves.toBeUndefined();

    // Node has no localStorage: the default store is inert, not a crash.
    const inert = new LocalStorageStore("slot");
    expect(await inert.load()).toBeNull();
    await expect(inert.save(doc())).resolves.toBeUndefined();
  });
});

describe("UrlStore", () => {
  it("loads nothing from an empty or non-payload fragment", async () => {
    expect(await new UrlStore(fakeLocation("").loc).load()).toBeNull();
    expect(await new UrlStore(fakeLocation("#tally").loc).load()).toBeNull();
  });

  it("save replaces the entry with a payload that loads back", async () => {
    const { state, loc } = fakeLocation();
    const store = new UrlStore(loc);
    await store.save(doc(3));
    expect(state.replaced).toHaveLength(1);
    expect(state.replaced[0]).toMatch(/^#[A-Za-z0-9_-]+$/);
    expect(state.pushed).toHaveLength(0);
    expect(await store.load()).toEqual(doc(3));
  });

  it("push adds a history entry instead", async () => {
    const { state, loc } = fakeLocation();
    await new UrlStore(loc).push(doc());
    expect(state.pushed).toHaveLength(1);
    expect(state.replaced).toHaveLength(0);
  });

  it("serialises writes last-write-wins: a stale save cannot clobber a newer one", async () => {
    const { state, loc } = fakeLocation();
    const store = new UrlStore(loc);
    const first = store.save(doc(1));
    const second = store.save(doc(2));
    await Promise.all([first, second]);
    expect(state.replaced).toHaveLength(1);
    expect((await store.load())!.inputValues.a).toBe(2);
  });
});
