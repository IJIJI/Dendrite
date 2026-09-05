import { createContext, useContext } from "react";

import { type EditorHandle } from "../editor";

//? The compound components' shared state: the mounted editor (null until <Editor.Canvas/>
// has mounted it), the mount error if createEditor threw, and - for the canvas only - the
// `attach` that performs the mount. Hosts see `editor` + `error` through useEditor().

export interface EditorContextValue {
  editor: EditorHandle | null;
  error: unknown;
  /** Internal: called by <Editor.Canvas/> with its element; returns the disposer. */
  attach(parent: HTMLElement): () => void;
}

export const EditorContext = createContext<EditorContextValue | null>(null);

/** Internal - the full context, for the compound components. */
export function useEditorContext(): EditorContextValue {
  const value = useContext(EditorContext);
  if (!value) throw new Error("Dendrite editor components must be rendered inside <Editor>");
  return value;
}

/** The mounted editor (null until the canvas has mounted) and the mount error, if any. */
export function useEditor(): { editor: EditorHandle | null; error: unknown } {
  const { editor, error } = useEditorContext();
  return { editor, error };
}

/** Internal - the editor if this component happens to be inside <Editor>, else null. */
export function useOptionalEditor(): EditorHandle | null {
  return useContext(EditorContext)?.editor ?? null;
}
