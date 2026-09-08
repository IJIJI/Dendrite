import { useEffect, useState } from "react";

import {
  type Ports,
  type PortsState,
  type ProgramDiagnostic,
  type ProgramInstance,
  Type,
} from "@dendrite-lang/core";

import { carryValue } from "../carry-value";
import { declaredNames, editableLayer, layerPorts, type PortRow } from "../port-rows";
import {
  addInput,
  addOutput,
  removeInput,
  removeOutput,
  type TypeOption,
  typeOptionsFor,
  uniqueName,
  updateInput,
  updateOutput,
} from "../ports-edit";

//? The declaration verbs both port panes need, over one instance and one kind of port.
// Nothing here validates: every verb builds new Ports and hands them to setLayer, which
// composes and answers through `diagnostics` - a refusal moves nothing and says why there,
// a change that applied but broke a later layer says so the same way. Only VIEW state lives
// here (the last row edited, the last removal), so the panes stay renderers, and nothing
// reads a command's return: that is what lets the same panes drive an instance across a
// wire, where there is none.

export type PortKind = "inputs" | "outputs";

/** A removal that can still be taken back, until it times out. */
export interface PortUndo {
  /** What was removed, e.g. "$score". */
  label: string;
  run(): void;
  dismiss(): void;
}

/** The declaration verbs for one kind of port, bound to one instance. */
export interface PortEdits {
  /** Is there a layer new declarations may go on? */
  readonly canAdd: boolean;
  add(): void;
  rename(row: PortRow, name: string): void;
  retype(row: PortRow, type: Type): void;
  remove(row: PortRow): void;
  /** Everything wrong with this row, whether it blocked the edit or followed from it. */
  problems(row: PortRow): string[];
  /** The picker's options for a row, its own type always among them. */
  options(row: PortRow): TypeOption[];
  /** The last removal, while it is still revertible. */
  readonly undo: PortUndo | null;
}

// The two kinds differ only in which pure edit they call and what they are called, so they
// are a table rather than a ternary at every verb (Strategy as data, like core's policies).
interface PortOps {
  add(ports: Ports, declaration: { name: string; type: Type }): Ports;
  update(ports: Ports, name: string, patch: { name?: string; type?: Type }): Ports;
  remove(ports: Ports, name: string): Ports;
  /** How composing names this kind in a problem's `where`. */
  singular: string;
  /** How the canvas writes it: inputs wear the sigil, outputs do not. */
  sigil: string;
}

const OPS: Record<PortKind, PortOps> = {
  inputs: {
    add: addInput,
    update: updateInput,
    remove: removeInput,
    singular: "input",
    sigil: "$",
  },
  outputs: {
    add: addOutput,
    update: updateOutput,
    remove: removeOutput,
    singular: "output",
    sigil: "",
  },
};

/** How long a removed declaration can still be taken back. */
const UNDO_MS = 8000;

// A removed declaration, kept whole: the layer's ports as they were, and the value the input
// held. Restoring is not the inverse of removing - the instance reseeds a re-added input from
// its type - so the value has to travel with the ports or undo would quietly lose it.
interface Removal {
  label: string;
  layerId: string;
  ports: Ports;
  name: string;
  value: unknown;
  hadValue: boolean;
}

// A new declaration starts as a number: the one type every language has, and it has a widget.
const NEW_PORT_TYPE = Type.number;

const rowKey = (row: PortRow): string => `${row.layerId}/${row.name}`;

export function usePortEdits(
  instance: ProgramInstance,
  ports: PortsState,
  diagnostics: readonly ProgramDiagnostic[],
  kind: PortKind,
): PortEdits {
  // The row the last edit was made on. A REFUSED change names what was attempted, which is
  // not a row - a refused rename leaves the row holding its old name - so core's `refused`
  // diagnostics are shown on this row rather than matched by name (see `problems`).
  const [lastEdited, setLastEdited] = useState<PortRow | null>(null);
  const [removal, setRemoval] = useState<Removal | null>(null);

  // Deliberately NOT a second undo stack next to CodeMirror's: text and declarations would
  // interleave in ways neither could explain. One removal, for a few seconds.
  useEffect(() => {
    if (!removal) return;
    const timer = setTimeout(() => setRemoval(null), UNDO_MS);
    return () => clearTimeout(timer);
  }, [removal]);

  const ops = OPS[kind];
  const target = editableLayer(ports);
  const vocabulary = ports.composed.ok ? ports.composed.descriptor : undefined;

  const isLast = (row: PortRow): boolean =>
    lastEdited !== null && rowKey(lastEdited) === rowKey(row);
  const refusedOn = (row: PortRow): boolean =>
    isLast(row) && diagnostics.some((d) => d.refused && d.layerId === row.layerId);

  // Hand the layer to core. It answers through `diagnostics` - a refusal moves nothing and
  // says why there - so there is nothing to read back here.
  const edit = (row: PortRow, build: (current: Ports) => Ports): void => {
    const current = layerPorts(ports, row.layerId);
    if (!current) return;
    setLastEdited(row);
    instance.setLayer(row.layerId, build(current));
  };

  return {
    canAdd: target !== undefined,

    // Nothing can refuse this: the name is generated clear of every layer's declarations and
    // `number` is a type every language has.
    add() {
      if (!target) return;
      const name = uniqueName(declaredNames(ports, kind), ops.singular);
      instance.setLayer(target.id, ops.add(target.ports, { name, type: NEW_PORT_TYPE }));
    },

    rename(row, name) {
      if (name === row.name) {
        // Nothing to change - but if this row's last attempt was refused, the user has now
        // put the declared name back (Escape), and the refusal is moot. Core only clears it
        // on a change that compiles, so re-submit the layer exactly as it stands.
        if (refusedOn(row)) edit(row, (current) => current);
        return;
      }
      // Values are keyed by name, so to the instance a rename is one input gone and another
      // arrived - it drops the old value and seeds the new name from its type. Carry the
      // value across (carry-value.ts), or renaming would quietly wipe what the user typed.
      const values = kind === "inputs" ? instance.values.get() : {};
      const change = (): void => edit(row, (current) => ops.update(current, row.name, { name }));
      if (row.name in values) carryValue(instance, name, values[row.name], change);
      else change();
    },

    retype(row, type) {
      edit(row, (current) => ops.update(current, row.name, { type }));
    },

    remove(row) {
      const before = layerPorts(ports, row.layerId);
      if (!before) return;
      const values = instance.values.get();
      edit(row, (current) => ops.remove(current, row.name));
      setRemoval({
        label: `${ops.sigil}${row.name}`,
        layerId: row.layerId,
        ports: before,
        name: row.name,
        value: values[row.name],
        hadValue: row.name in values,
      });
    },

    problems(row) {
      const own = `${ops.singular} ${row.name}`;
      // Applied problems name a row that exists; refused ones name what was attempted, and
      // edits are sequential, so those belong to the row edited last.
      return diagnostics
        .filter((d) => d.stage === "ports" && d.layerId === row.layerId)
        .filter((d) => (d.refused ? isLast(row) : d.where === own))
        .map((d) => d.message);
    },

    options: (row) => typeOptionsFor(vocabulary, row.type),

    undo: removal && {
      label: removal.label,
      run() {
        setRemoval(null);
        // ponytail: no guard against the name having been taken again in the meantime -
        // setLayer would refuse and the row simply does not come back. Eight seconds.
        const change = (): void => instance.setLayer(removal.layerId, removal.ports);
        if (kind === "inputs" && removal.hadValue) {
          carryValue(instance, removal.name, removal.value, change);
        } else change();
      },
      dismiss: () => setRemoval(null),
    },
  };
}
