import {
  flattenPorts,
  type PortLayer,
  type Ports,
  type PortsState,
  type Type,
  typeToString,
  type Vocabulary,
} from "@dendrite-lang/core";

//? Port declarations → the rows a pane renders. Framework-free: this is the descriptor-driven
// UI mapping the editor (code AND rete side) builds on; panes render them and hand edits to
// ports-edit.ts.
//
// The declarations come from the LAYERS, not from the composed descriptor, so the pane
// keeps rendering its rows while composition is failing - which is exactly when a user
// needs to see the row that broke. Control types need the composed descriptor to follow an
// extends chain, so when composition fails every control falls back to raw JSON.
// The INSTANCE is the source of truth for values; this module only describes shape.

export type Control = "number" | "boolean" | "text" | "json";

/** One declared port, as a pane sees it. */
export interface PortRow {
  name: string;
  /** The declared type, for a picker to seed itself from. */
  type: Type;
  typeLabel: string; // e.g. "number", "Bus[]", "TallyState"
  /** Which layer declares it - a pane offers edits on the editable one only. */
  layerId: string;
  /** Whether its declaring layer may be edited at all. */
  editable: boolean;
}

export interface WidgetSpec extends PortRow {
  control: Control;
  /** Fed by the host rather than the user: shown, never editable. */
  hostFed: boolean;
}

// A named type's primitive base, following the `extends` chain - so a numeric enum like
// `TallyState extends number` gets a number widget, not a JSON box. Cycle-guarded.
const primitiveBase = (t: Type, descriptor: Vocabulary): string | undefined => {
  if (t.kind !== "name") return undefined;
  const seen = new Set<string>();
  let current: string | undefined = t.name;
  while (current && !seen.has(current)) {
    if (current === "number" || current === "boolean" || current === "string") return current;
    seen.add(current);
    current = descriptor.types.get(current)?.extends;
  }
  return undefined;
};

const controlFor = (t: Type, descriptor: Vocabulary | undefined): Control => {
  switch (descriptor && primitiveBase(t, descriptor)) {
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "string":
      return "text";
    default:
      return "json"; // arrays, functions, structs, opaque named types
  }
};

const vocabularyOf = (state: PortsState): Vocabulary | undefined =>
  state.composed.ok ? state.composed.descriptor : undefined;

const rowOf = (layer: PortLayer, def: { name: string; type: Type }): PortRow => ({
  name: def.name,
  type: def.type,
  typeLabel: typeToString(def.type),
  layerId: layer.id,
  editable: layer.policy.editable,
});

/** One widget per program-level input, in layer order. */
export function widgetsFor(state: PortsState): WidgetSpec[] {
  const descriptor = vocabularyOf(state);
  const widgets: WidgetSpec[] = [];
  for (const { layer, level } of state.layers) {
    if (level !== "program") continue; // global inputs are the host's, not this document's
    for (const def of flattenPorts([layer]).inputs) {
      widgets.push({
        ...rowOf(layer, def),
        control: controlFor(def.type, descriptor),
        hostFed: layer.policy.feeds === "host",
      });
    }
  }
  return widgets;
}

/**
 * One row per declared output, GLOBAL LEVEL INCLUDED - unlike inputs. A global input is a
 * host value shared by every program and none of this document's business; a global output
 * is one this program is expected to produce, so it belongs in the list either way. The
 * layer's policy still says whether the row may be edited.
 */
export function outputRows(state: PortsState): PortRow[] {
  return state.layers.flatMap(({ layer }) => layer.ports.outputs.map((def) => rowOf(layer, def)));
}

/** The program-level layer a pane adds new declarations to, if the host allows any. */
export const editableLayer = (state: PortsState): PortLayer | undefined =>
  state.layers.find(({ layer, level }) => level === "program" && layer.policy.editable)?.layer;

/** One layer's current ports, to build an edit from. */
export const layerPorts = (state: PortsState, id: string): Ports | undefined =>
  state.layers.find(({ layer }) => layer.id === id)?.layer.ports;

/** Every declared name of one kind, at any level - what a new declaration must avoid. */
export const declaredNames = (state: PortsState, kind: "inputs" | "outputs"): string[] =>
  state.layers.flatMap(({ layer }) => layer.ports[kind].map((def) => def.name));
