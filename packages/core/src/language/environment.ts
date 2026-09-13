import { analyse, validateDescriptor } from "./analyser/analyser";
import { type AnalysisError, type AnalysisResult, type AnalysisWarning } from "./analyser/types";
import { composeLayers, type PortProblem, type Provenance } from "./compose";
import { type PortLayer } from "./infra/ports";
import { type CoreProgram, type RawProgram } from "./infra/program";
import { type LanguageDescriptor, type Vocabulary } from "./infra/registry";
import { assertSavedPorts, deserialise, migrate, type SavedProgram } from "./infra/serialise";
import { type Language, parseSource } from "./language";
import { type ParseError, type ParseResult, type ParseWarning } from "./parser/types";
import { createInstance, type InstanceOptions, type ProgramInstance } from "./runtime/instance";
import { createProgramRunner, run, type ProgramRunner } from "./runtime/runner";
import { createRuntime, type Runtime, type RuntimeOptions } from "./runtime/runtime";

//? Environment: a Language bound to its convenience operations, so callers don't thread
// `language` / `descriptor` through every call. The front door for embedding Dendrite.
//
// Two levels, and only the second can analyse:
//   Environment        - the language alone: parse, and the factories for runtimes, program
//                        environments and instances. A language is vocabulary, so it has no
//                        ports to check a program against and deliberately offers no compile
//   ProgramEnvironment - the Pipeline, bound to the descriptor composed from port layers
// `env.forProgram(global, program)` builds the second from the first; it answers with
// compose problems instead of throwing, since layers come from hosts and documents.
// (A shared prelude of helper bindings will attach here later — see .docs/todo.md.)

// Warnings from any pipeline stage on one list. Parse warnings survive into the
// analyse step, so nothing is dropped between stages.
export type CompileWarning = ParseWarning | AnalysisWarning;

// Result of compile() = parse + analyse, tagged with the stage that failed. The analyse
// arm still carries the PARTIAL program (surviving outputs), editors want it.
//
// `ok` says ONE thing: a program came out that the runtime can register. It does NOT mean
// there were no errors. Analysis collects every error and keeps going, and it only reports
// ok:false when a REQUIRED output was lost - so a program whose bad binding was pruned, or
// whose failed output was optional, comes back ok:true with those errors on the list. Read
// `errors` on every arm, or a type error goes unreported (which it was, until 2026-09-12).
export type CompileResult =
  | { ok: true; program: CoreProgram; errors: AnalysisError[]; warnings: CompileWarning[] }
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

// The load arm carries an empty `warnings` for shape, not because a warning could exist:
// it fires before lexing, so there is nothing to warn about yet. Every arm having both
// lists is what lets a consumer read them without asking which arm it holds - the branch
// that used to be there is how errors went unreported.
export type LoadResult =
  | CompileResult
  | { ok: false; stage: "load"; errors: LoadError[]; warnings: CompileWarning[] };

/** The descriptor-bound operations a composed program environment offers. */
export interface Pipeline {
  /** Lex + parse source into a RawProgram (no analysis). */
  parse(source: string): ParseResult;
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

export interface Environment extends ProgramEnvironmentFactory {
  /** The wrapped language; its vocabulary is reachable as `language.descriptor`. */
  readonly language: Language;
  /** Lex + parse source into a RawProgram. Needs no ports: `$x` parses whatever x is. */
  parse(source: string): ParseResult;
  /** Reactive multi-program runtime over this language and the given global port layers. */
  createRuntime(options?: RuntimeOptions): Runtime;
  /** One deployed program on that runtime, with its own layers, values and observables. */
  createInstance(runtime: Runtime, options: InstanceOptions): ProgramInstance;
}

const loadFailure = (kind: LoadError["kind"], e: unknown): LoadResult => ({
  ok: false,
  stage: "load",
  errors: [{ kind, message: e instanceof Error ? e.message : String(e) }],
  warnings: [],
});

// The one Pipeline implementation, bound to the composed descriptor of one program.
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
    // Errors travel on the ok arm too: analysis found them, the surviving outputs are
    // still sound, and whoever shows diagnostics needs both facts.
    return { ok: true, program: result.program, errors: result.errors, warnings };
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
    parse: (source) => parseSource(source, language),
    analyse: (program) => analyse(program, descriptor),
    compile,
    load,
    run: (program, inputs) => run(program, descriptor, inputs),
    createRunner: (program) => createProgramRunner(program, descriptor),
  };
}

export function createEnvironment(language: Language): Environment {
  const vocabulary: Vocabulary = language.descriptor;

  // Fail fast on a malformed language: a dangling type reference or an unsound struct
  // override is a setup bug, and every program built on it would be silently wrong.
  // Checked here rather than through composeLayers, which assumes the vocabulary beneath
  // it is sound and cannot attribute such an error to any layer.
  const errors = validateDescriptor({ ...vocabulary, inputs: new Map(), outputs: new Map() });
  if (errors.length > 0) {
    throw new Error(
      "Language validation failed:\n" + errors.map((e) => `  - ${e.message}`).join("\n"),
    );
  }

  function forProgram(
    global: readonly PortLayer[],
    program: readonly PortLayer[],
  ): ProgramEnvironmentResult {
    const composed = composeLayers(vocabulary, global, program);
    if (!composed.ok) return { ok: false, problems: composed.problems };
    return {
      ok: true,
      environment: {
        descriptor: composed.descriptor,
        provenance: composed.provenance,
        ...pipelineFor(language, composed.descriptor),
      },
    };
  }
  // An instance depends on the factory, not on this whole environment (ISP + DIP).
  const factory: ProgramEnvironmentFactory = { forProgram };

  return {
    language,
    parse: (source) => parseSource(source, language),
    forProgram,
    createRuntime: (options) => createRuntime(vocabulary, options),
    createInstance: (runtime, options) => createInstance(factory, runtime, options),
  };
}
