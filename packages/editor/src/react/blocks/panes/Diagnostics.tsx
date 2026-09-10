import { useMemo } from "react";

import { type ProgramDiagnostic } from "@dendrite-lang/core";

import { positionOf, sortDiagnostics, summarise } from "../../../code/diagnostic";
import { type EditorHandle } from "../../../session/editor";
import { useEditor } from "../../context";
import { cx } from "../../cx";
import { useObservable } from "../../hooks";
import { Pane, type PaneProps } from "./Pane";

//? <Editor.Diagnostics/>: parse + analysis diagnostics with click-to-jump, errors first.
// Also where a failed mount surfaces (a `boot_failed` entry) instead of a white screen.
// Collapsible, its summary line counts the problems ("2 errors · 1 warning") and never
// unfolds on its own - the squiggles and gutter dots already point at the spot.

export function Diagnostics({ collapsible, ...pane }: PaneProps) {
  const { editor, error } = useEditor();
  return (
    <Pane
      {...pane}
      defaultTitle="Diagnostics"
      kind="diagnostics"
      collapsible={collapsible}
      summary={collapsible ? <Summary editor={editor} /> : undefined}
    >
      <ul className="dendrite-diag-list">
        {editor ? (
          <DiagnosticItems editor={editor} />
        ) : error !== undefined ? (
          <DiagnosticItem diagnostic={bootFailure(error)} />
        ) : null}
      </ul>
    </Pane>
  );
}

function Summary({ editor }: { editor: EditorHandle | null }) {
  return editor ? <LiveSummary editor={editor} /> : null;
}

function LiveSummary({ editor }: { editor: EditorHandle }) {
  const diagnostics = useObservable(editor.instance.diagnostics);
  const { text, severity } = summarise(diagnostics);
  return (
    <>
      {severity ? (
        <span className={cx("dendrite-tag", `dendrite-tag-${severity}`)}>{severity}</span>
      ) : null}
      {text}
    </>
  );
}

function DiagnosticItems({ editor }: { editor: EditorHandle }) {
  const diagnostics = useObservable(editor.instance.diagnostics);
  const ordered = useMemo(() => sortDiagnostics(diagnostics), [diagnostics]);
  if (ordered.length === 0) return <li className="dendrite-empty">No problems.</li>;
  return (
    <>
      {ordered.map((diagnostic, i) => (
        <DiagnosticItem key={i} diagnostic={diagnostic} onJump={editor.jumpTo} />
      ))}
    </>
  );
}

function DiagnosticItem({
  diagnostic: d,
  onJump,
}: {
  diagnostic: ProgramDiagnostic;
  onJump?(line: number, column: number): void;
}) {
  const at = positionOf(d);
  return (
    <li className={cx("dendrite-diag", `dendrite-diag-${d.severity}`)}>
      <span className={cx("dendrite-tag", `dendrite-tag-${d.severity}`)}>{d.severity}</span>
      {at && onJump ? (
        <button
          type="button"
          className="dendrite-diag-loc"
          onClick={() => onJump(at.line, at.column)}
        >
          {at.line}:{at.column}
        </button>
      ) : null}
      {/* A ports problem points at a declaration rather than at text. */}
      {d.where ? <span className="dendrite-diag-loc">{d.where}</span> : null}
      <span className="dendrite-diag-kind">{d.kind}</span>
      <span className="dendrite-diag-message">{d.message}</span>
    </li>
  );
}

const bootFailure = (error: unknown): ProgramDiagnostic => ({
  stage: "load",
  severity: "error",
  kind: "boot_failed",
  message: error instanceof Error ? error.message : String(error),
});
