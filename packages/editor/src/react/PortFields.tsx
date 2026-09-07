import { type PortRow } from "../port-rows";
import { typeFromLabel } from "../ports-edit";
import { Icon } from "./icons";
import { type PortEdits, type PortUndo } from "./usePortEdits";

//? The controls a declaration row is made of, shared by the inputs and outputs panes: the
// name, the type picker, the remove button, and whatever composing said about the row.
// Purely presentational - every verb belongs to the PortEdits the pane passes in.

/** Name + type + remove, for a row on an editable layer. */
export function PortDeclaration({ row, edits }: { row: PortRow; edits: PortEdits }) {
  const options = edits.options(row);
  return (
    <>
      {/* Uncontrolled, keyed by the declared name: what is being typed stays in the DOM, and
          a name that actually changed remounts the field. Applied on blur, which Enter
          triggers; Escape puts the declared name back first. */}
      <input
        key={row.name}
        type="text"
        className="dendrite-port-name"
        defaultValue={row.name}
        spellCheck={false}
        aria-label={`Name of ${row.name}`}
        onKeyDown={(event) => {
          if (event.key === "Escape") event.currentTarget.value = row.name;
          if (event.key === "Enter" || event.key === "Escape") event.currentTarget.blur();
        }}
        onBlur={(event) => edits.rename(row, event.currentTarget.value.trim())}
      />
      <select
        className="dendrite-port-type"
        value={row.typeLabel}
        aria-label={`Type of ${row.name}`}
        onChange={(event) => {
          const type = typeFromLabel(options, event.currentTarget.value);
          if (type) edits.retype(row, type);
        }}
      >
        {options.map((option) => (
          <option key={option.label} value={option.label}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="dendrite-icon-button"
        aria-label={`Remove ${row.name}`}
        onClick={() => edits.remove(row)}
      >
        <Icon name="trash" />
      </button>
    </>
  );
}

/** What composing said about one row - a refused edit, or a clash it caused further down. */
export function PortProblems({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <ul className="dendrite-port-problems">
      {messages.map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  );
}

/**
 * A removed declaration, still revertible. Text-only undo rather than a second history: the
 * canvas already owns Ctrl+Z, and a declaration is not an edit in it.
 */
export function UndoStrip({ undo }: { undo: PortUndo }) {
  return (
    <p className="dendrite-port-undo">
      <span className="dendrite-port-undo-label">Removed {undo.label}</span>
      <button type="button" className="dendrite-port-undo-action" onClick={undo.run}>
        Undo
      </button>
      <button
        type="button"
        className="dendrite-port-undo-action"
        aria-label="Dismiss"
        onClick={undo.dismiss}
      >
        ×
      </button>
    </p>
  );
}

export function AddPort({ label, onClick }: { label: string; onClick(): void }) {
  return (
    <button type="button" className="dendrite-add-port" onClick={onClick}>
      <Icon name="plus" />
      {label}
    </button>
  );
}
