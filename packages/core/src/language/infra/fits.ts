import { type Vocabulary } from "./registry";
import { type Type } from "./types";

//? valueFits: does a runtime VALUE fit a Type? The dynamic half of the type system, where
// isCompatible is the static half: the checker compares types it inferred, this compares a
// value that arrived. A cast (`$rows as number[]`) is its first caller; validation at the host
// boundary is the next.
//
// The rules mirror the static ones. `any` fits everything, a `null` value fits every type (null
// goes anywhere), a list fits when each item fits its element type, and a named type is checked
// against its whole `extends` chain: a `Grade extends number` value has to satisfy `Grade`'s
// schema AND be a number. A type carries two kinds of rule, a `schema` (zod, code only) and
// `fields` (a struct's shape, declared or inherited); both apply, at every level of the chain.
// A struct fits when every declared field is present - a field may be null, but it may not be
// missing - and extra fields are ignored, the way the static check ignores them.
//
// A function type cannot be checked: a closure carries no signature. It never fits, and the
// analyser refuses a cast to one before evaluation is ever reached. A name nothing registered
// never fits either, and is likewise caught earlier (unknown_type).
export function valueFits(value: unknown, type: Type, descriptor: Vocabulary): boolean {
  if (value === null || value === undefined) return true;
  switch (type.kind) {
    case "function":
      return false;
    case "array":
      return (
        Array.isArray(value) && value.every((item) => valueFits(item, type.element, descriptor))
      );
    case "name":
      return namedFits(value, type.name, descriptor);
  }
}

function namedFits(value: unknown, name: string, descriptor: Vocabulary): boolean {
  if (name === "any") return true;
  if (name === "null") return false; // a non-null value reached here
  // Every rule on the chain applies, from the type itself up to its root.
  const seen = new Set<string>(); // cycle guard for malformed extends chains
  for (let current: string | undefined = name; current && !seen.has(current); ) {
    seen.add(current);
    const def = descriptor.types.get(current);
    if (!def) return false;
    if (def.schema && !def.schema.safeParse(value).success) return false;
    if (def.fields && !structFits(value, def.fields, descriptor)) return false;
    current = def.extends;
  }
  return true;
}

function structFits(value: unknown, fields: Record<string, Type>, descriptor: Vocabulary): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.entries(fields).every(
    ([field, type]) => field in record && valueFits(record[field], type, descriptor),
  );
}
