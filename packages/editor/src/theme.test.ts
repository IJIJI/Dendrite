import { describe, expect, it } from "vitest";

import {
  createThemeController,
  nextThemeMode,
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
  type ThemeMode,
} from "./theme";

// Fakes for the two things a controller touches: <html>'s attributes and localStorage.
const fakeRoot = () => {
  const attrs = new Map<string, string>();
  return {
    attrs,
    getAttribute: (name: string) => attrs.get(name) ?? null,
    setAttribute: (name: string, value: string) => void attrs.set(name, value),
    removeAttribute: (name: string) => void attrs.delete(name),
  };
};
const fakeStorage = () => {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
};

describe("theme", () => {
  it("cycles auto → light → dark → auto", () => {
    expect(nextThemeMode("auto")).toBe("light");
    expect(nextThemeMode("light")).toBe("dark");
    expect(nextThemeMode("dark")).toBe("auto");
  });

  it("starts from the remembered preference and applies it to the page", () => {
    const root = fakeRoot();
    const storage = fakeStorage();
    storage.items.set(THEME_STORAGE_KEY, "dark");
    const theme = createThemeController({ root, storage });
    expect(theme.mode.get()).toBe("dark");
    expect(root.attrs.get(THEME_ATTRIBUTE)).toBe("dark");
  });

  it("adopts an attribute the host already set when nothing is remembered", () => {
    const root = fakeRoot();
    root.attrs.set(THEME_ATTRIBUTE, "light");
    const theme = createThemeController({ root, storage: fakeStorage() });
    expect(theme.mode.get()).toBe("light");
    expect(root.attrs.get(THEME_ATTRIBUTE)).toBe("light");
  });

  it("set() applies, remembers and publishes; auto clears the attribute and the memory", () => {
    const root = fakeRoot();
    const storage = fakeStorage();
    const theme = createThemeController({ root, storage });
    const seen: ThemeMode[] = [];
    theme.mode.subscribe((mode) => seen.push(mode));

    theme.set("light");
    expect(root.attrs.get(THEME_ATTRIBUTE)).toBe("light");
    expect(storage.items.get(THEME_STORAGE_KEY)).toBe("light");

    theme.set("auto");
    expect(root.attrs.has(THEME_ATTRIBUTE)).toBe(false);
    expect(storage.items.has(THEME_STORAGE_KEY)).toBe(false);
    expect(seen).toEqual(["light", "auto"]);
  });

  it("ignores junk in storage and works with no page or storage at all", () => {
    const storage = fakeStorage();
    storage.items.set(THEME_STORAGE_KEY, "sepia");
    expect(createThemeController({ storage }).mode.get()).toBe("auto");

    const bare = createThemeController({});
    expect(bare.mode.get()).toBe("auto");
    bare.set("dark");
    expect(bare.mode.get()).toBe("dark");
  });
});
