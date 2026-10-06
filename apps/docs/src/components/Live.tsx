import { type Ports, type SavedProgram, serialiseSource } from "@dendrite-lang/core";
import { DOCUMENT_VERSION, documentUrl, type EditorDocument } from "@dendrite-lang/editor";
import { Editor, type TopBarAction, useEditor } from "@dendrite-lang/editor/react";
import { useMemo } from "react";

import { sampleEdge } from "../plugins/den-meta";

//? A live example: the real editor, in the page, over a program of its own. Rendered
// client-only (CodeMirror needs a DOM). Two presets: `minimal` (the default) is a program
// with settable inputs and live outputs; `compact` adds the panes and the diagnostics line.
// Both are editable unless a page says otherwise. "Open in playground" carries the CURRENT
// document across in the URL hash - the same payload the playground's own share button
// writes. `not-content` keeps Starlight's prose rules out of the island.

// The deployed path in CI (PUBLIC_PLAYGROUND_URL), the playground's dev server otherwise.
const PLAYGROUND: string = import.meta.env.PUBLIC_PLAYGROUND_URL ?? "http://localhost:5173/";

type Program = { program: SavedProgram } | { source: string; ports?: Ports };

export type LiveProps = Program & {
  layout?: "minimal" | "compact";
  /** The code can be typed into. Default true. */
  editable?: boolean;
  /**
   * The program is here to SHOW a diagnostic: the error edge and the tag a ```den fails fence
   * wears, and no stale outputs, so the block reads the same on the page as after an edit.
   */
  fails?: boolean;
  /**
   * The program is here to show a WARNING: the edge and the tag a ```den warns fence wears. It
   * compiles, so its outputs are real ones and stay on screen as usual.
   */
  warns?: boolean;
};

export default function Live(props: LiveProps) {
  // Memoised on the VALUES, never on `props` (a fresh object each render would remount the
  // editor every time). A new program or source is a new document, which remounts on purpose.
  const { program, source, ports, layout, editable, fails, warns } = props as Partial<{
    program: SavedProgram;
    source: string;
    ports: Ports;
    layout: "minimal" | "compact";
    editable: boolean;
    fails: boolean;
    warns: boolean;
  }>;
  const document = useMemo<EditorDocument>(
    () => ({
      version: DOCUMENT_VERSION,
      program: program ?? serialiseSource(source ?? "", ports),
      inputValues: {},
    }),
    [program, source, ports],
  );
  const edge = sampleEdge({ fails, warns });
  return (
    <div className={`live not-content${edge ? ` ${edge.className}` : ""}`}>
      {edge && <span className={edge.tagClassName}>{edge.label}</span>}
      <Editor document={document}>
        <LiveLayout layout={layout ?? "minimal"} editable={editable ?? true} stale={!fails} />
      </Editor>
    </div>
  );
}

// Inside <Editor>, so it can reach the mounted editor - the playground's own Host pattern.
function LiveLayout({
  layout,
  editable,
  stale,
}: {
  layout: "minimal" | "compact";
  editable: boolean;
  stale: boolean;
}) {
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
  const actions = editable ? [Editor.items.undo, Editor.items.redo, open] : [open];
  return layout === "compact" ? (
    <Editor.CompactLayout code={{ editable }} actions={actions} stale={stale} />
  ) : (
    <Editor.MinimalLayout code={{ editable }} actions={actions} stale={stale} />
  );
}
