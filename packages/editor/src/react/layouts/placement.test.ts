import { describe, expect, it } from "vitest";

import { items } from "../blocks/Actions";
import { type ActionsPlacement, barItems, placeActions } from "./placement";

const bar = { title: "t" };
const share = { icon: "share" as const, label: "Share", onClick: () => {} };

describe("placeActions", () => {
  it.each([
    ["a bar spot without a bar falls back", "bar-end", undefined, "inputs"],
    ["a bar spot with a bar stands", "bar-end", bar, "bar-end"],
    ["a non-bar spot stands without a bar", "code-start", undefined, "code-start"],
  ] as const)("%s", (_, at, topBar, expected) => {
    expect(placeActions<ActionsPlacement>(at, topBar, "inputs")).toBe(expected);
  });
});

describe("barItems", () => {
  it("appends the actions to the cluster the spot names and leaves the other as given", () => {
    const actions = [items.undo, share];
    expect(barItems({ start: [items.theme] }, "bar-end", actions)).toEqual({
      start: [items.theme],
      end: [items.undo, share],
    });
    expect(barItems({ end: [share] }, "bar-start", [items.undo])).toEqual({
      start: [items.undo],
      end: [share],
    });
  });

  it("never fills a cluster the host left unset when the spot is elsewhere", () => {
    expect(barItems({}, "side", [items.undo])).toEqual({ start: [], end: [] });
  });
});
