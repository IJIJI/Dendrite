import { indentWithTab, redo, redoDepth, undo, undoDepth } from "@codemirror/commands";
import { lintGutter, setDiagnostics } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { type ProgramInstance, serialiseSource } from "@dendrite-lang/core";
import { basicSetup } from "codemirror";

import { dendriteHighlighting, dendriteTheme, toLintDiagnostics } from "./cm";
import { type Connection } from "./connection";
import { DOCUMENT_VERSION, type EditorDocument } from "./document";
import { createSubject, type Observable } from "./observable";

import { lineStartOffsets, toOffset } from "./tokens";

//? createEditor: the host entry point (Facade). Mounts a code editor over a Connection - the
// ProgramInstance it edits and the Language it highlights with, obtained however the host
// chose (connection.ts) - and owns its own lifecycle: the CodeMirror view, debounced
// compile, lint squiggles, undo/redo, and change notification. Panes are the host's: it
// renders them from the instance's observables. No storage, no routing, no presets - those
// are host policy - and no stack of its own: that is the connection's.

const DEBOUNCE_MS = 300;

// What the default keymap needs to know about Dendrite to toggle comments (Mod-/).
const languageData = EditorState.languageData.of(() => [
  { commentTokens: { line: "//", block: { open: "/*", close: "*/" } } },
]);

export interface EditorConfig {
  /** What to edit and how it was obtained: ownStack / joinRuntime / attach (connection.ts). */
  connection: Connection;
  /** The current document, debounced, after every source edit or input change. */
  onChange?(doc: EditorDocument): void;
}

/** How many source edits can be undone / redone (CodeMirror's history; text only). */
export interface HistoryDepth {
  undo: number;
  redo: number;
}

export interface EditorHandle {
  /** The running program: diagnostics, ports, outputs, values, snapshot. Render panes from it. */
  readonly instance: ProgramInstance;
  /** Undo/redo depths of the SOURCE history (input-value edits are not part of it). */
  readonly history: Observable<HistoryDepth>;
  /** The document as it is right now: program, its ports, and the input values. */
  getDocument(): EditorDocument;
  /** Move the cursor to a 1-based line/column (diagnostics click-through). */
  jumpTo(line: number, column: number): void;
  undo(): void;
  redo(): void;
  dispose(): void;
}

export function createEditor(parent: HTMLElement, config: EditorConfig): EditorHandle {
  const { instance, language } = config.connection;
  // The editor edits TEXT - only code-form programs are editable here. (rete-form documents
  // arrive with the editor era; ast-form ones have no text to edit.) Read from the instance,
  // so an attached program is held to the same rule as a document.
  const { program } = instance.snapshot.get();
  if (program.form !== "code") {
    throw new Error(`The editor cannot edit '${program.form}'-form programs yet`);
  }
  const initialSource = program.source;

  let compileTimer: ReturnType<typeof setTimeout> | undefined;
  let changeTimer: ReturnType<typeof setTimeout> | undefined;

  const currentSource = (): string => view.state.doc.toString();
  const getDocument = (): EditorDocument => ({
    version: DOCUMENT_VERSION,
    ...instance.snapshot.get(),
  });

  const scheduleChange = (): void => {
    if (!config.onChange) return;
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => config.onChange?.(getDocument()), DEBOUNCE_MS);
  };

  // Debounced recompile on every source edit. Editing text never touches the ports, so the
  // saved program goes back without them and the document layer keeps what it has.
  const compileOnEdit = EditorView.updateListener.of((update) => {
    if (!update.docChanged) return;
    clearTimeout(compileTimer);
    compileTimer = setTimeout(() => {
      instance.setProgram(serialiseSource(update.state.doc.toString()));
    }, DEBOUNCE_MS);
  });

  // Undo/redo depths, published only when they actually change (not on every selection move).
  const history$ = createSubject<HistoryDepth>({ undo: 0, redo: 0 });
  const trackHistory = EditorView.updateListener.of((update) => {
    const next = { undo: undoDepth(update.state), redo: redoDepth(update.state) };
    const current = history$.get();
    if (next.undo !== current.undo || next.redo !== current.redo) history$.set(next);
  });

  const view = new EditorView({
    doc: initialSource,
    parent,
    extensions: [
      basicSetup,
      // Tab / Shift-Tab indent and dedent (Escape then Tab leaves the editor, per CodeMirror);
      // Ctrl-Shift-Z redoes everywhere (the default keymap binds it on macOS only).
      keymap.of([indentWithTab, { key: "Mod-Shift-z", run: redo }]),
      languageData,
      dendriteTheme,
      lintGutter(),
      dendriteHighlighting(language),
      compileOnEdit,
      trackHistory,
    ],
  });

  const subscriptions = [
    instance.diagnostics.subscribe((diagnostics) =>
      view.dispatch(setDiagnostics(view.state, toLintDiagnostics(currentSource(), diagnostics))),
    ),
    // Everything a save would capture - the source, the ports, the input values - arrives
    // here, and nowhere else: a host pushing its own values leaves the snapshot silent.
    instance.snapshot.subscribe(scheduleChange),
  ];

  return {
    instance,
    history: history$,
    getDocument,
    jumpTo(line, column) {
      const source = currentSource();
      const offset = Math.min(toOffset(lineStartOffsets(source), line, column), source.length);
      view.dispatch({ selection: { anchor: offset }, scrollIntoView: true });
      view.focus();
    },
    // Toolbar buttons steal focus; hand it back so the user keeps typing.
    undo() {
      undo(view);
      view.focus();
    },
    redo() {
      redo(view);
      view.focus();
    },
    dispose() {
      clearTimeout(compileTimer);
      clearTimeout(changeTimer);
      for (const unsubscribe of subscriptions) unsubscribe();
      // What the connection made, it unmakes; what it was handed keeps running.
      config.connection.release?.();
      view.destroy();
    },
  };
}
