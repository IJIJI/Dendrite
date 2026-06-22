//? Structured type representation.
// Named types (number, boolean, Source, …) are the ONLY ones registered in the
// descriptor. Arrays and functions are structural, and derived from the named types.

export type Type =
  | { kind: "name"; name: string } // number, boolean, string, any, null, Source…
  | { kind: "array"; element: Type } // T[]
  // (A, B) -> C. paramNames is optional metadata (set by the analyser from a lambda's
  // params) used to resolve named application arguments. It does NOT affect type
  // identity/compatibility - typeToString, typesEqual and isCompatible all ignore it.
  | { kind: "function"; params: Type[]; returns: Type; paramNames?: string[] };

// A value const grouping the constructors so call sites
// read as type builders: Type.array(Type.number), Type.fn([Type.number], Type.boolean).
export const Type = {
  name: (name: string): Type => ({ kind: "name", name }),
  array: (element: Type): Type => ({ kind: "array", element }),
  fn: (params: Type[], returns: Type, paramNames?: string[]): Type =>
    paramNames
      ? { kind: "function", params, returns, paramNames }
      : { kind: "function", params, returns },
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

// Structural equality (e.g. for "both If branches are the same type").
export function typesEqual(a: Type, b: Type): boolean {
  if (a.kind === "name" && b.kind === "name") return a.name === b.name;
  if (a.kind === "array" && b.kind === "array") return typesEqual(a.element, b.element);
  if (a.kind === "function" && b.kind === "function") {
    return (
      a.params.length === b.params.length &&
      a.params.every((p, i) => typesEqual(p, b.params[i])) &&
      typesEqual(a.returns, b.returns)
    );
  }
  return false;
}

// Common predicates / accessors over types. Centralised here so the analyser,
// stdlib, and extensions share one definition instead of each re-deriving them.
export const isAny = (t: Type): boolean => t.kind === "name" && t.name === "any";
export const isAnyOrNull = (t: Type): boolean =>
  t.kind === "name" && (t.name === "any" || t.name === "null");
export const elementOf = (t: Type | undefined): Type => (t?.kind === "array" ? t.element : Type.any);
