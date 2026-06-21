//? Structured type representation.
// Named types (number, boolean, Source, …) are the ONLY ones registered in the
// descriptor. Arrays and functions are structural, and derived from the named types.

export type Type =
  | { kind: "name"; name: string } // number, boolean, string, any, null, Source…
  | { kind: "array"; element: Type } // T[]
  | { kind: "function"; params: Type[]; returns: Type }; // (A, B) -> C

// A value const grouping the constructors so call sites
// read as type builders: Type.array(Type.number), Type.fn([Type.number], Type.boolean).
export const Type = {
  name: (name: string): Type => ({ kind: "name", name }),
  array: (element: Type): Type => ({ kind: "array", element }),
  fn: (params: Type[], returns: Type): Type => ({ kind: "function", params, returns }),
  any: { kind: "name", name: "any" } as Type,
  null: { kind: "name", name: "null" } as Type,
  number: { kind: "name", name: "number" } as Type,
  boolean: { kind: "name", name: "boolean" } as Type,
  string: { kind: "name", name: "string" } as Type,
};

// Canonical string form used for diagnostics, serialisation, and (for named types)
// the registry key.
export function typeToString(t: Type): string {
  switch (t.kind) {
    case "name":
      return t.name;
    case "array":
      return `${typeToString(t.element)}[]`;
    case "function":
      return `(${t.params.map(typeToString).join(", ")}) -> ${typeToString(t.returns)}`;
  }
}

// Structural equality via the canonical form (e.g. for "both branches same type").
// TODO: Check if this is the best way to do structural equality.
export const typesEqual = (a: Type, b: Type): boolean => typeToString(a) === typeToString(b);
