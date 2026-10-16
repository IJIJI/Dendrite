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
//
// Each keeps its literal type (0.8.1): `Type.number` is `{ kind: "name"; name: "number" }` to
// the compiler, and `Type.array(Type.string)` keeps its element, so an op declaration written
// with them carries enough for `InputsOf` (registry.ts) to type an evaluator's inputs. `fn`
// returns the function member of the union, not the union: a function input is an FnValue
// whatever its signature, and `ValueOf` over the whole union would be `unknown`. A readonly
// literal is assignable to `Type`, so every reader is unchanged; a variable that held one
// constant and is assigned another needs a `Type` annotation now.
export const Type = {
  name: <N extends string>(name: N) => ({ kind: "name", name }) as const,
  array: <E extends Type>(element: E) => ({ kind: "array", element }) as const,
  fn: (
    params: Type[],
    returns: Type,
    paramNames?: string[],
  ): Extract<Type, { kind: "function" }> =>
    paramNames
      ? { kind: "function", params, returns, paramNames }
      : { kind: "function", params, returns },
  any: { kind: "name", name: "any" } as const satisfies Type,
  null: { kind: "name", name: "null" } as const satisfies Type,
  number: { kind: "name", name: "number" } as const satisfies Type,
  boolean: { kind: "name", name: "boolean" } as const satisfies Type,
  string: { kind: "name", name: "string" } as const satisfies Type,
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
export const elementOf = (t: Type | undefined): Type =>
  t?.kind === "array" ? t.element : Type.any;
