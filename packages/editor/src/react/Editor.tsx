import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { type Connection, ownStack } from "../session/connection";
import { type EditorDocument } from "../session/document";
import { createEditor, type EditorHandle } from "../session/editor";
import { EditorContext, type EditorContextValue } from "./context";

//? <Editor>: the provider of the compound components. Holds what to connect to and, once
// <Editor.Canvas/> has mounted it, the editor. A host hands over either a Connection it
// built (joinRuntime, attach, a link replica) or just a `document` - sugar for ownStack,
// kept because JSX has no tidy place to memo a connection and the playground is the
// common case. A new connection, document, language or layers remounts the editor
// (attach's identity changes, so the canvas effect re-runs), so pass STABLE references;
// `onChange` is read through a ref so updating it never remounts. A throwing createEditor
// (unsupported program form, dangling type in a layer) becomes `error`, not a crash -
// effects are invisible to React error boundaries.

type Owned = Parameters<typeof ownStack>[0];

export type EditorProps = ({ connection: Connection } | Owned) & {
  onChange?(doc: EditorDocument): void;
  children?: ReactNode;
};

interface Mounted {
  editor: EditorHandle | null;
  error: unknown;
}

const unmounted: Mounted = { editor: null, error: undefined };

export function Editor(props: EditorProps) {
  const { onChange, children } = props;
  // The union hides the arm-specific fields from a plain destructure; read them all, and
  // remount on whichever the host actually passed.
  const { connection, document, language, layers } = props as Partial<
    { connection: Connection } & Owned
  >;
  const [mounted, setMounted] = useState<Mounted>(unmounted);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const attach = useCallback(
    (parent: HTMLElement): (() => void) => {
      try {
        const editor = createEditor(parent, {
          // No connection means the props are the ownStack options, so `document` is there.
          connection:
            connection ?? ownStack({ document: document as EditorDocument, language, layers }),
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
    [connection, document, language, layers],
  );

  const value = useMemo<EditorContextValue>(() => ({ ...mounted, attach }), [mounted, attach]);
  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}
