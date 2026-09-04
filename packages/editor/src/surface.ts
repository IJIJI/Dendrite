import { type Language, type OutputMode, type Type } from "@dendrite-lang/core";
import { z } from "zod";

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

/** Register a surface onto a language (types first, so input/output types resolve). */
export function applySurface(lang: Language, surface: SurfaceSpec): void {
  for (const t of surface.types ?? []) {
    lang.registerType(t.name, z.unknown(), { fields: t.fields, extends: t.extends });
  }
  for (const input of surface.inputs) lang.registerInput(input);
  for (const output of surface.outputs) lang.registerOutput(output);
}
