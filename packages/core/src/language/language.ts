import { z } from "zod";

import { type ASTNode } from "./infra/nodes";
import {
  type EvaluatorDefinition,
  type OpDefinition,
  type TypeDefinition,
  type Vocabulary,
} from "./infra/registry";
import {
  createGrammar,
  type Grammar,
  type Led,
  type Nud,
  registerInfix,
  registerLed,
  registerNud,
  registerPrefix,
  registerStatement,
  type StatementFn,
} from "./parser/grammar";
import { installCoreGrammar } from "./parser/core-grammar";
import { tokenise } from "./parser/lexer";
import { parse } from "./parser/parser";
import { type ParseResult } from "./parser/types";

// Re-export the binding-power tiers: registering operators is part of the Language API.
export { BP } from "./parser/precedence";

//? Language: the assembly that bundles the infra LanguageDescriptor (semantics) with a
// parser-layer Grammar (syntax) behind one register API. Defining a language is one
// object: register ops/evaluators AND, optionally, syntax. Sits above infra + parser.

export interface Language {
  descriptor: Vocabulary;
  grammar: Grammar;
  // Semantics → descriptor.
  registerType(name: string, config?: Omit<TypeDefinition, "name">): void;
  registerOp(def: OpDefinition): void;
  registerEvaluator(def: EvaluatorDefinition): void;
  // Syntax → grammar. Full handlers, with operator sugar on top.
  registerNud(key: string, nud: Nud): void;
  registerLed(key: string, led: Led): void;
  registerStatement(key: string, fn: StatementFn): void;
  registerInfix(
    token: string,
    bp: number,
    build: (left: ASTNode, right: ASTNode) => ASTNode,
    rightAssoc?: boolean,
  ): void;
  registerPrefix(token: string, bp: number, build: (operand: ASTNode) => ASTNode): void;
}

// Every language has the core grammar AND the primitive types installed - the
// always-present syntax plus the types the core literal forms produce - so a bare
// language is self-consistent. Extensions add ops + operators/statements on top.
export function createLanguage(): Language {
  const types = new Map<string, TypeDefinition>();
  const ops = new Map<string, OpDefinition>();
  const evaluators = new Map<string, EvaluatorDefinition>();
  const descriptor: Vocabulary = { types, ops, evaluators };

  const grammar = createGrammar();
  installCoreGrammar(grammar);

  const lang: Language = {
    descriptor,
    grammar,

    registerType(name, config) {
      types.set(name, { name, ...config });
    },
    registerOp: (def) => ops.set(def.name, def),
    registerEvaluator: (def) => evaluators.set(def.op, def),

    registerNud: (key, nud) => registerNud(grammar, key, nud),
    registerLed: (key, led) => registerLed(grammar, key, led),
    registerStatement: (key, fn) => registerStatement(grammar, key, fn),
    registerInfix: (token, bp, build, rightAssoc) =>
      registerInfix(grammar, token, bp, build, rightAssoc),
    registerPrefix: (token, bp, build) => registerPrefix(grammar, token, bp, build),
  };

  installCorePrimitives(lang);
  return lang;
}

// The primitive types the core literal forms produce (number / string / boolean) plus
// `any`. Registered by the core (not stdlib) so a bare language is self-consistent: the
// grammar parses `42` / `"x"` / `true` AND the descriptor knows those types (for defaults,
// schemas, extends). Arrays/functions stay structural (Type.array / Type.fn) - none to register.
function installCorePrimitives(lang: Language): void {
  lang.registerType("boolean", { schema: z.boolean(), default: false });
  lang.registerType("number", { schema: z.number(), default: 0 });
  lang.registerType("string", { schema: z.string(), default: "" });
  lang.registerType("any", { default: null }); // any value is valid; nothing to check
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
      extension.registerType(v.name, {
        schema: v.schema,
        default: v.default,
        extends: v.extends,
        fields: v.fields,
      });
    }
  });
  b.ops.forEach((v) => {
    if (!e.ops.has(v.name)) extension.registerOp(v);
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

//? parseSource: source → RawProgram in one call (lex + parse, no analysis). Derives the
// lexer's operator vocabulary from the language's grammar (single-sourced - adding an
// operator needs no lexer edit) and merges lexer + parser diagnostics.
export function parseSource(source: string, language: Language): ParseResult {
  const {
    tokens,
    errors: lexErrors,
    warnings: lexWarnings,
  } = tokenise(source, [...language.grammar.operatorTokens]);
  const result = parse(tokens, language.descriptor, language.grammar);
  const warnings = [...lexWarnings, ...result.warnings];
  if (lexErrors.length > 0 || !result.ok) {
    return { ok: false, errors: [...lexErrors, ...(result.ok ? [] : result.errors)], warnings };
  }
  return { ok: true, program: result.program, warnings };
}
