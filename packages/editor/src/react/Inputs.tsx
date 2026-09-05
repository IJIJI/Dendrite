import { useId, useMemo, useState } from "react";

import { type EditorHandle } from "../editor";
import { formatValue } from "../format";
import { type WidgetSpec, widgetsFor } from "../input-widgets";
import { useEditor } from "./context";
import { cx } from "./cx";
import { editorKey, useObservable } from "./hooks";
import { Pane, type PaneProps } from "./Pane";

//? <Editor.Inputs/>: the session's inputs, editable or read-only. Read-only display is
// live by construction - it renders the `inputs` observable, so a host pushing values
// (Beacon's tally state) re-renders it. Editable fields are UNCONTROLLED: the DOM holds
// what is being typed; a value is applied only once it parses (a half-typed number or an
// unfinished JSON literal simply isn't applied yet). Read-only is HOST policy, not part of
// the document: the same surface is host-fed in Beacon and user-editable in the playground.
// A host must not push values into an input it also lets the user edit (the field would go
// stale) - mark such inputs read-only instead.

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
  const { session } = editor;
  const values = useObservable(session.inputs);
  const widgets = useMemo(() => widgetsFor(session.language.descriptor), [session]);

  if (widgets.length === 0) {
    return <p className="dendrite-empty">This program declares no inputs.</p>;
  }
  return (
    <>
      {widgets.map((widget) => (
        <InputRow
          key={widget.name}
          widget={widget}
          value={values[widget.name]}
          readOnly={isReadOnly(readOnly, widget.name)}
          onChange={(value) => session.setInput(widget.name, value)}
        />
      ))}
    </>
  );
}

interface FieldProps {
  widget: WidgetSpec;
  value: unknown;
  onChange(value: unknown): void;
}

function InputRow({ widget, value, readOnly, onChange }: FieldProps & { readOnly: boolean }) {
  const id = useId();
  return (
    <div className="dendrite-input-row">
      <label className="dendrite-input-label" htmlFor={id}>
        <span className="dendrite-input-name">${widget.name}</span>
        <code className="dendrite-tag dendrite-input-type">{widget.typeLabel}</code>
      </label>
      {readOnly ? (
        <pre id={id} className="dendrite-input-value">
          {formatValue(value, 2)}
        </pre>
      ) : (
        <Field id={id} widget={widget} value={value} onChange={onChange} />
      )}
    </div>
  );
}

function Field({ id, widget, value, onChange }: FieldProps & { id: string }) {
  switch (widget.control) {
    case "number":
      return (
        <input
          id={id}
          type="number"
          defaultValue={String(value ?? 0)}
          onChange={(e) => {
            // An empty field is "mid-edit", not zero - apply only real numbers.
            if (e.currentTarget.value.trim() === "") return;
            const n = Number(e.currentTarget.value);
            if (Number.isFinite(n)) onChange(n);
          }}
        />
      );
    case "boolean":
      return (
        <input
          id={id}
          type="checkbox"
          defaultChecked={Boolean(value)}
          onChange={(e) => onChange(e.currentTarget.checked)}
        />
      );
    case "text":
      return (
        <input
          id={id}
          type="text"
          defaultValue={String(value ?? "")}
          onChange={(e) => onChange(e.currentTarget.value)}
        />
      );
    case "json":
      return <JsonField id={id} value={value} onChange={onChange} />;
  }
}

function JsonField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: unknown;
  onChange(v: unknown): void;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <textarea
        id={id}
        className={cx("dendrite-json-input", error !== null && "invalid")}
        rows={4}
        defaultValue={JSON.stringify(value, null, 2)}
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
