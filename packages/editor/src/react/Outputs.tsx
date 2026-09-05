import { type EditorHandle } from "../editor";
import { formatValue } from "../format";
import { useEditor } from "./context";
import { useObservable } from "./hooks";
import { Pane, type PaneProps } from "./Pane";

//? <Editor.Outputs/>: the last evaluation - fresh outputs, or why there are none.

export function Outputs({ title, className, style }: PaneProps) {
  const { editor } = useEditor();
  return (
    <Pane title={title} defaultTitle="Outputs" kind="outputs" className={className} style={style}>
      {editor ? <OutputList editor={editor} /> : null}
    </Pane>
  );
}

function OutputList({ editor }: { editor: EditorHandle }) {
  const { outputs, error } = useObservable(editor.session.outputs);
  if (error) return <p className="dendrite-runtime-error">{error}</p>;
  if (!outputs)
    return <p className="dendrite-empty">No runnable program - fix the errors below.</p>;
  if (outputs.size === 0) return <p className="dendrite-empty">The program declares no outputs.</p>;
  return (
    <>
      {[...outputs].map(([name, value]) => (
        <div key={name} className="dendrite-output-row">
          <span className="dendrite-output-name">{name}</span>
          <code className="dendrite-output-value">{formatValue(value)}</code>
        </div>
      ))}
    </>
  );
}
