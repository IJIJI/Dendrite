import { lintGutter, setDiagnostics } from "@codemirror/lint";
import { EditorView } from "@codemirror/view";
import { createStdlib } from "@dendrite-lang/core";
import { basicSetup } from "codemirror";

import { dendriteHighlighting, toLintDiagnostics } from "../lang/cm";
import { widgetsFor } from "../lang/input-widgets";
import { PlaygroundSession } from "../lang/session";
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

const storageKey = (exampleId: string) => `dendrite-playground:${exampleId}`;
const DEBOUNCE_MS = 300;

interface BootHandle {
  dispose(): void;
}

// Boot the playground for one example: fresh language, session, editor. Everything is
// scoped to this call; dispose() tears it down (and guards the async paths - a pending
// debounce or late callback from a disposed boot must never touch the live panes).
function boot(exampleId: string): BootHandle {
  const example = examples.find((e) => e.id === exampleId) ?? examples[0];
  const language = createStdlib();
  example.setup(language);

  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pendingSave = false; // an edit happened that hasn't hit localStorage yet
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

  // Debounced compile + persistence on every edit.
  const compileListener = EditorView.updateListener.of((update) => {
    if (!update.docChanged) return;
    pendingSave = true;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (disposed) return;
      const source = update.state.doc.toString();
      localStorage.setItem(storageKey(example.id), source);
      pendingSave = false;
      session.compile(source);
    }, DEBOUNCE_MS);
  });

  const source = localStorage.getItem(storageKey(example.id)) ?? example.source;
  view = new EditorView({
    doc: source,
    parent: editorPane,
    extensions: [basicSetup, lintGutter(), dendriteHighlighting(language), compileListener],
  });

  renderInputs(
    inputsPane,
    widgetsFor(language.descriptor),
    (name) => session.getValue(name),
    (name, value) => session.setInput(name, value),
  );

  session.compile(source);

  return {
    dispose() {
      disposed = true;
      clearTimeout(timer);
      // Flush an edit still inside the debounce window so switching loses nothing - but
      // ONLY then, so merely viewing an example never pins its pristine source in storage.
      if (pendingSave) {
        localStorage.setItem(storageKey(example.id), view.state.doc.toString());
      }
      view.destroy();
    },
  };
}

// A failed boot (e.g. an example registering a dangling type reference) must surface,
// not white-screen: show the error where diagnostics normally live.
function renderBootFailure(error: unknown): void {
  inputsPane.replaceChildren(); // don't leave the previous example's widgets around
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

function switchTo(exampleId: string): void {
  current?.dispose();
  current = null;
  try {
    current = boot(exampleId);
  } catch (error) {
    renderBootFailure(error);
  }
}

// Example switcher.
for (const example of examples) {
  const option = document.createElement("option");
  option.value = example.id;
  option.textContent = example.name;
  exampleSelect.append(option);
}
exampleSelect.addEventListener("change", () => switchTo(exampleSelect.value));

switchTo(examples[0].id);
