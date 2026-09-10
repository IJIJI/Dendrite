import { useMemo } from "react";

import { type EditorHandle } from "../../../session/editor";
import { formatValue } from "../../../ports/format";
import { outputRows, type PortRow } from "../../../ports/port-rows";
import { useEditor } from "../../context";
import { useObservable } from "../../hooks";
import { Pane, type PaneProps } from "./Pane";
import { AddPort, PortDeclaration, PortProblems, UndoStrip } from "./PortFields";
import { type PortEdits, usePortEdits } from "./usePortEdits";

//? <Editor.Outputs/>: what the program declares it produces, and what the last evaluation
// actually produced. Both, because they can differ in either direction: a declared output
// the program never assigns has no value, and an output the program assigns without
// declaring one still runs - it is a warning, not an error - so it is listed too, marked.
// Declaring is what buys a type check and a required/desired contract, not permission.

export interface OutputsProps extends PaneProps {
  /** The declaration affordances - rename, type, add, remove - where the layer allows them. Default true. */
  declarations?: boolean;
}

export function Outputs({ declarations = true, ...pane }: OutputsProps) {
  const { editor } = useEditor();
  return (
    <Pane {...pane} defaultTitle="Outputs" kind="outputs">
      {editor ? <OutputList editor={editor} declarations={declarations} /> : null}
    </Pane>
  );
}

function OutputList({ editor, declarations }: { editor: EditorHandle; declarations: boolean }) {
  const { instance } = editor;
  const { outputs, error, stale } = useObservable(instance.outputs);
  const ports = useObservable(instance.ports);
  const diagnostics = useObservable(instance.diagnostics);
  const declared = useMemo(() => outputRows(ports), [ports]);
  const edits = usePortEdits(instance, ports, diagnostics, "outputs");
  // Produced without a declaration: listed last, since nothing pins where they belong.
  const undeclared = useMemo(
    () => [...(outputs?.keys() ?? [])].filter((name) => !declared.some((d) => d.name === name)),
    [outputs, declared],
  );

  return (
    <>
      {error ? <p className="dendrite-runtime-error">{`${error.kind}: ${error.message}`}</p> : null}
      {/* Stale = the program these came from is no longer the one in the editor. They stay
          on screen because they are what a host is still acting on. */}
      {stale ? (
        <p className="dendrite-output-stale">
          <span className="dendrite-tag dendrite-tag-stale">stale</span>
          Showing the last program that ran.
        </p>
      ) : null}
      {declared.length === 0 && undeclared.length === 0 ? (
        <Empty compiled={outputs !== null} />
      ) : null}
      {declared.map((row) => (
        <OutputRow
          key={`${row.layerId}/${row.name}`}
          row={row}
          editable={declarations && row.editable}
          produced={outputs?.has(row.name) ?? false}
          value={outputs?.get(row.name)}
          edits={edits}
        />
      ))}
      {undeclared.map((name) => (
        <div key={name} className="dendrite-output-row">
          <div className="dendrite-port-head">
            <span className="dendrite-output-name">{name}</span>
            <code className="dendrite-tag">undeclared</code>
          </div>
          <code className="dendrite-output-value">{formatValue(outputs?.get(name))}</code>
        </div>
      ))}
      {declarations && edits.undo ? <UndoStrip undo={edits.undo} /> : null}
      {declarations && edits.canAdd ? <AddPort label="Add output" onClick={edits.add} /> : null}
    </>
  );
}

function OutputRow({
  row,
  editable,
  produced,
  value,
  edits,
}: {
  row: PortRow;
  editable: boolean;
  produced: boolean;
  value: unknown;
  edits: PortEdits;
}) {
  return (
    <div className="dendrite-output-row">
      <div className="dendrite-port-head">
        {editable ? (
          <PortDeclaration row={row} edits={edits} />
        ) : (
          <>
            <span className="dendrite-output-name">{row.name}</span>
            <code className="dendrite-tag dendrite-input-type">{row.typeLabel}</code>
          </>
        )}
      </div>
      {/* An em dash, not a blank: the declaration exists, the program just never assigned it. */}
      <code className="dendrite-output-value">{produced ? formatValue(value) : "—"}</code>
      {editable ? <PortProblems messages={edits.problems(row)} /> : null}
    </div>
  );
}

const Empty = ({ compiled }: { compiled: boolean }) =>
  compiled ? (
    <p className="dendrite-empty">
      <span className="dendrite-empty-title">No outputs yet</span>
      <br />
      Write <code>output name = …</code> in the program.
    </p>
  ) : (
    <p className="dendrite-empty">
      <span className="dendrite-empty-title">Nothing to run</span>
      <br />
      Fix the errors marked in the code.
    </p>
  );
