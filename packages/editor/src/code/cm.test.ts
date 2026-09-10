import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createStdlib } from "@dendrite-lang/core";
import { describe, expect, it } from "vitest";

import { codeExtensions } from "./cm";

// EditorState needs no DOM, so the option → facet mapping is checked here; what the gutter
// looks like is a browser matter.

const language = createStdlib();
const stateWith = (options: Parameters<typeof codeExtensions>[1]) =>
  EditorState.create({ doc: "let x = 1", extensions: codeExtensions(language, options) });

describe("codeExtensions", () => {
  it("is editable by default", () => {
    const state = stateWith({});
    expect(state.readOnly).toBe(false);
    expect(state.facet(EditorView.editable)).toBe(true);
  });

  it("editable: false makes the state read-only and the view non-editable", () => {
    const state = stateWith({ editable: false });
    expect(state.readOnly).toBe(true);
    expect(state.facet(EditorView.editable)).toBe(false);
  });

  it("still highlights comments' tokens for the default keymap", () => {
    const state = stateWith({ gutters: "none" });
    expect(state.languageDataAt<{ line: string }>("commentTokens", 0)[0]?.line).toBe("//");
  });
});
