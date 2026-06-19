import { z, ZodType } from "zod";

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
  type: string;
  required?: boolean;
  variadic?: boolean;
}

// TODO: Should there even be a difference between higher order and standard? Could higher order not be a standard op with a function as its arg? Would enable multi function higher order nodes too..
// TODO: Should body bindings be named? What if e.g. a higher order filter node defines input and the user writes val?
export interface OpDefinition {
  name: string;
  inputs: OpInput[];
  output: string; // static fallback: used when inferOutput is absent/undefined
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
  type: string;
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
  type: string;
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
  inferOutput?: (inputTypes: Record<string, string>, bodyOutputType?: string) => string | undefined;
  /**
   * Analysis-time scoped binding type inference. Higher-order ops only.
   * Called by the analyser before entering the body scope to populate boundNames.
   * Returns binding name → type for each scoped variable (e.g. { item: 'Source' }).
   * Absent bindings fall back to 'any'. Ignored for standard ops.
   *
   * inputTypes: same as inferOutput. Resolved input type strings.
   */
  inferBodyBindings?: (inputTypes: Record<string, string>) => Record<string, string>;
}

//? Language descriptor - Single source of truth for the editor, analyser, evaluator.
export interface LanguageDescriptor {
  types: ReadonlyMap<string, TypeDefinition>;
  ops: ReadonlyMap<string, OpDefinition>;
  inputs: ReadonlyMap<string, InputDefinition>;
  outputs: ReadonlyMap<string, OutputDefinition>;
  evaluators: ReadonlyMap<string, EvaluatorDefinition>;
}

//? isCompatible - type compatibility check for the analyser.
//
//  Rules:
//    expected === 'any'            → always compatible
//    actual === 'any' | 'null'     → compatible with any expected type
//    actual === expected           → exact match
//    actual = 'T[]', expected = 'any[]' → array covariance
//
//  Subtyping: walks TypeDefinition.extends chain. A subtype is compatible with its supertype.
//  Always call this function, never inline, so subtyping stays in one place.

export function isCompatible(
  actual: string,
  expected: string,
  descriptor: LanguageDescriptor,
): boolean {
  if (expected === "any") return true;
  if (actual === "any" || actual === "null") return true;
  if (actual === expected) return true;

  // Array covariance through extends chain: T[] compat with S[] iff T compat with S.
  // Dendrite arrays are read-only (no mutation ops), so covariance is sound.
  if (actual.endsWith("[]") && expected.endsWith("[]")) {
    return isCompatible(actual.slice(0, -2), expected.slice(0, -2), descriptor);
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
   * Register a type. Automatically also registers 'T[]' with schema z.array(schema)
   * and default []. Do not manually register array variants - they are generated.
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
      // Auto-register T[] variant unless this is already an array type
      if (!name.endsWith("[]")) {
        const arrayName = `${name}[]`;
        types.set(arrayName, {
          name: arrayName,
          schema: z.array(schema),
          default: [],
          // T[] does not inherit extends from T - array covariance is handled
          // in isCompatible directly, not via the extends chain
        });
      }
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
 * Only non-array types are copied from base; T[] variants are re-generated automatically.
 * Extension is mutated in place.
 *
 * Note: cannot default base to createCoreLanguage() here - core.ts imports registry.ts
 * (circular). Use extendCoreLanguage() from core.ts when core is the intended default.
 */
export function extendLanguage(extension: Language, base: Language): Language {
  const b = base.descriptor;
  const e = extension.descriptor;
  b.types.forEach((v) => {
    if (!v.name.endsWith("[]") && !e.types.has(v.name)) {
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
