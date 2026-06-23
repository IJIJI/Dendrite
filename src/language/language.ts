import { type ZodType } from "zod";

import {
  type EvaluatorDefinition,
  type InputDefinition,
  type LanguageDescriptor,
  type OpDefinition,
  type OutputDefinition,
  type TypeDefinition,
} from "./infra/registry";
import {
  createGrammar,
  type Grammar,
  type Led,
  type Nud,
  registerLed,
  registerNud,
  registerStatement,
  type StatementFn,
} from "./parser/grammar";
import { installCoreGrammar } from "./parser/core-grammar";

//? Language: the assembly that bundles the infra LanguageDescriptor (semantics) with a
// parser-layer Grammar (syntax) behind one register API. Defining a language is one
// object: register ops/evaluators AND, optionally, syntax. Sits above infra + parser.

export interface Language {
  descriptor: LanguageDescriptor;
  grammar: Grammar;
  // Semantics → descriptor.
  registerType(
    name: string,
    schema: ZodType<unknown>,
    config?: { default?: unknown; extends?: string },
  ): void;
  registerOp(def: OpDefinition): void;
  registerInput(def: InputDefinition): void;
  registerOutput(def: OutputDefinition): void;
  registerEvaluator(def: EvaluatorDefinition): void;
  // Syntax → grammar. Full handlers; operators (registerInfix/Prefix) are sugar (F1b).
  registerNud(key: string, nud: Nud): void;
  registerLed(key: string, led: Led): void;
  registerStatement(key: string, fn: StatementFn): void;
}

// Every language has the core grammar installed (it is the always-present syntax);
// extensions add ops + operators/statements on top.
export function createLanguage(): Language {
  const types = new Map<string, TypeDefinition>();
  const ops = new Map<string, OpDefinition>();
  const inputs = new Map<string, InputDefinition>();
  const outputs = new Map<string, OutputDefinition>();
  const evaluators = new Map<string, EvaluatorDefinition>();
  const descriptor: LanguageDescriptor = { types, ops, inputs, outputs, evaluators };

  const grammar = createGrammar();
  installCoreGrammar(grammar);

  return {
    descriptor,
    grammar,

    registerType(name, schema, config) {
      types.set(name, { name, schema, ...config });
    },
    registerOp: (def) => ops.set(def.name, def),
    registerInput: (def) => inputs.set(def.name, def),
    registerOutput: (def) => outputs.set(def.name, def),
    registerEvaluator: (def) => evaluators.set(def.op, def),

    registerNud: (key, nud) => registerNud(grammar, key, nud),
    registerLed: (key, led) => registerLed(grammar, key, led),
    registerStatement: (key, fn) => registerStatement(grammar, key, fn),
  };
}

/**
 * Extend a language with a base's definitions (semantics AND syntax), then return it.
 * Extension definitions take precedence - base keys already present are skipped.
 * Extension is mutated in place.
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

  // Grammar: nuds / leds / statements / operator tokens.
  base.grammar.nuds.forEach((v, k) => {
    if (!extension.grammar.nuds.has(k)) extension.registerNud(k, v);
  });
  base.grammar.leds.forEach((v, k) => {
    if (!extension.grammar.leds.has(k)) extension.registerLed(k, v);
  });
  base.grammar.statements.forEach((v, k) => {
    if (!extension.grammar.statements.has(k)) extension.registerStatement(k, v);
  });
  base.grammar.operatorTokens.forEach((tok) => extension.grammar.operatorTokens.add(tok));

  return extension;
}
