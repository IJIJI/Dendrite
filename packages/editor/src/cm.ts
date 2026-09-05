import { type Diagnostic as LintDiagnostic } from "@codemirror/lint";
import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { type Language } from "@dendrite-lang/core";

import { type Diagnostic } from "./session";
import { lineStartOffsets, styledRanges, toOffset } from "./tokens";

//? CodeMirror glue: map tokens.ts ranges onto decorations, session diagnostics onto
// @codemirror/lint squiggles, and the brand onto the editor's chrome. With editor.ts, the
// only module that knows about CodeMirror.

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

// The editor's chrome in the brand's variables. CodeMirror injects its base theme un-layered,
// so style.css (in @layer dendrite) cannot override it; EditorView.theme is the supported
// override point, and every value stays a CSS variable so light/dark and host themes apply.
// Translucent on purpose: it tints the gutter and the selection layer instead of covering them.
const ACTIVE_LINE = "color-mix(in oklab, var(--dendrite-text) 6%, transparent)";
const ACCENT_TINT = "color-mix(in oklab, var(--dendrite-accent) 15%, transparent)";
const GUTTER = "color-mix(in oklab, var(--dendrite-bg), var(--dendrite-panel) 60%)"; // a shade off the canvas

export const dendriteTheme = EditorView.theme({
  "&": { color: "var(--dendrite-text)", backgroundColor: "var(--dendrite-bg)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--dendrite-mono)", fontSize: "14px", lineHeight: "1.65" },
  ".cm-content": { padding: "12px 0" }, // caret: drawSelection paints .cm-cursor instead
  ".cm-line": { padding: "0 16px" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--dendrite-text)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    { backgroundColor: "var(--dendrite-accent-soft)" },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: ACTIVE_LINE },
  ".cm-gutters": {
    backgroundColor: GUTTER,
    color: "var(--dendrite-muted)",
    borderRight: "none",
  },
  ".cm-activeLineGutter": { color: "var(--dendrite-text)" },
  ".cm-lineNumbers .cm-gutterElement": { paddingLeft: "16px" },
  "&.cm-focused .cm-matchingBracket": { backgroundColor: "var(--dendrite-accent-soft)" },
  "&.cm-focused .cm-nonmatchingBracket": { backgroundColor: "var(--dendrite-error-soft)" },
  ".cm-selectionMatch": { backgroundColor: ACCENT_TINT },
  ".cm-searchMatch": {
    backgroundColor: "var(--dendrite-warning-soft)",
    outline: "1px solid var(--dendrite-warning)",
  },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "var(--dendrite-accent-soft)" },
  ".cm-foldPlaceholder": {
    backgroundColor: "var(--dendrite-well)",
    border: "none",
    color: "var(--dendrite-muted)",
  },
  ".cm-specialChar": { color: "var(--dendrite-error)" },
  ".cm-placeholder": { color: "var(--dendrite-faint)" },

  // Panels (search) and tooltips: a raised surface with a 1px border, no shadow, brand controls
  ".cm-panels": {
    backgroundColor: "var(--dendrite-panel)",
    color: "var(--dendrite-text)",
    fontFamily: "var(--dendrite-font)",
    fontSize: "13px",
  },
  ".cm-panels-top": { borderBottom: "1px solid var(--dendrite-border)" },
  ".cm-panels-bottom": { borderTop: "1px solid var(--dendrite-border)" },
  ".cm-button": {
    backgroundImage: "none",
    backgroundColor: "transparent",
    border: "2px solid var(--dendrite-text)",
    borderRadius: "var(--dendrite-radius-control)",
    color: "var(--dendrite-text)",
    font: "600 13px var(--dendrite-font)",
    padding: "4px 10px",
  },
  ".cm-button:active": { backgroundImage: "none", backgroundColor: "var(--dendrite-accent-soft)" },
  ".cm-textfield": {
    backgroundColor: "var(--dendrite-bg)",
    border: "1px solid var(--dendrite-border)",
    borderRadius: "var(--dendrite-radius-control)",
    color: "var(--dendrite-text)",
    fontFamily: "var(--dendrite-mono)",
    fontSize: "13px",
    padding: "5px 8px",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--dendrite-bg)",
    color: "var(--dendrite-text)",
    border: "1px solid var(--dendrite-border)",
    borderRadius: "var(--dendrite-radius)",
    fontFamily: "var(--dendrite-font)",
    fontSize: "13px",
  },
  ".cm-tooltip .cm-tooltip-arrow:before": {
    borderTopColor: "var(--dendrite-border)",
    borderBottomColor: "var(--dendrite-border)",
  },
  ".cm-tooltip .cm-tooltip-arrow:after": {
    borderTopColor: "var(--dendrite-bg)",
    borderBottomColor: "var(--dendrite-bg)",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "var(--dendrite-accent-soft)",
    color: "var(--dendrite-text)",
  },

  // Lint: wavy underlines, the brand's error view in the tooltip, status dots in the gutter
  ".cm-lintRange-error": {
    backgroundImage: "none",
    textDecoration: "underline wavy var(--dendrite-error)",
    textDecorationSkipInk: "none",
  },
  ".cm-lintRange-warning": {
    backgroundImage: "none",
    textDecoration: "underline wavy var(--dendrite-warning)",
    textDecorationSkipInk: "none",
  },
  ".cm-lintRange-active": { backgroundColor: ACCENT_TINT },
  ".cm-diagnostic": { padding: "6px 10px" },
  ".cm-diagnostic-error": {
    borderLeft: "2px solid var(--dendrite-error)",
    backgroundColor: "var(--dendrite-error-soft)",
  },
  ".cm-diagnostic-warning": {
    borderLeft: "2px solid var(--dendrite-warning)",
    backgroundColor: "var(--dendrite-warning-soft)",
  },
  // The gutter cell centres its dot (the base theme pads a 1em SVG marker instead)
  ".cm-gutter-lint .cm-gutterElement": {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0",
  },
  ".cm-lint-marker-error, .cm-lint-marker-warning": {
    content: "none", // drops the base theme's inline SVG so the dot below shows
    width: "8px",
    height: "8px",
    borderRadius: "999px",
  },
  ".cm-lint-marker-error": { backgroundColor: "var(--dendrite-error)" },
  ".cm-lint-marker-warning": { backgroundColor: "var(--dendrite-warning)" },
  ".cm-lintPoint-error:after": { borderBottomColor: "var(--dendrite-error)" },
  ".cm-lintPoint-warning:after": { borderBottomColor: "var(--dendrite-warning)" },
});
