import { type Ports, type SavedProgram, serialiseSource } from "@dendrite-lang/core";
import { DOCUMENT_VERSION, documentUrl, type EditorDocument } from "@dendrite-lang/editor";
import { Editor, type TopBarAction, useEditor } from "@dendrite-lang/editor/react";
import { useMemo } from "react";

//? A live example: the real editor, in the page, over a program of its own. Rendered
// client-only (CodeMirror needs a DOM). Two presets: `minimal` (the default) shows a program
// with settable inputs and live outputs, read-only by the docs' choice; `compact` is the
// editable one. "Open in playground" carries the CURRENT document across in the URL hash -
// the same payload the playground's own share button writes. `not-content` keeps
// Starlight's prose rules out of the island.

// The deployed path in CI (PUBLIC_PLAYGROUND_URL), the playground's dev server otherwise.
const PLAYGROUND: string = import.meta.env.PUBLIC_PLAYGROUND_URL ?? "http://localhost:5173/";

/** Either a program (an op's example, any form) or source text from MDX. */
export type LiveProps = ({ program: SavedProgram } | { source: string; ports?: Ports }) & {
  layout?: "minimal" | "compact";
};

export default function Live(props: LiveProps) {
  // Memoised on the VALUES, never on `props` (a fresh object each render would remount the
  // editor every time). A new program or source is a new document, which remounts on purpose.
  const { program, source, ports, layout } = props as Partial<{
    program: SavedProgram;
    source: string;
    ports: Ports;
    layout: "minimal" | "compact";
  }>;
  const document = useMemo<EditorDocument>(
    () => ({
      version: DOCUMENT_VERSION,
      program: program ?? serialiseSource(source ?? "", ports),
      inputValues: {},
    }),
    [program, source, ports],
  );
  return (
    <div className="live not-content">
      <Editor document={document}>
        <LiveLayout layout={layout ?? "minimal"} />
      </Editor>
    </div>
  );
}

// Inside <Editor>, so it can reach the mounted editor - the playground's own Host pattern.
function LiveLayout({ layout }: { layout: "minimal" | "compact" }) {
  const { editor } = useEditor();
  const open: TopBarAction = {
    icon: "external",
    label: "Open in playground",
    onClick: () => {
      if (!editor) return;
      void documentUrl(PLAYGROUND, editor.getDocument()).then((href) =>
        window.open(href, "_blank", "noopener"),
      );
    },
  };
  // No theme toggle: Starlight's is the one, and the editor follows it through color-scheme.
  return layout === "compact" ? (
    <Editor.CompactLayout actions={[Editor.items.undo, Editor.items.redo, open]} />
  ) : (
    <Editor.MinimalLayout code={{ editable: false }} actions={[open]} />
  );
}
