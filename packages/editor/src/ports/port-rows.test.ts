import {
  type ComposeResult,
  EMPTY_PORTS,
  Policy,
  type PortLayer,
  type Ports,
  type PortsState,
  Type,
} from "@dendrite-lang/core";
import { describe, expect, it } from "vitest";

import { declaredNames, editableLayer, layerPorts, outputRows, widgetsFor } from "./port-rows";

const layer = (id: string, ports: Ports, policy = Policy.user): PortLayer => ({
  id,
  ports,
  policy,
});

const state = (layers: { layer: PortLayer; level: "global" | "program" }[]): PortsState => ({
  layers,
  composed: { ok: false, problems: [] } satisfies ComposeResult,
});

const hostLayer = layer(
  "beacon",
  {
    inputs: [{ name: "busses", type: Type.number }],
    outputs: [{ name: "tally", type: Type.string }],
  },
  Policy.host,
);
const documentLayer = layer("document", {
  inputs: [{ name: "score", type: Type.number }],
  outputs: [{ name: "result", type: Type.string }],
});

const both = state([
  { layer: hostLayer, level: "global" },
  { layer: documentLayer, level: "program" },
]);

describe("rows a pane renders", () => {
  it("shows program-level inputs only - a global input is the host's, not this document's", () => {
    expect(widgetsFor(both).map((w) => w.name)).toEqual(["score"]);
  });

  it("shows outputs at EVERY level - this program is expected to produce them either way", () => {
    expect(outputRows(both)).toEqual([
      {
        name: "tally",
        type: Type.string,
        typeLabel: "string",
        layerId: "beacon",
        editable: false,
      },
      {
        name: "result",
        type: Type.string,
        typeLabel: "string",
        layerId: "document",
        editable: true,
      },
    ]);
  });

  it("falls back to a JSON control while composition is failing", () => {
    // No descriptor means no extends chain to follow, so nothing can be narrowed.
    expect(widgetsFor(both)[0]!.control).toBe("json");
  });
});

describe("finding the layer to edit", () => {
  it("is the first editable program-level layer, and none when the host owns them all", () => {
    expect(editableLayer(both)?.id).toBe("document");
    expect(editableLayer(state([{ layer: hostLayer, level: "program" }]))).toBeUndefined();
  });

  it("layerPorts reads any layer back, at either level", () => {
    expect(layerPorts(both, "beacon")).toBe(hostLayer.ports);
    expect(layerPorts(both, "nope")).toBeUndefined();
  });

  it("declaredNames spans every layer - a new name must clear all of them", () => {
    expect(declaredNames(both, "inputs")).toEqual(["busses", "score"]);
    expect(declaredNames(both, "outputs")).toEqual(["tally", "result"]);
    expect(
      declaredNames(state([{ layer: layer("empty", EMPTY_PORTS), level: "program" }]), "inputs"),
    ).toEqual([]);
  });
});
