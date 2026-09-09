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
