import { type Diagnostic as LintDiagnostic } from "@codemirror/lint";
import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { type Language } from "@dendrite-lang/core";

import { type Diagnostic } from "./session";
import { lineStartOffsets, styledRanges, toOffset } from "./tokens";

//? CodeMirror glue: map tokens.ts ranges onto decorations, and session diagnostics onto
// @codemirror/lint squiggles. The only module that knows about CodeMirror.

// Syntax highlighting as a ViewPlugin: re-tokenise the full document on change (documents
// are playground-sized; simplicity over incrementality) and mark each token with a
// `tok-<class>` CSS class (colors live in style.css).
export function dendriteHighlighting(language: Language) {
  const build = (view: EditorView): DecorationSet => {
    const builder = new RangeSetBuilder<Decoration>();
    for (const range of styledRanges(view.state.doc.toString(), language)) {
      builder.add(range.from, range.to, Decoration.mark({ class: `tok-${range.cls}` }));
    }
    return builder.finish();
  };

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = build(view);
      }
      update(update: ViewUpdate) {
        if (update.docChanged) this.decorations = build(update.view);
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}

// Session diagnostics → lint diagnostics (only those with a code location can squiggle).
export function toLintDiagnostics(source: string, diagnostics: Diagnostic[]): LintDiagnostic[] {
  const starts = lineStartOffsets(source);
  const max = source.length;
  return diagnostics
    .filter((d) => d.line !== undefined)
    .map((d) => {
      const from = Math.min(toOffset(starts, d.line!, d.column ?? 1), max);
      const to = Math.min(from + Math.max(d.length ?? 1, 1), max);
      return { from, to, severity: d.severity, message: `${d.kind}: ${d.message}` };
    });
}
