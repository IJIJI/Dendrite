import {
  flattenPorts,
  type PortsState,
  type Type,
  typeToString,
  type Vocabulary,
} from "@dendrite-lang/core";

//? Port declarations → widget descriptions. Framework-free: this is the descriptor-driven
// UI mapping the editor (code AND rete side) builds on; panes render them.
//
// The declarations come from the LAYERS, not from the composed descriptor, so the pane
// keeps rendering its rows while composition is failing - which is exactly when a user
// needs to see the row that broke. Control types need the composed descriptor to follow an
// extends chain, so when composition fails every control falls back to raw JSON.
// The INSTANCE is the source of truth for values; this module only describes shape.

export type Control = "number" | "boolean" | "text" | "json";

export interface WidgetSpec {
  name: string;
  typeLabel: string; // e.g. "number", "Bus[]", "TallyState"
  control: Control;
  /** Which layer declares it - a pane offers edits on the editable one only. */
  layerId: string;
  /** Fed by the host rather than the user: shown, never editable. */
  hostFed: boolean;
  /** Whether its declaring layer may be edited at all. */
  editable: boolean;
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

/** One widget per program-level input, in layer order. */
export function widgetsFor(state: PortsState): WidgetSpec[] {
  const descriptor = state.composed.ok ? state.composed.descriptor : undefined;
  const widgets: WidgetSpec[] = [];
  for (const { layer, level } of state.layers) {
    if (level !== "program") continue; // global inputs are the host's, not this document's
    for (const def of flattenPorts([layer]).inputs) {
      widgets.push({
        name: def.name,
        typeLabel: typeToString(def.type),
        control: controlFor(def.type, descriptor),
        layerId: layer.id,
        hostFed: layer.policy.feeds === "host",
        editable: layer.policy.editable,
      });
    }
  }
  return widgets;
}
