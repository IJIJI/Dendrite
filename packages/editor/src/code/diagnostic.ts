import { type ProgramDiagnostic } from "@dendrite-lang/core";

//? positionOf: the one adapter from a core diagnostic to a place in the text. Core reports
// where a problem is as a SourceRef, which is form-agnostic (a rete-authored program has a
// node id, not a line). Everything in the editor that points at text - the lint gutter, the
// diagnostics pane's click-through - goes through here, so there is one place that knows
// code-form refs are the only ones with a line and column.

export interface Position {
  line: number;
  column: number;
  length: number;
}

export function positionOf(diagnostic: ProgramDiagnostic): Position | undefined {
  const source = diagnostic.source;
  if (source?.kind !== "code") return undefined;
  return { line: source.line, column: source.column, length: source.length };
}

/**
 * Errors before warnings, stable within each severity. The instance emits in pipeline
 * order, which would otherwise list parse warnings above analysis errors.
 */
export function sortDiagnostics(diagnostics: readonly ProgramDiagnostic[]): ProgramDiagnostic[] {
  return [...diagnostics].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1,
  );
}

export interface DiagnosticsSummary {
  /** "No problems", "1 error", "2 errors · 1 warning". */
  text: string;
  /** The worst severity present, for the line's tag. */
  severity?: "error" | "warning";
}

const count = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? "" : "s"}`;

/** One line for a collapsed pane. */
export function summarise(diagnostics: readonly ProgramDiagnostic[]): DiagnosticsSummary {
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const warnings = diagnostics.length - errors;
  if (errors === 0 && warnings === 0) return { text: "No problems" };
  const parts = [errors > 0 && count(errors, "error"), warnings > 0 && count(warnings, "warning")];
  return {
    text: parts.filter((p): p is string => typeof p === "string").join(" · "),
    severity: errors > 0 ? "error" : "warning",
  };
}
