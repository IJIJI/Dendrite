import { type ZodType } from "zod";

import { type Type } from "./types";

//? Definition types
export interface TypeDefinition {
  name: string;
  schema: ZodType<unknown>;
  /**
   * The "zero" or "empty" value for this type. Used as a resilient fallback
   * when a node produces null or is unset. Automatically set to [] for T[]
   * types and auto-derived for primitives. Complex types should provide one.
   */
  default?: unknown;
  /**
   * Subtyping. Name of the parent type this type extends.
   * isCompatible walks this chain: a subtype is usable wherever its supertype is expected.
   */
  extends?: string;
}

export interface OpInput {
  name: string;
  type: Type;
  required?: boolean;
  variadic?: boolean;
}

export interface OpDefinition {
  name: string;
  inputs: OpInput[];
  output: Type; // static fallback: used when inferOutput is absent/undefined
  category?: string;
}

export interface InputDefinition {
  name: string;
  type: Type;
  trigger?: boolean; // discrete event. value resets to default after firing
  default?: unknown; // value when inactive (used by Runtime.fireTrigger to reset)
}

/**
 * Output requirement mode:
 * 'optional'  - fine either way, no warning if absent
 * 'desired'   - AnalysisWarning (missing_desired_program_output) if program doesn't declare it
 * 'required'  - AnalysisError (missing_required_program_output) if program doesn't declare it
 */
export type OutputMode = "optional" | "desired" | "required";

export interface OutputDefinition {
  name: string;
  type: Type;
  mode?: OutputMode; // defaults to 'optional'
}

/**
 * Runtime representation of a Dendrite function value: a lambda evaluates to one,
 * and a function-typed op input arrives as one. Call it with positional args.
 */
export type FnValue = (...args: unknown[]) => unknown;

/**
 * Evaluator definition for an op. Higher-order ops are ordinary ops with a
 * function-typed input — the function arrives as a resolved FnValue in `inputs`
 * and is called directly; there is no separate body/apply mechanism.
 */
export interface EvaluatorDefinition {
  op: string;
  evaluate: (inputs: Record<string, unknown>, hostContext?: unknown) => unknown;
  /**
   * Analysis-time output type inference. Called by the analyser after resolving
   * input types. Returns undefined to fall back to OpDefinition.output.
   *
   * inputTypes: Record of input name → resolved type of the connected node.
   *   For variadic inputs, the value is the element type (e.g. boolean, not boolean[]).
   *   For a function-typed input, the value is the resolved function Type, so an op can
   *   read e.g. `inputTypes.transform.returns` to type its result.
   */
  // TODO: Should the type of variadic inputs not be used as array?
  inferOutput?: (inputTypes: Record<string, Type>) => Type | undefined;
  /**
   * Analysis-time expected-input-type inference, for inputs whose type is generic in
   * the other inputs (a function-typed input over a list's element type). Called after
   * resolving the earlier inputs; returns input name → expected type, overriding the
   * static OpInput.type. e.g. Filter → { predicate: (elementOf(list)) -> boolean }.
   * The function-typed input must be declared AFTER the inputs it depends on.
   */
  inferInputTypes?: (inputTypes: Record<string, Type>) => Record<string, Type>;
}

//? Language descriptor - Single source of truth for the editor, analyser, evaluator.
export interface LanguageDescriptor {
  types: ReadonlyMap<string, TypeDefinition>;
  ops: ReadonlyMap<string, OpDefinition>;
  inputs: ReadonlyMap<string, InputDefinition>;
  outputs: ReadonlyMap<string, OutputDefinition>;
  evaluators: ReadonlyMap<string, EvaluatorDefinition>;
}

//? isCompatible: Structural type compatibility check for the analyser.
//
//  Rules (on the structured Type union):
//    expected = any        → any DATA value (arrays included), NOT a function
//    actual   = any | null → usable where any DATA value is expected, NOT a function
//    arrays                → covariant: T[] compat S[] iff T compat S
//    functions             → same arity, contravariant params, covariant return
//    names                 → exact match, or actual extends … expected (extends chain)
//
//  "functions are never any" is the totality guard: it blocks the Z combinator
//  (a function cannot be smuggled through an `any` slot). Always call this
//  function, never inline, so subtyping stays in one place.

export function isCompatible(
  actual: Type,
  expected: Type,
  descriptor: LanguageDescriptor,
): boolean {
  // any/null permissive rules apply to DATA only — functions are never `any`.
  if (expected.kind === "name" && expected.name === "any") {
    return actual.kind !== "function";
  }
  if (actual.kind === "name" && (actual.name === "any" || actual.name === "null")) {
    return expected.kind !== "function";
  }

  // Arrays are covariant. Dendrite arrays are read-only, so covariance is sound.
  if (actual.kind === "array" && expected.kind === "array") {
    return isCompatible(actual.element, expected.element, descriptor);
  }

  // Functions: same arity, contravariant params, covariant return. This lets an
  // (any) -> T lambda flow where (Concrete) -> T is expected (gradual typing), and
  // keeps extends-subtyping sound.
  if (actual.kind === "function" && expected.kind === "function") {
    return (
      actual.params.length === expected.params.length &&
      // Contravariant: each expected param must be usable as the actual's param.
      expected.params.every((ep, i) => isCompatible(ep, actual.params[i], descriptor)) &&
      // Covariant return.
      isCompatible(actual.returns, expected.returns, descriptor)
    );
  }

  // Named types: exact match, or walk the extends chain upward from actual.
  // Subtyping is one-directional: a subtype is usable where its supertype is expected.
  if (actual.kind === "name" && expected.kind === "name") {
    if (actual.name === expected.name) return true;
    let current: string | undefined = actual.name;
    const seen = new Set<string>(); // cycle guard for malformed extends chains
    while (current && !seen.has(current)) {
      seen.add(current);
      const def = descriptor.types.get(current);
      if (!def?.extends) break;
      if (def.extends === expected.name) return true;
      current = def.extends;
    }
    return false;
  }

  // Mismatched kinds (e.g. array vs name) are incompatible.
  return false;
}

// The Language assembly (createLanguage / extendLanguage) lives in ../language.ts -
// it bundles this descriptor with a parser-layer Grammar, so it sits above infra.
