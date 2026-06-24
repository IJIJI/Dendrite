import { analyse } from "./analyser/analyser";
import { type AnalysisResult, type AnalysisWarning } from "./analyser/types";
import { type CoreProgram, type RawProgram } from "./infra/program";
import { type Language, parseSource } from "./language";
import { type ParseError, type ParseResult, type ParseWarning } from "./parser/types";
import { createProgramRunner, run, type ProgramRunner } from "./runtime/runner";
import { createRuntime, type Runtime } from "./runtime/runtime";

//? Environment: a Language bound to its convenience operations, so callers don't thread
// `language` / `descriptor` through every call. The front door for embedding Dendrite.
// (A shared prelude of helper bindings will attach here later — see .docs/todo.md.)

// Result of compile() = parse + analyse, tagged with the stage that failed.
export type CompileResult =
  | { ok: true; program: CoreProgram; warnings: AnalysisWarning[] } // TODO: Also add parse warnings
  | { ok: false; stage: "parse"; errors: ParseError[]; warnings: ParseWarning[] } 
  | { ok: false; stage: "analyse"; result: AnalysisResult }; // TODO: Also add parse warnings. Besides, it is a weird split. Seperate parse errors and warnings, but one large analysis result.

export interface Environment {
  /** The wrapped language; its descriptor is reachable as `language.descriptor`. */
  readonly language: Language;

  /** Lex + parse source into a RawProgram (no analysis). */
  parse(source: string): ParseResult;
  /** Analyse a RawProgram into a CoreProgram (or diagnostics). */
  analyse(program: RawProgram): AnalysisResult;
  /** parse + analyse in one call; the result names which stage failed. */
  compile(source: string): CompileResult;

  /** One-shot evaluation of an analysed program from the given inputs. */
  run(program: CoreProgram, inputs: Record<string, unknown>): Map<string, unknown>;
  /** Stateful single-program runner (caching across runs). */
  createRunner(program: CoreProgram): ProgramRunner;
  /** Reactive multi-program runtime sharing this language's descriptor. */
  createRuntime(): Runtime;
}

export function createEnvironment(language: Language): Environment {
  const { descriptor } = language;
  return {
    language,

    parse: (source) => parseSource(source, language),
    analyse: (program) => analyse(program, descriptor),

    compile(source) {
      const parsed = parseSource(source, language);
      if (!parsed.ok) {
        return { ok: false, stage: "parse", errors: parsed.errors, warnings: parsed.warnings };
      }
      const result = analyse(parsed.program, descriptor);
      if (!result.ok) return { ok: false, stage: "analyse", result };
      return { ok: true, program: result.program, warnings: result.warnings };
    },

    run: (program, inputs) => run(program, descriptor, inputs),
    createRunner: (program) => createProgramRunner(program, descriptor),
    createRuntime: () => createRuntime(descriptor),
  };
}
