import { useEffect, useState } from "react";

import {
  type Ports,
  type PortsState,
  type ProgramDiagnostic,
  type ProgramInstance,
  Type,
} from "@dendrite-lang/core";

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
// composes and answers. Only VIEW state lives here (which edit was refused), so the panes
// stay renderers.
//
// A row's problems come from two places on purpose. setLayer returns the ones that BLOCKED
// the change - nothing moved, so they reach no observable - while a change that applied but
// broke a later layer arrives as a `ports` diagnostic. When the editor drives a runtime
// across a wire that synchronous return becomes a diagnostic too (see todo.md), and this
// merge keeps working with the local half simply always empty.

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
  // The last refused edit, keyed by the row it was made on - which still holds its old name,
  // because a refused change moves nothing.
  const [refused, setRefused] = useState<{ key: string; messages: string[] } | null>(null);
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

  const apply = (layerId: string, next: Ports, row?: PortRow): void => {
    const blocking = instance.setLayer(layerId, next);
    const refusal =
      blocking.length > 0 && row
        ? { key: rowKey(row), messages: blocking.map((problem) => problem.message) }
        : null;
    setRefused(refusal);
  };

  const edit = (row: PortRow, build: (current: Ports) => Ports): void => {
    const current = layerPorts(ports, row.layerId);
    if (current) apply(row.layerId, build(current), row);
  };

  return {
    canAdd: target !== undefined,

    // Nothing can refuse this, which is why it blames no row: the name is generated clear of
    // every layer's declarations and `number` is a type every language has.
    add() {
      if (!target) return;
      const name = uniqueName(declaredNames(ports, kind), ops.singular);
      apply(target.id, ops.add(target.ports, { name, type: NEW_PORT_TYPE }));
    },

    rename(row, name) {
      if (name === row.name) return;
      // The value keyed by the old name goes with it - the instance reseeds the new name from
      // its type. A rename is a declaration edit, not a move.
      edit(row, (current) => ops.update(current, row.name, { name }));
    },

    retype(row, type) {
      edit(row, (current) => ops.update(current, row.name, { type }));
    },

    remove(row) {
      const before = layerPorts(ports, row.layerId);
      if (!before) return;
      const values = instance.values.get();
      apply(row.layerId, ops.remove(before, row.name), row);
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
      const where = `${ops.singular} ${row.name}`;
      return [
        ...(refused?.key === rowKey(row) ? refused.messages : []),
        ...diagnostics
          .filter((d) => d.stage === "ports" && d.layerId === row.layerId && d.where === where)
          .map((d) => d.message),
      ];
    },

    options: (row) => typeOptionsFor(vocabulary, row.type),

    undo: removal && {
      label: removal.label,
      run() {
        setRemoval(null);
        // ponytail: no guard against the name having been taken again in the meantime -
        // setLayer would refuse and the row simply does not come back. Eight seconds.
        instance.setLayer(removal.layerId, removal.ports);
        if (kind === "inputs" && removal.hadValue) {
          instance.setInput(removal.name, removal.value);
        }
      },
      dismiss: () => setRemoval(null),
    },
  };
}
