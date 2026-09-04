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
import { EditorSession } from "./session";
import { applySurface } from "./surface";
import { lineStartOffsets, toOffset } from "./tokens";

//? createEditor: the host entry point (Facade). Mounts a code editor for one document into
// an element and owns its lifecycle - the language (the host's or the stdlib, plus the
// document's surface), the session, the CodeMirror view, debounced compile, lint squiggles,
// and change notification. Panes are the host's: it renders them from the session's
// observables. No storage, no routing, no presets - those are host policy.

const DEBOUNCE_MS = 300;

export interface EditorConfig {
  document: EditorDocument;
  /** The language the document runs against; its surface is applied to a COPY. Default: the stdlib. */
  language?: Language;
  /** The current document, debounced, after every source edit or input change. */
  onChange?(doc: EditorDocument): void;
}

export interface EditorHandle {
  /** Compile/run state as observables (diagnostics, outputs, inputs) - render panes from these. */
  readonly session: EditorSession;
  /** The document as it is right now: source, surface, input values. */
  getDocument(): EditorDocument;
  /** Move the cursor to a 1-based line/column (diagnostics click-through). */
  jumpTo(line: number, column: number): void;
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

  const view = new EditorView({
    doc: initialSource,
    parent,
    extensions: [basicSetup, lintGutter(), dendriteHighlighting(language), compileOnEdit],
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
    getDocument,
    jumpTo(line, column) {
      const source = currentSource();
      const offset = Math.min(toOffset(lineStartOffsets(source), line, column), source.length);
      view.dispatch({ selection: { anchor: offset }, scrollIntoView: true });
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
