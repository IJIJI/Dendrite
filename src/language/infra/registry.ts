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

// TODO: Should there even be a difference between higher order and standard? Could higher order not be a standard op with a function as its arg? Would enable multi function higher order nodes too..
// TODO: Should body bindings be named? What if e.g. a higher order filter node defines input and the user writes val?
export interface OpDefinition {
  name: string;
  inputs: OpInput[];
  output: Type; // static fallback: used when inferOutput is absent/undefined
  category?: string;
  /**
   * If true, this op uses HigherOrderNode in the AST rather than OperationNode.
   * The editor renders a body sub-graph input instead of wired inputs.
   */
  higherOrder?: boolean;
  /**
   * Scoped variable names available inside the body sub-graph.
   * Declared here so the editor knows what can be wired inside the body.
   * Must match the bindings[] array on the HigherOrderNode at evaluate time.
   * e.g. ['item'] for Filter/Map, ['acc', 'item'] for Reduce
   */
  bodyBindings?: string[];
}

// TODO: Also use default for non-trigger inputs? Usefull for computation before they are set.
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
 * The apply callback passed to higher-order evaluators.
 * Extends the current scope with item bindings and evaluates the body.
 */
export type Apply = (...args: unknown[]) => unknown;

/**
 * Unified evaluator definition. covers both standard and higher-order ops.
 *
 * apply is undefined for standard (OperationNode) ops, they should ignore it.
 * apply is always defined for higher-order (HigherOrderNode) ops, they require it.
 */
export interface EvaluatorDefinition {
  op: string;
  evaluate: (
    inputs: Record<string, unknown>,
    apply: Apply | undefined,
    hostContext?: unknown,
  ) => unknown;
  /**
   * Analysis-time output type inference. Called by the analyser after resolving
   * input types, with the body's output type for higher-order ops.
   * Returns undefined to fall back to OpDefinition.output.
   *
   * inputTypes: Record of input name → output type string of the connected node.
   *   For variadic inputs, the value is the element type (e.g. 'boolean', not 'boolean[]').
   * bodyOutputType: the derived output type of the body node (higher-order ops only).
   */
  inferOutput?: (inputTypes: Record<string, Type>, bodyOutputType?: Type) => Type | undefined;
  /**
   * Analysis-time scoped binding type inference. Higher-order ops only.
   * Called by the analyser before entering the body scope to populate boundNames.
   * Returns binding name → type for each scoped variable (e.g. { item: 'Source' }).
   * Absent bindings fall back to 'any'. Ignored for standard ops.
   *
   * inputTypes: same as inferOutput. Resolved input type strings.
   */
  inferBodyBindings?: (inputTypes: Record<string, Type>) => Record<string, Type>;
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
//    functions             → same arity, invariant params + return
//    names                 → exact match, or actual extends … expected (extends chain)
// TODO: Decide if null should be treated as a subtype of any. Value nullability.
//
//  "functions are never any" is the totality guard: it blocks the Z combinator
//  (a function cannot be smuggled through an `any` slot). Always call this
//  function, never inline, so subtyping stays in one place.

export function isCompatible(actual: Type, expected: Type, descriptor: LanguageDescriptor): boolean {
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

  // Functions: same arity, invariant params and return.
  if (actual.kind === "function" && expected.kind === "function") {
    return (
      actual.params.length === expected.params.length &&
      actual.params.every((p, i) => isCompatible(p, expected.params[i], descriptor)) &&
      isCompatible(actual.returns, expected.returns, descriptor)
    );
  }

  // Walk the extends chain upward from actual toward expected.
  // Subtyping is one-directional: a subtype is usable where its supertype is expected.
  let current: string | undefined = actual;
  const seen = new Set<string>(); // cycle guard for malformed extends chains
  while (current && !seen.has(current)) {
    seen.add(current);
    const def = descriptor.types.get(current);
    if (!def?.extends) break;
    if (def.extends === expected) return true;
    current = def.extends;
  }

  return false;
}

//? Language: The registration API
export interface Language {
  descriptor: LanguageDescriptor;
  /**
   * Register a named type. Arrays (and functions) are structural - any type is
   * implicitly arrayable - so there are no array variants to register.
   */
  registerType(
    name: string,
    schema: ZodType<unknown>,
    config?: { default?: unknown; extends?: string },
  ): void;
  registerOp(def: OpDefinition): void;
  registerInput(def: InputDefinition): void;
  registerOutput(def: OutputDefinition): void;
  registerEvaluator(def: EvaluatorDefinition): void;
}

export function createLanguage(): Language {
  const types = new Map<string, TypeDefinition>();
  const ops = new Map<string, OpDefinition>();
  const inputs = new Map<string, InputDefinition>();
  const outputs = new Map<string, OutputDefinition>();
  const evaluators = new Map<string, EvaluatorDefinition>();

  const descriptor: LanguageDescriptor = { types, ops, inputs, outputs, evaluators };

  return {
    descriptor,

    registerType(name, schema, config) {
      types.set(name, { name, schema, ...config });
    },

    registerOp: (def) => ops.set(def.name, def),
    registerInput: (def) => inputs.set(def.name, def),
    registerOutput: (def) => outputs.set(def.name, def),
    registerEvaluator: (def) => evaluators.set(def.op, def),
  };
}

/**
 * Extend a language with definitions from a base, then return it.
 * Extension definitions take precedence - base keys already present are skipped.
 * Extension is mutated in place.
 *
 * Note: cannot default base to createCoreLanguage() here - core.ts imports registry.ts
 * (circular). Use extendCoreLanguage() from core.ts when core is the intended default.
 */
export function extendLanguage(extension: Language, base: Language): Language {
  const b = base.descriptor;
  const e = extension.descriptor;
  b.types.forEach((v) => {
    if (!e.types.has(v.name)) {
      extension.registerType(v.name, v.schema, { default: v.default, extends: v.extends });
    }
  });
  b.ops.forEach((v) => {
    if (!e.ops.has(v.name)) extension.registerOp(v);
  });
  b.inputs.forEach((v) => {
    if (!e.inputs.has(v.name)) extension.registerInput(v);
  });
  b.outputs.forEach((v) => {
    if (!e.outputs.has(v.name)) extension.registerOutput(v);
  });
  b.evaluators.forEach((v) => {
    if (!e.evaluators.has(v.op)) extension.registerEvaluator(v);
  });
  return extension;
}
