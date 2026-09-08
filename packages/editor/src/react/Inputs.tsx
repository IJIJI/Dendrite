import { useEffect, useId, useMemo, useRef, useState } from "react";

import { type EditorHandle } from "../editor";
import { formatValue } from "../format";
import { type WidgetSpec, widgetsFor } from "../port-rows";
import { useEditor } from "./context";
import { cx } from "./cx";
import { editorKey, useObservable } from "./hooks";
import { Pane, type PaneProps } from "./Pane";
import { AddPort, PortDeclaration, PortProblems, UndoStrip } from "./PortFields";
import { type PortEdits, usePortEdits } from "./usePortEdits";

//? <Editor.Inputs/>: the session's inputs - their values, and on an editable layer their
// declarations. Read-only display is live by construction - it renders the `inputs`
// observable, so a host pushing values (Beacon's tally state) re-renders it. Editable
// fields are UNCONTROLLED: the DOM holds what is being typed; a value is applied only once
// it parses (a half-typed number or an unfinished JSON literal simply isn't applied yet).
// Read-only is HOST policy, not part of the document: the same surface is host-fed in
// Beacon and user-editable in the playground. A field follows its value whenever the user
// is not in it (useFollow below), so a value arriving from elsewhere - a host push, a rename
// carried across a wire - shows; while the user is typing, theirs wins.
//
// Whether a DECLARATION may be edited is the layer's policy, not this prop - except that a
// wholly read-only pane (`readOnly` as a bare `true`) is a host saying "display only", so
// it hides the declaration affordances too.

export type ReadOnly = boolean | ((name: string) => boolean);

export interface InputsProps extends PaneProps {
  /** Show values as text instead of fields: `true` for every input, or a predicate by name. */
  readOnly?: ReadOnly;
}

const isReadOnly = (readOnly: ReadOnly, name: string): boolean =>
  typeof readOnly === "function" ? readOnly(name) : readOnly;

export function Inputs({ readOnly = false, title, className, style }: InputsProps) {
  const { editor } = useEditor();
  return (
    <Pane title={title} defaultTitle="Inputs" kind="inputs" className={className} style={style}>
      {editor ? <InputList key={editorKey(editor)} editor={editor} readOnly={readOnly} /> : null}
    </Pane>
  );
}

function InputList({ editor, readOnly }: { editor: EditorHandle; readOnly: ReadOnly }) {
  const { instance } = editor;
  const values = useObservable(instance.values);
  const ports = useObservable(instance.ports);
  const diagnostics = useObservable(instance.diagnostics);
  const widgets = useMemo(() => widgetsFor(ports), [ports]);
  const edits = usePortEdits(instance, ports, diagnostics, "inputs");
  const declaring = readOnly !== true;

  return (
    <>
      {widgets.length === 0 ? (
        <p className="dendrite-empty">This program declares no inputs.</p>
      ) : (
        widgets.map((widget) => (
          <InputRow
            key={`${widget.layerId}/${widget.name}`}
            widget={widget}
            value={values[widget.name]}
            // A host-fed input is shown, never typed into: its value is not the user's.
            readOnly={widget.hostFed || isReadOnly(readOnly, widget.name)}
            editable={declaring && widget.editable}
            edits={edits}
            onChange={(value) => instance.setInput(widget.name, value)}
          />
        ))
      )}
      {edits.undo ? <UndoStrip undo={edits.undo} /> : null}
      {declaring && edits.canAdd ? <AddPort label="Add input" onClick={edits.add} /> : null}
    </>
  );
}

interface FieldProps {
  widget: WidgetSpec;
  value: unknown;
  onChange(value: unknown): void;
}

function InputRow({
  widget,
  value,
  readOnly,
  editable,
  edits,
  onChange,
}: FieldProps & { readOnly: boolean; editable: boolean; edits: PortEdits }) {
  const id = useId();
  return (
    <div className="dendrite-input-row">
      {/* A label may not wrap a control it does not label, so the editable header is a plain
          row and the value field carries its own name. */}
      {editable ? (
        <div className="dendrite-port-head">
          <span className="dendrite-port-sigil">$</span>
          <PortDeclaration row={widget} edits={edits} />
        </div>
      ) : (
        <label className="dendrite-input-label" htmlFor={id}>
          <span className="dendrite-input-name">${widget.name}</span>
          <code className="dendrite-tag dendrite-input-type">{widget.typeLabel}</code>
        </label>
      )}
      {readOnly ? (
        <pre id={id} className="dendrite-input-value">
          {formatValue(value, 2)}
        </pre>
      ) : (
        <Field id={id} widget={widget} value={value} onChange={onChange} />
      )}
      {editable ? <PortProblems messages={edits.problems(widget)} /> : null}
    </div>
  );
}

// Uncontrolled fields hold what is being typed - but a value can also change UNDER a field:
// a host pushing one, a rename carrying one across a wire a push after the row rendered. A
// field follows its value whenever the user is not in it; while they are, theirs wins.
function useFollow<T extends HTMLInputElement | HTMLTextAreaElement>(
  render: (value: unknown) => string,
  value: unknown,
) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el) el.value = render(value);
  }, [render, value]);
  return ref;
}

const asNumber = (value: unknown): string => String(value ?? 0);
const asText = (value: unknown): string => String(value ?? "");
const asJson = (value: unknown): string => JSON.stringify(value, null, 2);

function Field({ id, widget, value, onChange }: FieldProps & { id: string }) {
  const label = `$${widget.name}`;
  switch (widget.control) {
    case "number":
      return <NumberField id={id} label={label} value={value} onChange={onChange} />;
    case "boolean":
      return <BooleanField id={id} label={label} value={value} onChange={onChange} />;
    case "text":
      return <TextField id={id} label={label} value={value} onChange={onChange} />;
    case "json":
      return <JsonField id={id} label={label} value={value} onChange={onChange} />;
  }
}

interface ControlProps {
  id: string;
  label: string;
  value: unknown;
  onChange(v: unknown): void;
}

function NumberField({ id, label, value, onChange }: ControlProps) {
  const ref = useFollow<HTMLInputElement>(asNumber, value);
  return (
    <input
      ref={ref}
      id={id}
      type="number"
      aria-label={label}
      defaultValue={asNumber(value)}
      onChange={(e) => {
        // An empty field is "mid-edit", not zero - apply only real numbers.
        if (e.currentTarget.value.trim() === "") return;
        const n = Number(e.currentTarget.value);
        if (Number.isFinite(n)) onChange(n);
      }}
    />
  );
}

function BooleanField({ id, label, value, onChange }: ControlProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.checked = Boolean(value);
  }, [value]);
  return (
    <input
      ref={ref}
      id={id}
      type="checkbox"
      aria-label={label}
      defaultChecked={Boolean(value)}
      onChange={(e) => onChange(e.currentTarget.checked)}
    />
  );
}

function TextField({ id, label, value, onChange }: ControlProps) {
  const ref = useFollow<HTMLInputElement>(asText, value);
  return (
    <input
      ref={ref}
      id={id}
      type="text"
      aria-label={label}
      defaultValue={asText(value)}
      onChange={(e) => onChange(e.currentTarget.value)}
    />
  );
}

function JsonField({ id, label, value, onChange }: ControlProps) {
  const [error, setError] = useState<string | null>(null);
  const ref = useFollow<HTMLTextAreaElement>(asJson, value);
  return (
    <>
      <textarea
        ref={ref}
        id={id}
        aria-label={label}
        className={cx("dendrite-json-input", error !== null && "invalid")}
        rows={4}
        defaultValue={asJson(value)}
        onChange={(e) => {
          try {
            onChange(JSON.parse(e.currentTarget.value) as unknown);
            setError(null);
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
          }
        }}
      />
      <div className="dendrite-json-error">{error}</div>
    </>
  );
}
