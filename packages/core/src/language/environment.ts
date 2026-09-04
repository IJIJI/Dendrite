import { analyse, validateDescriptor } from "./analyser/analyser";
import { type AnalysisError, type AnalysisResult, type AnalysisWarning } from "./analyser/types";
import { type CoreProgram, type RawProgram } from "./infra/program";
import { deserialise, migrate, type SavedProgram } from "./infra/serialise";
import { type Language, parseSource } from "./language";
import { type ParseError, type ParseResult, type ParseWarning } from "./parser/types";
import { createProgramRunner, run, type ProgramRunner } from "./runtime/runner";
import { createRuntime, type Runtime } from "./runtime/runtime";

//? Environment: a Language bound to its convenience operations, so callers don't thread
// `language` / `descriptor` through every call. The front door for embedding Dendrite.
// (A shared prelude of helper bindings will attach here later — see .docs/todo.md.)

// Warnings from any pipeline stage on one list. Parse warnings survive into the
// analyse step, so nothing is dropped between stages.
export type CompileWarning = ParseWarning | AnalysisWarning;

// Result of compile() = parse + analyse, tagged with the stage that failed. The analyse
// arm still carries the PARTIAL program (surviving outputs), editors want it.
export type CompileResult =
  | { ok: true; program: CoreProgram; warnings: CompileWarning[] }
  | { ok: false; stage: "parse"; errors: ParseError[]; warnings: CompileWarning[] }
  | {
      ok: false;
      stage: "analyse";
      errors: AnalysisError[];
      warnings: CompileWarning[];
      program: CoreProgram;
    };

// Problems with a stored blob ITSELF. Before parsing/analysing can start. Not
// ParseErrors (no source positions exist) and not AnalysisErrors (no program yet).
export interface LoadError {
  kind: "unsupported_form" | "unsupported_version" | "malformed_program";
  message: string;
}

export type LoadResult = CompileResult | { ok: false; stage: "load"; errors: LoadError[] };

export interface Environment {
  /** The wrapped language; its descriptor is reachable as `language.descriptor`. */
  readonly language: Language;

  /** Lex + parse source into a RawProgram (no analysis). */
  parse(source: string): ParseResult;
  /** Analyse a RawProgram into a CoreProgram (or diagnostics). */
  analyse(program: RawProgram): AnalysisResult;
  /** parse + analyse in one call; the result names which stage failed. */
  compile(source: string): CompileResult;
  /**
   * Load a SavedProgram: dispatch on its authoring form (code → parse + analyse,
   * ast → guard + analyse, rete → unsupported until the editor adapter exists) and
   * RE-ANALYSE against this environment's language, so descriptor drift surfaces here.
   */
  load(saved: SavedProgram): LoadResult;

  /** One-shot evaluation of an analysed program from the given inputs. */
  run(program: CoreProgram, inputs: Record<string, unknown>): Map<string, unknown>;
  /** Stateful single-program runner (caching across runs). */
  createRunner(program: CoreProgram): ProgramRunner;
  /** Reactive multi-program runtime sharing this language's descriptor. */
  createRuntime(): Runtime;
}

const loadFailure = (kind: LoadError["kind"], message: string): LoadResult => ({
  ok: false,
  stage: "load",
  errors: [{ kind, message }],
});

export function createEnvironment(language: Language): Environment {
  const { descriptor } = language;

  // Fail fast on a malformed language: a dangling type reference or an unsound struct
  // override is a setup bug, and every program built on it would be silently wrong.
  const typeErrors = validateDescriptor(descriptor);
  if (typeErrors.length > 0) {
    throw new Error(
      "Language descriptor validation failed:\n" +
        typeErrors.map((e) => `  - ${e.message}`).join("\n"),
    );
  }

  // The shared analyse tail of compile() and load(): run the analyser and shape the
  // stage-tagged result, carrying earlier-stage warnings into every arm.
  function analyseToResult(raw: RawProgram, parseWarnings: ParseWarning[]): CompileResult {
    const result = analyse(raw, descriptor);
    const warnings: CompileWarning[] = [...parseWarnings, ...result.warnings];
    if (!result.ok) {
      return {
        ok: false,
        stage: "analyse",
        errors: result.errors,
        warnings,
        program: result.program,
      };
    }
    return { ok: true, program: result.program, warnings };
  }

  function compile(source: string): CompileResult {
    const parsed = parseSource(source, language);
    if (!parsed.ok) {
      return { ok: false, stage: "parse", errors: parsed.errors, warnings: parsed.warnings };
    }
    return analyseToResult(parsed.program, parsed.warnings);
  }

  return {
    language,

    parse: (source) => parseSource(source, language),
    analyse: (program) => analyse(program, descriptor),
    compile,

    load(saved) {
      let migrated: SavedProgram;
      try {
        migrated = migrate(saved);
      } catch (e) {
        return loadFailure("unsupported_version", e instanceof Error ? e.message : String(e));
      }

      switch (migrated.form) {
        case "code":
          return compile(migrated.source);
        case "ast": {
          let raw: RawProgram;
          try {
            raw = deserialise(migrated);
          } catch (e) {
            return loadFailure("malformed_program", e instanceof Error ? e.message : String(e));
          }
          return analyseToResult(raw, []);
        }
        case "rete":
          return loadFailure(
            "unsupported_form",
            "SavedProgram form 'rete' requires the editor adapter - not yet implemented",
          );
      }
    },

    run: (program, inputs) => run(program, descriptor, inputs),
    createRunner: (program) => createProgramRunner(program, descriptor),
    createRuntime: () => createRuntime(descriptor),
  };
}
