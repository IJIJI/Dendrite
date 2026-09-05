import { useMemo } from "react";

import { type EditorHandle } from "../editor";
import { type Diagnostic } from "../session";
import { useEditor } from "./context";
import { cx } from "./cx";
import { useObservable } from "./hooks";
import { Pane, type PaneProps } from "./Pane";

//? <Editor.Diagnostics/>: parse + analysis diagnostics with click-to-jump, errors first.
// Also where a failed mount surfaces (a `boot_failed` entry) instead of a white screen.

export function Diagnostics({ title, className, style }: PaneProps) {
  const { editor, error } = useEditor();
  return (
    <Pane
      title={title}
      defaultTitle="Diagnostics"
      kind="diagnostics"
      className={className}
      style={style}
    >
      <ul className="dendrite-diagnostics">
        {editor ? (
          <DiagnosticItems editor={editor} />
        ) : error !== undefined ? (
          <DiagnosticItem diagnostic={bootFailure(error)} />
        ) : null}
      </ul>
    </Pane>
  );
}

function DiagnosticItems({ editor }: { editor: EditorHandle }) {
  const diagnostics = useObservable(editor.session.diagnostics);
  // Errors before warnings (stable within each severity) - the session emits in pipeline
  // order, which would otherwise list parse warnings above analysis errors.
  const ordered = useMemo(
    () =>
      [...diagnostics].sort((a, b) =>
        a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1,
      ),
    [diagnostics],
  );
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
  diagnostic: Diagnostic;
  onJump?(line: number, column: number): void;
}) {
  return (
    <li className={cx("dendrite-diag", `dendrite-diag-${d.severity}`)}>
      <span className={cx("dendrite-tag", `dendrite-tag-${d.severity}`)}>{d.severity}</span>
      {d.line !== undefined && onJump ? (
        <button
          type="button"
          className="dendrite-diag-loc"
          onClick={() => onJump(d.line!, d.column ?? 1)}
        >
          {d.line}:{d.column ?? 1}
        </button>
      ) : null}
      <span className="dendrite-diag-kind">{d.kind}</span>
      <span className="dendrite-diag-message">{d.message}</span>
    </li>
  );
}

const bootFailure = (error: unknown): Diagnostic => ({
  severity: "error",
  kind: "boot_failed",
  message: error instanceof Error ? error.message : String(error),
});
