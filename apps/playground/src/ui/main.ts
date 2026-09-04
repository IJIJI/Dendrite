import { lintGutter, setDiagnostics } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { createStdlib, serialiseSource } from "@dendrite-lang/core";
import {
  applySurface,
  cloneDocument,
  decodePayload,
  dendriteHighlighting,
  DOCUMENT_VERSION,
  EditorSession,
  encodeDocument,
  lineStartOffsets,
  migrateDocument,
  type EditorDocument,
  toLintDiagnostics,
  toOffset,
  widgetsFor,
} from "@dendrite-lang/editor";
import { basicSetup } from "codemirror";

import { examples } from "../examples";
import { renderDiagnostics, renderInputs, renderOutputs } from "./panes";
import "../style.css";

const $ = (id: string): HTMLElement => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node;
};

const editorPane = $("editor-pane");
const inputsPane = $("inputs");
const outputsPane = $("outputs");
const diagnosticsPane = $("diagnostics");
const exampleSelect = $("example-select") as HTMLSelectElement;
const shareButton = $("share-button") as HTMLButtonElement;

// The URL is the source of truth; localStorage is a single-slot fallback for hash-less visits.
const FALLBACK_KEY = "dendrite-playground:document";
const DEBOUNCE_MS = 300;

interface BootHandle {
  dispose(): void;
  /** Write the current document to the URL + fallback slot right now (used by Share). */
  syncNow(): Promise<void>;
}

// Boot the playground for one document: language from its surface, session, editor.
// Everything is scoped to this call; dispose() tears it down and guards async paths.
function boot(docState: EditorDocument): BootHandle {
  // The playground edits TEXT - only code-form programs are editable here. (rete-form
  // documents arrive with the editor era; ast-form ones have no text to edit.)
  if (docState.program.form !== "code") {
    throw new Error(`The playground cannot edit '${docState.program.form}'-form programs yet`);
  }
  const initialSource = docState.program.source;

  const language = createStdlib();
  applySurface(language, docState.surface);

  let disposed = false;
  let compileTimer: ReturnType<typeof setTimeout> | undefined;
  let syncTimer: ReturnType<typeof setTimeout> | undefined;

  const session = new EditorSession(language);
  // Overlay the document's stored input values onto the surface defaults.
  for (const [name, value] of Object.entries(docState.inputValues)) {
    session.setInput(name, value);
  }

  const currentDocument = (): EditorDocument => ({
    version: DOCUMENT_VERSION,
    program: serialiseSource(view.state.doc.toString()),
    surface: docState.surface,
    inputValues: session.inputs.get(),
  });

  // Live URL sync: the address bar always holds the current document (replaceState, so
  // no history spam). Failures (Safari history throttle, encode hiccups) skip a tick -
  // the next edit re-syncs.
  const sync = async (): Promise<void> => {
    if (disposed) return;
    const doc = currentDocument();
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(doc));
    try {
      const payload = await encodeDocument(doc);
      if (!disposed) history.replaceState(null, "", `#${payload}`);
    } catch {
      // next sync retries
    }
  };
  const scheduleSync = (): void => {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => void sync(), DEBOUNCE_MS);
  };

  // Debounced compile (+ sync) on every source edit.
  const compileListener = EditorView.updateListener.of((update) => {
    if (!update.docChanged) return;
    clearTimeout(compileTimer);
    compileTimer = setTimeout(() => {
      if (disposed) return;
      session.compile(update.state.doc.toString());
      void sync();
    }, DEBOUNCE_MS);
  });

  const view = new EditorView({
    doc: initialSource,
    parent: editorPane,
    extensions: [basicSetup, lintGutter(), dendriteHighlighting(language), compileListener],
  });

  const jumpTo = (line: number, column: number): void => {
    const source = view.state.doc.toString();
    const offset = Math.min(toOffset(lineStartOffsets(source), line, column), source.length);
    view.dispatch({ selection: { anchor: offset }, scrollIntoView: true });
    view.focus();
  };

  // Everything that reacts to the session subscribes here; the session never learns who
  // is listening. Lint squiggles and the diagnostics pane are two consumers of one stream.
  const subscriptions = [
    session.diagnostics.subscribe((diagnostics) =>
      view.dispatch(
        setDiagnostics(view.state, toLintDiagnostics(view.state.doc.toString(), diagnostics)),
      ),
    ),
    session.diagnostics.subscribe((diagnostics) =>
      renderDiagnostics(diagnosticsPane, diagnostics, jumpTo),
    ),
    session.outputs.subscribe((result) => renderOutputs(outputsPane, result)),
  ];

  renderInputs(inputsPane, widgetsFor(language.descriptor), session.inputs.get(), (name, value) => {
    session.setInput(name, value);
    scheduleSync();
  });

  session.compile(initialSource);

  return {
    dispose() {
      disposed = true;
      clearTimeout(compileTimer);
      clearTimeout(syncTimer);
      for (const unsubscribe of subscriptions) unsubscribe();
      // Keep the fallback slot fresh; the URL for this document lives in history already.
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(currentDocument()));
      view.destroy();
    },
    async syncNow() {
      clearTimeout(syncTimer);
      await sync();
    },
  };
}

// A failed boot (e.g. a document declaring a dangling type reference) must surface,
// not white-screen: show the error where diagnostics normally live.
function renderBootFailure(error: unknown): void {
  inputsPane.replaceChildren();
  renderOutputs(outputsPane, { outputs: null, error: null });
  renderDiagnostics(
    diagnosticsPane,
    [
      {
        severity: "error",
        kind: "boot_failed",
        message: error instanceof Error ? error.message : String(error),
      },
    ],
    () => {},
  );
}

let current: BootHandle | null = null;

function switchToDocument(doc: EditorDocument, presetId?: string): void {
  current?.dispose();
  current = null;
  try {
    current = boot(doc);
  } catch (error) {
    renderBootFailure(error);
  }
  exampleSelect.value = presetId ?? "";
}

// Resolve a location hash: a known preset id (one-shot entry point that converts to a
// payload URL), a document payload, or nothing.
async function resolveHash(
  hash: string,
): Promise<{ doc: EditorDocument; presetId?: string; convert?: boolean } | null> {
  const fragment = hash.replace(/^#/, "");
  if (!fragment) return null;
  const preset = examples.find((e) => e.id === fragment);
  if (preset) return { doc: cloneDocument(preset.document), presetId: preset.id, convert: true };
  const doc = await decodePayload(fragment);
  return doc ? { doc } : null;
}

function fallbackDocument(): EditorDocument | null {
  try {
    const stored = localStorage.getItem(FALLBACK_KEY);
    if (!stored) return null;
    // The slot may predate the current envelope version - migrate like a share link.
    return migrateDocument(JSON.parse(stored));
  } catch {
    return null;
  }
}

async function init(): Promise<void> {
  // Example selector: a hidden "custom" option represents shared/edited documents.
  const custom = document.createElement("option");
  custom.value = "";
  custom.hidden = true;
  custom.textContent = "(shared document)";
  exampleSelect.append(custom);
  for (const example of examples) {
    const option = document.createElement("option");
    option.value = example.id;
    option.textContent = example.name;
    exampleSelect.append(option);
  }

  exampleSelect.addEventListener("change", () => {
    const preset = examples.find((e) => e.id === exampleSelect.value);
    if (!preset) return;
    const doc = cloneDocument(preset.document);
    // New history entry per loaded preset: Back restores the previous document.
    void encodeDocument(doc)
      .then((payload) => history.pushState(null, "", `#${payload}`))
      .catch(() => {});
    switchToDocument(doc, preset.id);
  });

  // Back/Forward AND direct hash navigations land here (hash changes are same-document
  // navigations, so they fire popstate too). Alias fragments still convert to payloads.
  window.addEventListener("popstate", () => {
    void resolveHash(location.hash).then((resolved) => {
      if (!resolved) return;
      switchToDocument(resolved.doc, resolved.presetId);
      if (resolved.convert) void current?.syncNow();
    });
  });

  shareButton.addEventListener("click", () => {
    void (async () => {
      await current?.syncNow();
      const label = shareButton.textContent;
      try {
        await navigator.clipboard.writeText(location.href);
        shareButton.textContent = "Copied!";
      } catch {
        // Clipboard can be denied (permissions/no user activation) - the URL is still
        // fresh in the address bar, so point there.
        shareButton.textContent = "Copy the URL above";
      }
      setTimeout(() => (shareButton.textContent = label), 1500);
    })();
  });

  // Initial document: URL (payload or preset alias) → localStorage fallback → first preset.
  const resolved = await resolveHash(location.hash);
  let doc: EditorDocument;
  let presetId: string | undefined;
  if (resolved) {
    ({ doc, presetId } = resolved);
  } else {
    const fallback = fallbackDocument();
    doc = fallback ?? cloneDocument(examples[0].document);
    presetId = fallback ? undefined : examples[0].id;
  }
  switchToDocument(doc, presetId);
  // Convert alias / hash-less entries to the canonical payload URL.
  if (!resolved || resolved.convert) await current?.syncNow();
}

void init();
