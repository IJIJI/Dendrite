import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createEditor, type EditorConfig, type EditorHandle } from "../editor";
import { EditorContext, type EditorContextValue } from "./context";

//? <Editor>: the provider of the compound components. Holds the config and, once
// <Editor.Canvas/> has mounted it, the editor. A new `document` or `language` remounts the
// editor (attach's identity changes, so the canvas effect re-runs); `onChange` is read
// through a ref so updating it never remounts. A throwing createEditor (unsupported program
// form, dangling type in the surface) becomes `error`, not a crash - effects are invisible
// to React error boundaries.

export type EditorProps = EditorConfig & { children?: ReactNode };

interface Mounted {
  editor: EditorHandle | null;
  error: unknown;
}

const unmounted: Mounted = { editor: null, error: undefined };

export function Editor({ document, language, onChange, children }: EditorProps) {
  const [mounted, setMounted] = useState<Mounted>(unmounted);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const attach = useCallback(
    (parent: HTMLElement): (() => void) => {
      try {
        const editor = createEditor(parent, {
          document,
          language,
          onChange: (doc) => onChangeRef.current?.(doc),
        });
        setMounted({ editor, error: undefined });
        return () => {
          editor.dispose();
          setMounted(unmounted);
        };
      } catch (error) {
        setMounted({ editor: null, error });
        return () => setMounted(unmounted);
      }
    },
    [document, language],
  );

  const value = useMemo<EditorContextValue>(() => ({ ...mounted, attach }), [mounted, attach]);
  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}
