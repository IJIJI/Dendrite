import { type ZodType } from "zod";

// Type-only: serialise → ports → registry is the runtime order, and this edge back is erased.
import { type SavedProgram } from "./serialise";
import { type Thunk } from "./thunk";
import { type Type } from "./types";

//? Definition types
export interface TypeDefinition {
  name: string;
  /**
   * Optional runtime validator for values of this type. Nothing in core calls it yet; it is
   * the slot a boundary check would use, and it only exists on types a host registers on the
   * LANGUAGE. A type declared inside a port layer travels with a saved program, and a zod
   * schema cannot: converting one to JSON drops `.refine` predicates silently, and nothing
   * revives it. Inheritance is the way round that - a layer type extending a language type
   * inherits its validator without carrying anything.
   */
  schema?: ZodType<unknown>;
  /**
   * The "zero" or "empty" value for this type. Used as a resilient fallback when a node
   * produces null or is unset. Auto-derived for primitives; complex types should provide one.
   */
  default?: unknown;
  /**
   * Subtyping. Name of the parent type this type extends.
   * isCompatible walks this chain: a subtype is usable wherever its supertype is expected.
   */
  extends?: string;
  /**
   * Struct fields: field name → type. When present, the analyser type-checks field access
   * (`x.field`) — an unknown field is an error, a known field's type is inferred (and
   * recurses for nested struct fields → multilevel). Absent → field access stays `any`.
   */
  fields?: Record<string, Type>;
}

// Todo: Add default? Also makes it easier to access inputs.
export interface OpInput {
  name: string;
  type: Type;
  required?: boolean;
  variadic?: boolean;
  /**
   * The op converts this input. The analyser accepts a value of the same SHAPE with any data
   * at the leaves (`Join([1, 2])` fits `parts: string[]`, with no `any` warning), and the
   * evaluator converts each leaf with `Convert` before the op runs, so the op sees the type
   * it declared. Only `string`, `number`, `boolean` or a list of them can carry it - a
   * struct, a function or `any` has no rule - and neither a variadic input (nothing needs it)
   * nor an optional one (an absent input would arrive as "" instead of absent). A wrong
   * combination is refused when the language composes. The reference shows it as `name~`.
   */
  convert?: true;
  /**
   * The op receives this input unevaluated, as a `Thunk` (a variadic one as a `Thunk[]`), and
   * reads `.value` when and if it wants it: `If` reads one branch, `And` stops at the first
   * false. Laziness is how an op RECEIVES an input, not what a value is: no type carries it
   * and a program cannot write it. A `convert` input converts inside the thunk. The
   * reference shows it on the type, `then: lazy any`.
   */
  lazy?: true;
}

export interface OpDefinition {
  name: string;
  inputs: readonly OpInput[];
  output: Type; // static fallback: used when inferOutput is absent/undefined
  category?: string;
  /** One plain sentence (no markup) for a reference page and, later, editor hover. */
  description?: string;
  /**
   * Complete, self-contained programs showing the op - literals only, no `$inputs` (nothing
   * declares them) - as SavedPrograms, so an example is whatever the language can author:
   * code today (`den`), a rete graph later, with no change here. Each is loaded by a test so
   * it cannot rot. Undeclared outputs only warn, so `output x = …` needs no ports.
   */
  examples?: readonly SavedProgram[];
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
 * The value an input of a declared `Type` holds when an op runs: `number`, `string`,
 * `boolean` and `null` their primitive, a list a list of its element's, a function an
 * `FnValue`, `any` and a host type `unknown`. True by the rule of 0.8.0 (an input that names
 * a type arrives as that kind, or the op does not run), with one limit: the items of a
 * declared `T[]` are the declaration's, as a host's declared output type is, since the door
 * checks a list's kind and not its items.
 */
export type ValueOf<T> = T extends { kind: "name"; name: infer N }
  ? N extends "number"
    ? number
    : N extends "string"
      ? string
      : N extends "boolean"
        ? boolean
        : N extends "null"
          ? null
          : unknown
  : T extends { kind: "array"; element: infer E }
    ? ValueOf<E>[]
    : T extends { kind: "function" }
      ? FnValue
      : unknown;

type OneInput<I extends OpInput> = I extends { lazy: true }
  ? Thunk<ValueOf<I["type"]>>
  : ValueOf<I["type"]>;

/**
 * The inputs of an op definition, as its evaluator receives them (0.8.1): each key typed from
 * its declaration, a `Thunk<T>` for a lazy input, `T[]` for a variadic one, `T | undefined`
 * for an optional one (an absent optional input has no key, and a null one reads as absent),
 * the declared type for a converting one. An op named by a string declares nothing here, so
 * every key is `unknown`; so does an op whose `inputs` is a variable typed `OpInput[]` rather
 * than a literal, since the names and types are not literal then.
 */
export type InputsOf<D> = D extends OpDefinition
  ? {
      [I in D["inputs"][number] as I["name"]]: I extends { variadic: true }
        ? OneInput<I>[]
        : I extends { required: false }
          ? OneInput<I> | undefined
          : OneInput<I>;
    }
  : Record<string, unknown>;

/**
 * The lazy inputs alone, as 0.7.0 typed them.
 * @deprecated `InputsOf` types every key since 0.8.1; this is its lazy slice, kept for a host
 * that named it. It leaves in the minor before 1.0.
 */
export type LazyInputsOf<D> = D extends OpDefinition
  ? {
      [I in D["inputs"][number] as I extends { lazy: true } ? I["name"] : never]: I extends {
        variadic: true;
      }
        ? Thunk[]
        : I extends { required: false }
          ? Thunk | undefined
          : Thunk;
    }
  : Record<never, never>;

/**
 * Evaluator definition for an op. Higher-order ops are ordinary ops with a
 * function-typed input — the function arrives as a resolved FnValue in `inputs`
 * and is called directly; there is no separate body/apply mechanism.
 *
 * `op` is the op's name, or the definition `registerOp` returned. With the definition, every
 * key of `inputs` is typed from it (`InputsOf`): `condition` is a boolean, `then` a `Thunk`,
 * a variadic number a `number[]`, so no cast is needed and a wrong one does not compile
 * (`language/evaluator.test-d.ts` holds each case). The language stores the name either way,
 * so a reader of `op` always sees a string.
 */
export interface EvaluatorDefinition<D extends OpDefinition | string = string> {
  op: D;
  /**
   * The finite check on this evaluator's result, on unless said: the evaluator walks a list or
   * a struct the op returns and reads a number that is not finite as `null` and a negative
   * zero as `0`, copying only when it finds one (4 ns an item, 46 ns a struct of four fields,
   * measured). `false` turns the walk off, on the op's promise that no number it returns, at
   * any depth, is a `NaN` or an infinity: the library's ops that only hand values on say so
   * (`Map`, `Filter`, `Concat`, …), and so may a host's op whose numbers are its own. A number
   * returned bare is read either way.
   */
  finiteCheck?: false;
  // A method signature, not a property: its parameter is checked bivariantly, which is what
  // lets a definition typed by `D` store into the map of untyped ones (registerEvaluator).
  evaluate(inputs: InputsOf<D>): unknown;
  /**
   * Analysis-time output type inference. Called by the analyser after resolving
   * input types. Returns undefined to fall back to OpDefinition.output.
   *
   * inputTypes: Record of input name → resolved type of the connected node.
   *   For a variadic input, the type its items share - `boolean` for And(a, b), not
   *   `boolean[]`; `number[]` for Concat over number lists - or `any` when they disagree, and
   *   absent when it has no items.
   *   For a function-typed input, the value is the resolved function Type, so an op can
   *   read e.g. `inputTypes.transform.returns` to type its result.
   */
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

//? Vocabulary - what a LANGUAGE owns: the words programs are written in. A language
// declares no inputs and no outputs; those belong to port layers, which compose onto a
// vocabulary to produce the descriptor below (see language/compose.ts).
export interface Vocabulary {
  types: ReadonlyMap<string, TypeDefinition>;
  ops: ReadonlyMap<string, OpDefinition>;
  evaluators: ReadonlyMap<string, EvaluatorDefinition>;
}

//? Language descriptor - a vocabulary plus the ports a program is checked against. Only
// composeLayers produces one, which is what stops a program being analysed against a bare
// language: with no declarations, every output would be silently dropped as unknown.
export interface LanguageDescriptor extends Vocabulary {
  inputs: ReadonlyMap<string, InputDefinition>;
  outputs: ReadonlyMap<string, OutputDefinition>;
}

//? isCompatible: Structural type compatibility check for the analyser.
//
//  Rules (on the structured Type union):
//    expected = any        → any DATA value, NOT a function and NOT a list that holds one
//    actual   = any | null → usable where any DATA value is expected, NOT a function
//    arrays                → covariant: T[] compat S[] iff T compat S
//    functions             → same arity, contravariant params, covariant return
//    names                 → exact match, or actual extends … expected (extends chain)
//
//  "functions are never any" is the totality guard: it blocks the Z combinator
//  (a function cannot be smuggled through an `any` slot). Always call this
//  function, never inline, so subtyping stays in one place.

// A function, or a list of them at any depth. A list is data only when its items are: until
// 2026-10-08 the guard below looked at the outermost kind alone, so `[x => x]` fitted `any`
// where `x => x` did not, and a function could ride into an `any` slot inside a list.
const holdsFunction = (type: Type): boolean =>
  type.kind === "function" || (type.kind === "array" && holdsFunction(type.element));

export function isCompatible(actual: Type, expected: Type, descriptor: Vocabulary): boolean {
  // any/null permissive rules apply to DATA only — functions are never `any`.
  if (expected.kind === "name" && expected.name === "any") {
    return !holdsFunction(actual);
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
