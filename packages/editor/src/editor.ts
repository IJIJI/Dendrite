import { redo, redoDepth, undo, undoDepth } from "@codemirror/commands";
import { lintGutter, setDiagnostics } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import {
  createLanguage,
  createStdlib,
  extendLanguage,
  type Language,
  serialiseSource,
} from "@dendrite-lang/core";
import { basicSetup } from "codemirror";

import { dendriteHighlighting, toLintDiagnostics } from "./cm";
import { DOCUMENT_VERSION, type EditorDocument } from "./document";
import { createSubject, type Observable } from "./observable";
import { EditorSession } from "./session";
import { applySurface } from "./surface";
import { lineStartOffsets, toOffset } from "./tokens";

//? createEditor: the host entry point (Facade). Mounts a code editor for one document into
// an element and owns its lifecycle - the language (the host's or the stdlib, plus the
// document's surface), the session, the CodeMirror view, debounced compile, lint squiggles,
// undo/redo, and change notification. Panes are the host's: it renders them from the
// session's observables. No storage, no routing, no presets - those are host policy.

const DEBOUNCE_MS = 300;

export interface EditorConfig {
  document: EditorDocument;
  /** The language the document runs against; its surface is applied to a COPY. Default: the stdlib. */
  language?: Language;
  /** The current document, debounced, after every source edit or input change. */
  onChange?(doc: EditorDocument): void;
}

/** How many source edits can be undone / redone (CodeMirror's history; text only). */
export interface HistoryDepth {
  undo: number;
  redo: number;
}

export interface EditorHandle {
  /** Compile/run state as observables (diagnostics, outputs, inputs) - render panes from these. */
  readonly session: EditorSession;
  /** Undo/redo depths of the SOURCE history (input-value edits are not part of it). */
  readonly history: Observable<HistoryDepth>;
  /** The document as it is right now: source, surface, input values. */
  getDocument(): EditorDocument;
  /** Move the cursor to a 1-based line/column (diagnostics click-through). */
  jumpTo(line: number, column: number): void;
  undo(): void;
  redo(): void;
  dispose(): void;
}

export function createEditor(parent: HTMLElement, config: EditorConfig): EditorHandle {
  const { document: doc } = config;
  // The editor edits TEXT - only code-form programs are editable here. (rete-form documents
  // arrive with the editor era; ast-form ones have no text to edit.)
  if (doc.program.form !== "code") {
    throw new Error(`The editor cannot edit '${doc.program.form}'-form programs yet`);
  }
  const initialSource = doc.program.source;

  // A copy, so the document's surface never leaks into a host's language (a second mount
  // with the same language would otherwise double-register it).
  const language = extendLanguage(createLanguage(), config.language ?? createStdlib());
  applySurface(language, doc.surface);

  const session = new EditorSession(language);
  for (const [name, value] of Object.entries(doc.inputValues)) session.setInput(name, value);

  let compileTimer: ReturnType<typeof setTimeout> | undefined;
  let changeTimer: ReturnType<typeof setTimeout> | undefined;

  const currentSource = (): string => view.state.doc.toString();
  const getDocument = (): EditorDocument => ({
    version: DOCUMENT_VERSION,
    program: serialiseSource(currentSource()),
    surface: doc.surface,
    inputValues: session.inputs.get(),
  });

  const scheduleChange = (): void => {
    if (!config.onChange) return;
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => config.onChange?.(getDocument()), DEBOUNCE_MS);
  };

  // Debounced compile on every source edit; the change notification rides on it.
  const compileOnEdit = EditorView.updateListener.of((update) => {
    if (!update.docChanged) return;
    clearTimeout(compileTimer);
    compileTimer = setTimeout(() => {
      session.compile(update.state.doc.toString());
      scheduleChange();
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
      lintGutter(),
      dendriteHighlighting(language),
      compileOnEdit,
      trackHistory,
    ],
  });

  const subscriptions = [
    session.diagnostics.subscribe((diagnostics) =>
      view.dispatch(setDiagnostics(view.state, toLintDiagnostics(currentSource(), diagnostics))),
    ),
    // Input changes (from whatever pane the host renders) are document changes too.
    session.inputs.subscribe(scheduleChange),
  ];

  session.compile(initialSource);

  return {
    session,
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
      view.destroy();
    },
  };
}
