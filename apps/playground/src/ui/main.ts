import {
  cloneDocument,
  createEditor,
  type EditorDocument,
  type EditorHandle,
  LocalStorageStore,
  UrlStore,
  watch,
  widgetsFor,
} from "@dendrite-lang/editor";

import { examples } from "../examples";
import { renderDiagnostics, renderInputs, renderOutputs } from "./panes";
import "../style.css";

//? The playground host: mounts the editor for one document at a time, renders the panes
// from its session, and owns persistence + routing policy (URL as the source of truth,
// localStorage as a single-slot fallback, preset ids as one-shot entry links).

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

const urlStore = new UrlStore();
const fallbackStore = new LocalStorageStore("dendrite-playground:document");

const save = (doc: EditorDocument): Promise<void> =>
  Promise.all([fallbackStore.save(doc), urlStore.save(doc)]).then(() => undefined);

interface Mounted {
  editor: EditorHandle;
  dispose(): void;
}

// Mount the editor for one document and wire the panes to its session. `watch` paints the
// current state first - the editor has already compiled by the time we subscribe.
function mount(doc: EditorDocument): Mounted {
  const editor = createEditor(editorPane, { document: doc, onChange: (d) => void save(d) });
  const { session } = editor;
  const unwatch = [
    watch(session.diagnostics, (d) => renderDiagnostics(diagnosticsPane, d, editor.jumpTo)),
    watch(session.outputs, (r) => renderOutputs(outputsPane, r)),
  ];
  renderInputs(inputsPane, widgetsFor(session.language.descriptor), session.inputs.get(), (n, v) =>
    session.setInput(n, v),
  );
  return {
    editor,
    dispose() {
      for (const stop of unwatch) stop();
      editor.dispose();
    },
  };
}

// A failed mount (e.g. a document declaring a dangling type reference) must surface,
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

let current: Mounted | null = null;

function switchToDocument(doc: EditorDocument, presetId?: string): void {
  if (current) {
    // Keep the fallback slot fresh; the URL for the outgoing document lives in history.
    void fallbackStore.save(current.editor.getDocument());
    current.dispose();
    current = null;
  }
  try {
    current = mount(doc);
  } catch (error) {
    renderBootFailure(error);
  }
  exampleSelect.value = presetId ?? "";
}

/** Write the current document to the URL + fallback slot right now (Share, alias conversion). */
const syncNow = (): Promise<void> =>
  current ? save(current.editor.getDocument()) : Promise.resolve();

// Resolve the current location: a known preset id (one-shot entry point that converts to a
// payload URL), a document payload, or nothing.
async function resolveLocation(): Promise<{
  doc: EditorDocument;
  presetId?: string;
  convert?: boolean;
} | null> {
  const fragment = location.hash.replace(/^#/, "");
  if (!fragment) return null;
  const preset = examples.find((e) => e.id === fragment);
  if (preset) return { doc: cloneDocument(preset.document), presetId: preset.id, convert: true };
  const doc = await urlStore.load();
  return doc ? { doc } : null;
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
    void urlStore.push(doc);
    switchToDocument(doc, preset.id);
  });

  // Back/Forward AND direct hash navigations land here (hash changes are same-document
  // navigations, so they fire popstate too). Alias fragments still convert to payloads.
  window.addEventListener("popstate", () => {
    void resolveLocation().then((resolved) => {
      if (!resolved) return;
      switchToDocument(resolved.doc, resolved.presetId);
      if (resolved.convert) void syncNow();
    });
  });

  shareButton.addEventListener("click", () => {
    void (async () => {
      await syncNow();
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
  const resolved = await resolveLocation();
  let doc: EditorDocument;
  let presetId: string | undefined;
  if (resolved) {
    ({ doc, presetId } = resolved);
  } else {
    const fallback = await fallbackStore.load();
    doc = fallback ?? cloneDocument(examples[0].document);
    presetId = fallback ? undefined : examples[0].id;
  }
  switchToDocument(doc, presetId);
  // Convert alias / hash-less entries to the canonical payload URL.
  if (!resolved || resolved.convert) await syncNow();
}

void init();
