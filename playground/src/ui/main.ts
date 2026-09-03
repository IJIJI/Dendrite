import { lintGutter, setDiagnostics } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { createStdlib } from "@dendrite-lang/core";
import { basicSetup } from "codemirror";

import { dendriteHighlighting, toLintDiagnostics } from "../lang/cm";
import {
  cloneDocument,
  DOCUMENT_VERSION,
  isDocument,
  type PlaygroundDocument,
} from "../lang/document";
import { widgetsFor } from "../lang/input-widgets";
import { decodePayload, encodeDocument } from "../lang/permalink";
import { PlaygroundSession } from "../lang/session";
import { applySurface } from "../lang/surface";
import { lineStartOffsets, toOffset } from "../lang/tokens";
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
function boot(docState: PlaygroundDocument): BootHandle {
  const language = createStdlib();
  applySurface(language, docState.surface);

  let disposed = false;
  let compileTimer: ReturnType<typeof setTimeout> | undefined;
  let syncTimer: ReturnType<typeof setTimeout> | undefined;
  // Mutual reference: the session's callbacks capture `view`, and the view's extensions
  // capture `session` - so one of the two must be declared first and assigned later.
  // eslint-disable-next-line prefer-const
  let view: EditorView; // assigned below, before the first compile fires any callback

  const jumpTo = (line: number, column: number): void => {
    const source = view.state.doc.toString();
    const offset = Math.min(toOffset(lineStartOffsets(source), line, column), source.length);
    view.dispatch({ selection: { anchor: offset }, scrollIntoView: true });
    view.focus();
  };

  const session = new PlaygroundSession(language, {
    onDiagnostics(diagnostics) {
      if (disposed) return;
      const source = view.state.doc.toString();
      view.dispatch(setDiagnostics(view.state, toLintDiagnostics(source, diagnostics)));
      renderDiagnostics(diagnosticsPane, diagnostics, jumpTo);
    },
    onRun({ outputs, error }) {
      if (disposed) return;
      renderOutputs(outputsPane, outputs, error);
    },
  });
  // Overlay the document's stored input values onto the surface defaults.
  for (const [name, value] of Object.entries(docState.values)) session.setInput(name, value);

  const currentDocument = (): PlaygroundDocument => ({
    v: DOCUMENT_VERSION,
    source: view.state.doc.toString(),
    surface: docState.surface,
    values: session.getValues(),
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

  view = new EditorView({
    doc: docState.source,
    parent: editorPane,
    extensions: [basicSetup, lintGutter(), dendriteHighlighting(language), compileListener],
  });

  renderInputs(
    inputsPane,
    widgetsFor(language.descriptor),
    (name) => session.getValue(name),
    (name, value) => {
      session.setInput(name, value);
      scheduleSync();
    },
  );

  session.compile(docState.source);

  return {
    dispose() {
      disposed = true;
      clearTimeout(compileTimer);
      clearTimeout(syncTimer);
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
  renderOutputs(outputsPane, null, null);
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

function switchToDocument(doc: PlaygroundDocument, presetId?: string): void {
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
): Promise<{ doc: PlaygroundDocument; presetId?: string; convert?: boolean } | null> {
  const fragment = hash.replace(/^#/, "");
  if (!fragment) return null;
  const preset = examples.find((e) => e.id === fragment);
  if (preset) return { doc: cloneDocument(preset.document), presetId: preset.id, convert: true };
  const doc = await decodePayload(fragment);
  return doc ? { doc } : null;
}

function fallbackDocument(): PlaygroundDocument | null {
  try {
    const stored = localStorage.getItem(FALLBACK_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    return isDocument(parsed) ? parsed : null;
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
  let doc: PlaygroundDocument;
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
