import { type OutputMode, type PortLayer, Policy, type Type } from "@dendrite-lang/core";

//? SurfaceSpec: a language surface as JSON-safe DATA - the types/inputs/outputs a
// playground document declares on top of the stdlib.

export interface SurfaceTypeSpec {
  name: string;
  fields?: Record<string, Type>;
  extends?: string;
}

export interface SurfaceInputSpec {
  name: string;
  type: Type;
  default?: unknown;
}

export interface SurfaceOutputSpec {
  name: string;
  type: Type;
  mode?: OutputMode;
}

export interface SurfaceSpec {
  types?: SurfaceTypeSpec[];
  inputs: SurfaceInputSpec[];
  outputs: SurfaceOutputSpec[];
}

/**
 * The surface as the port layer a document contributes: editable, user-fed, and saved with
 * the document. (In I4 this disappears - the document's ports ARE this layer.)
 */
export function surfaceLayer(surface: SurfaceSpec): PortLayer {
  return {
    id: "document",
    ports: {
      types: surface.types,
      inputs: surface.inputs,
      outputs: surface.outputs,
    },
    policy: Policy.user,
  };
}
