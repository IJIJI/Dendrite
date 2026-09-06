import {
  createEnvironment,
  type Environment,
  EvalError,
  type Language,
  type ProgramRunner,
  type SourceRef,
} from "@dendrite-lang/core";

import { initialValueFor } from "./input-widgets";
import { createSubject, type Observable } from "./observable";

//? EditorSession: framework-free compile/run loop for one Language.
// Owns the Environment, the current runner, and the live input values, and PUBLISHES its
// state through three observables (diagnostics, outputs, inputs). Hosts decide WHEN to
// compile (debounce) and how to render; any number of consumers - panes, lint squiggles,
// URL sync - subscribe without the session knowing they exist. The language can be swapped
// in place (setLanguage, a surface edit) so those subscribers never have to re-attach.

// Editor-agnostic diagnostic: parse + analysis errors/warnings on one shape.
// line/column are 1-based (absent for diagnostics without a code source).
export interface Diagnostic {
  severity: "error" | "warning";
  kind: string;
  message: string;
  line?: number;
  column?: number;
  length?: number;
}

// One evaluation, one result: either fresh outputs, or why there are none.
// outputs null + error null = no runnable program (compile failed).
export interface RunResult {
  outputs: ReadonlyMap<string, unknown> | null;
  error: string | null; // runtime (eval) failure message
}

export type InputValues = Readonly<Record<string, unknown>>;

const at = (source?: SourceRef) =>
  source?.kind === "code"
    ? { line: source.line, column: source.column, length: source.length }
    : {};

// One seeding rule for boot and language swaps: keep a value the language still declares,
// seed the rest the same way the widgets derive their starting value (initialValueFor), so
// the UI and the evaluator can never disagree.
function seedInputs(language: Language, previous: InputValues): InputValues {
  const seeded: Record<string, unknown> = {};
  for (const [name, def] of language.descriptor.inputs) {
    seeded[name] = name in previous ? previous[name] : initialValueFor(def, language.descriptor);
  }
  return seeded;
}

export class EditorSession {
  private env: Environment;
  private runner: ProgramRunner | null = null;
  private current: Language;

  private readonly diagnostics$ = createSubject<Diagnostic[]>([]);
  private readonly outputs$ = createSubject<RunResult>({ outputs: null, error: null });
  private readonly inputs$ = createSubject<InputValues>({});

  /** Parse + analysis diagnostics of the last compile. */
  readonly diagnostics: Observable<Diagnostic[]> = this.diagnostics$;
  /** Result of the last evaluation. */
  readonly outputs: Observable<RunResult> = this.outputs$;
  /** Current input values - the single source of truth, seeded from the descriptor. */
  readonly inputs: Observable<InputValues> = this.inputs$;

  constructor(language: Language) {
    this.current = language;
    this.env = createEnvironment(language);
    this.inputs$.set(seedInputs(language, {}));
  }

  /** The language this session compiles against (see setLanguage). */
  get language(): Language {
    return this.current;
  }

  /**
   * Swap the language in place - a surface edit: new inputs, outputs or types. The three
   * observables keep their identity, so subscribers stay attached; values of inputs that
   * still exist carry over, new ones seed from their defaults. A malformed language (a
   * dangling type reference) throws from createEnvironment before anything is swapped.
   * The caller recompiles the source next; until then there is no runner.
   */
  setLanguage(language: Language): void {
    const env = createEnvironment(language);
    this.current = language;
    this.env = env;
    this.runner = null;
    this.inputs$.set(seedInputs(language, this.inputs$.get()));
  }

  /** Parse + analyse `source`; on success start a fresh runner and evaluate. */
  compile(source: string): void {
    const diagnostics: Diagnostic[] = [];
    const push =
      (severity: Diagnostic["severity"]) =>
      (d: { kind: string; message: string; source?: SourceRef }) =>
        diagnostics.push({ severity, kind: d.kind, message: d.message, ...at(d.source) });

    // parse + analyse separately (not env.compile) so parse WARNINGS survive alongside
    // analysis diagnostics.
    const parsed = this.env.parse(source);
    parsed.warnings.forEach(push("warning"));
    if (!parsed.ok) {
      parsed.errors.forEach(push("error"));
      this.fail(diagnostics);
      return;
    }

    const analysed = this.env.analyse(parsed.program);
    analysed.errors.forEach(push("error"));
    analysed.warnings.forEach(push("warning"));
    if (!analysed.ok) {
      this.fail(diagnostics);
      return;
    }

    this.diagnostics$.set(diagnostics);
    this.runner = this.env.createRunner(analysed.program);
    this.run(this.inputs$.get());
  }

  /** Update one input value and (incrementally) re-evaluate. */
  setInput(name: string, value: unknown): void {
    this.inputs$.set({ ...this.inputs$.get(), [name]: value });
    if (this.runner) this.run({ [name]: value });
  }

  private run(changes: InputValues): void {
    if (!this.runner) return;
    try {
      this.outputs$.set({ outputs: this.runner.run(changes), error: null });
    } catch (e) {
      // NOTE: this must be the Dendrite EvalError import, not the JS global of the same
      // name - the import above is load-bearing for the instanceof check.
      this.outputs$.set({
        outputs: null,
        error: e instanceof EvalError ? `${e.kind}: ${e.message}` : String(e),
      });
    }
  }

  private fail(diagnostics: Diagnostic[]): void {
    this.runner = null;
    this.diagnostics$.set(diagnostics);
    this.outputs$.set({ outputs: null, error: null });
  }
}
