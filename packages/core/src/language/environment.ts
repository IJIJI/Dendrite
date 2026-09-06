import { analyse, validateDescriptor } from "./analyser/analyser";
import { type AnalysisError, type AnalysisResult, type AnalysisWarning } from "./analyser/types";
import { composeLayers, type PortProblem, type Provenance } from "./compose";
import { type PortLayer } from "./infra/ports";
import { type CoreProgram, type RawProgram } from "./infra/program";
import { type LanguageDescriptor } from "./infra/registry";
import { assertSavedPorts, deserialise, migrate, type SavedProgram } from "./infra/serialise";
import { type Language, parseSource } from "./language";
import { type ParseError, type ParseResult, type ParseWarning } from "./parser/types";
import { createProgramRunner, run, type ProgramRunner } from "./runtime/runner";
import { createRuntime, type Runtime } from "./runtime/runtime";

//? Environment: a Language bound to its convenience operations, so callers don't thread
// `language` / `descriptor` through every call. The front door for embedding Dendrite.
//
// Two levels share one Pipeline:
//   Environment        - the language alone: parse, the pipeline on the language's own
//                        descriptor, and the factories for runtimes and program environments
//   ProgramEnvironment - the same pipeline bound to a descriptor composed from port layers,
//                        which is what a program with inputs and outputs is analysed against
// `env.forProgram(global, program)` builds the second from the first; it answers with
// compose problems instead of throwing, since layers come from hosts and documents.
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

/** The descriptor-bound operations both environment levels offer. */
export interface Pipeline {
  /** Analyse a RawProgram into a CoreProgram (or diagnostics). */
  analyse(program: RawProgram): AnalysisResult;
  /** parse + analyse in one call; the result names which stage failed. */
  compile(source: string): CompileResult;
  /**
   * Load a SavedProgram: dispatch on its authoring form (code → parse + analyse,
   * ast → guard + analyse, rete → unsupported until the editor adapter exists) and
   * RE-ANALYSE against this environment's descriptor, so descriptor drift surfaces here.
   */
  load(saved: SavedProgram): LoadResult;
  /** One-shot evaluation of an analysed program from the given inputs. */
  run(program: CoreProgram, inputs: Record<string, unknown>): Map<string, unknown>;
  /** Stateful single-program runner (caching across runs). */
  createRunner(program: CoreProgram): ProgramRunner;
}

/** The pipeline bound to a descriptor composed from port layers. */
export interface ProgramEnvironment extends Pipeline {
  readonly descriptor: LanguageDescriptor;
  /** Which layer declared each type, input and output. */
  readonly provenance: Provenance;
}

export type ProgramEnvironmentResult =
  | { ok: true; environment: ProgramEnvironment }
  | { ok: false; problems: PortProblem[] };

/** All a program instance needs from its environment. */
export interface ProgramEnvironmentFactory {
  /** Compose `global` then `program` layers onto the language, or report why that fails. */
  forProgram(global: readonly PortLayer[], program: readonly PortLayer[]): ProgramEnvironmentResult;
}

export interface Environment extends Pipeline, ProgramEnvironmentFactory {
  /** The wrapped language; its descriptor is reachable as `language.descriptor`. */
  readonly language: Language;
  /** Lex + parse source into a RawProgram (no analysis). */
  parse(source: string): ParseResult;
  /** Reactive multi-program runtime sharing this language's descriptor. */
  createRuntime(): Runtime;
}

const loadFailure = (kind: LoadError["kind"], e: unknown): LoadResult => ({
  ok: false,
  stage: "load",
  errors: [{ kind, message: e instanceof Error ? e.message : String(e) }],
});

// The one Pipeline implementation, bound to whichever descriptor a level analyses against.
function pipelineFor(language: Language, descriptor: LanguageDescriptor): Pipeline {
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

  function load(saved: SavedProgram): LoadResult {
    let migrated: SavedProgram;
    try {
      migrated = migrate(saved);
    } catch (e) {
      return loadFailure("unsupported_version", e);
    }
    try {
      assertSavedPorts(migrated);
    } catch (e) {
      return loadFailure("malformed_program", e);
    }

    switch (migrated.form) {
      case "code":
        return compile(migrated.source);
      case "ast": {
        let raw: RawProgram;
        try {
          raw = deserialise(migrated);
        } catch (e) {
          return loadFailure("malformed_program", e);
        }
        return analyseToResult(raw, []);
      }
      case "rete":
        return loadFailure(
          "unsupported_form",
          "SavedProgram form 'rete' requires the editor adapter - not yet implemented",
        );
    }
  }

  return {
    analyse: (program) => analyse(program, descriptor),
    compile,
    load,
    run: (program, inputs) => run(program, descriptor, inputs),
    createRunner: (program) => createProgramRunner(program, descriptor),
  };
}

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

  return {
    language,
    parse: (source) => parseSource(source, language),
    ...pipelineFor(language, descriptor),

    forProgram(global, program) {
      const composed = composeLayers(descriptor, global, program);
      if (!composed.ok) return { ok: false, problems: composed.problems };
      return {
        ok: true,
        environment: {
          descriptor: composed.descriptor,
          provenance: composed.provenance,
          ...pipelineFor(language, composed.descriptor),
        },
      };
    },

    createRuntime: () => createRuntime(descriptor),
  };
}
