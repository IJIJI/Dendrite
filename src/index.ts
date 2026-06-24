//? @dendrite-lang/core — public API.
//
// Curated entry point for consumers (e.g. @dendrite-lang/beacon). The high-level flow:
//   const lang = createStdlib();            // or createLanguage() / extendStdlib(ext)
//   const parsed = parseSource(src, lang);  // → RawProgram
//   const analysed = analyse(parsed.program, lang.descriptor);  // → CoreProgram
//   const runtime = createRuntime(lang.descriptor);             // reactive multi-program
// The parser kernel/grammar internals are intentionally NOT re-exported; extend a
// language through its register* methods + operators instead.

// ── infra: types, AST, descriptor, programs ──────────────────────────────────
export * from "./language/infra/types"; // Type (value + type), typeToString, typesEqual, isAny, elementOf, …
export * from "./language/infra/nodes"; // ASTNode/CNode + variants, SourceRef, LiteralValue, operationNode
export * from "./language/infra/registry"; // LanguageDescriptor, Op/Input/Output/Type/Evaluator definitions, isCompatible, FnValue
export * from "./language/infra/program"; // RawProgram, CoreProgram

// ── language assembly + source → RawProgram ──────────────────────────────────
export { createLanguage, extendLanguage, parseSource, BP, type Language } from "./language/language";

// ── standard library ─────────────────────────────────────────────────────────
export { createStdlib, extendStdlib } from "./language/stdlib";

// ── analysis ─────────────────────────────────────────────────────────────────
export { analyse, getOutputType } from "./language/analyser/analyser";
export * from "./language/analyser/types"; // AnalysisResult / Error / Warning (+ kinds), AnalysisContext

// ── evaluation ───────────────────────────────────────────────────────────────
export {
  createEvalState,
  updateInput,
  evaluate,
  evaluateProgram,
  outputDependencies,
} from "./language/evaluator/evaluator";
export * from "./language/evaluator/types"; // EvalState, EvalError (+ kind)

// ── execution levels ─────────────────────────────────────────────────────────
export { run, createProgramRunner, type ProgramRunner } from "./language/runtime/runner";
export {
  createRuntime,
  type Runtime,
  type ProgramHandle,
  type OutputHandler,
  type ErrorHandler,
} from "./language/runtime/runtime";

// ── environment (descriptor-bound convenience wrapper) ───────────────────────
export { createEnvironment, type Environment, type CompileResult } from "./language/environment";

// ── parsing surface (lower level; result types needed for parseSource) ───────
export { tokenise, type Token, type TokenKind, type LexResult } from "./language/parser/lexer";
export { parse, parseExpression, type ExpressionResult } from "./language/parser/parser";
export * from "./language/parser/types"; // ParseResult / Error / Warning (+ kinds)
