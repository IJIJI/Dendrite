import {
  createEnvironment,
  type Environment,
  EvalError,
  type Language,
  type ProgramRunner,
  type SourceRef,
} from "@dendrite-lang/core";

import { initialValueFor } from "./input-widgets";

//? PlaygroundSession: framework-free compile/run loop for one Language.
// Owns the Environment, the current runner, and the live input values. The shell decides
// WHEN to compile (debounce) and how to render; this module only reports through plain
// callbacks. This is the piece that graduates into the editor package later.

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

export interface SessionCallbacks {
  onDiagnostics(diagnostics: Diagnostic[]): void;
  onRun(result: RunResult): void;
}

const at = (source?: SourceRef) =>
  source?.kind === "code"
    ? { line: source.line, column: source.column, length: source.length }
    : {};

export class PlaygroundSession {
  private readonly env: Environment;
  private runner: ProgramRunner | null = null;
  private readonly values = new Map<string, unknown>();

  constructor(
    readonly language: Language,
    private readonly callbacks: SessionCallbacks,
  ) {
    this.env = createEnvironment(language);
    // Same derivation the widgets use (initialValueFor), so the UI and the evaluator
    // can never disagree about an input's starting value.
    for (const [name, def] of language.descriptor.inputs) {
      this.values.set(name, initialValueFor(def, language.descriptor));
    }
  }

  getValue(name: string): unknown {
    return this.values.get(name);
  }

  /** Snapshot of all current input values (for document/URL sync). */
  getValues(): Record<string, unknown> {
    return Object.fromEntries(this.values);
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

    this.callbacks.onDiagnostics(diagnostics);
    this.runner = this.env.createRunner(analysed.program);
    this.run(Object.fromEntries(this.values));
  }

  /** Update one input value and (incrementally) re-evaluate. */
  setInput(name: string, value: unknown): void {
    this.values.set(name, value);
    if (this.runner) this.run({ [name]: value });
  }

  private run(changes: Record<string, unknown>): void {
    if (!this.runner) return;
    try {
      this.callbacks.onRun({ outputs: this.runner.run(changes), error: null });
    } catch (e) {
      // NOTE: this must be the Dendrite EvalError import, not the JS global of the same
      // name - the import above is load-bearing for the instanceof check.
      this.callbacks.onRun({
        outputs: null,
        error: e instanceof EvalError ? `${e.kind}: ${e.message}` : String(e),
      });
    }
  }

  private fail(diagnostics: Diagnostic[]): void {
    this.runner = null;
    this.callbacks.onDiagnostics(diagnostics);
    this.callbacks.onRun({ outputs: null, error: null });
  }
}
