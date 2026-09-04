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
// URL sync - subscribe without the session knowing they exist.

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

export class EditorSession {
  private readonly env: Environment;
  private runner: ProgramRunner | null = null;

  private readonly diagnostics$ = createSubject<Diagnostic[]>([]);
  private readonly outputs$ = createSubject<RunResult>({ outputs: null, error: null });
  private readonly inputs$ = createSubject<InputValues>({});

  /** Parse + analysis diagnostics of the last compile. */
  readonly diagnostics: Observable<Diagnostic[]> = this.diagnostics$;
  /** Result of the last evaluation. */
  readonly outputs: Observable<RunResult> = this.outputs$;
  /** Current input values - the single source of truth, seeded from the descriptor. */
  readonly inputs: Observable<InputValues> = this.inputs$;

  constructor(readonly language: Language) {
    this.env = createEnvironment(language);
    // Same derivation the widgets use (initialValueFor), so the UI and the evaluator
    // can never disagree about an input's starting value.
    const seeded: Record<string, unknown> = {};
    for (const [name, def] of language.descriptor.inputs) {
      seeded[name] = initialValueFor(def, language.descriptor);
    }
    this.inputs$.set(seeded);
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
