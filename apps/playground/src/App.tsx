import {
  cloneDocument,
  type EditorDocument,
  LocalStorageStore,
  UrlStore,
} from "@dendrite-lang/editor";
import { Editor, type TopBarAction, useEditor } from "@dendrite-lang/editor/react";
import { useEffect, useState } from "react";

import { type ExamplePreset, examples } from "./examples";

//? The playground host. Owns persistence + routing policy (URL as the source of truth,
// localStorage as a single-slot fallback, preset ids as one-shot entry links) and mounts
// the editor for one document at a time; the editor package owns everything inside.

const urlStore = new UrlStore();
const fallbackStore = new LocalStorageStore("dendrite-playground:document");

const save = (doc: EditorDocument): Promise<void> =>
  Promise.all([fallbackStore.save(doc), urlStore.save(doc)]).then(() => undefined);

interface Current {
  doc: EditorDocument;
  presetId?: string;
  /** Entry was an alias or hash-less: write the canonical payload URL once mounted. */
  convert: boolean;
}

const fromPreset = (preset: ExamplePreset, convert: boolean): Current => ({
  doc: cloneDocument(preset.document),
  presetId: preset.id,
  convert,
});

// The current location: a preset id (one-shot entry point), a document payload, or nothing.
async function resolveLocation(): Promise<Current | null> {
  const fragment = location.hash.replace(/^#/, "");
  if (!fragment) return null;
  const preset = examples.find((e) => e.id === fragment);
  if (preset) return fromPreset(preset, true);
  const doc = await urlStore.load();
  return doc ? { doc, convert: false } : null;
}

// Initial document: URL → localStorage fallback → first preset.
async function resolveInitial(): Promise<Current> {
  const resolved = await resolveLocation();
  if (resolved) return resolved;
  const fallback = await fallbackStore.load();
  return fallback ? { doc: fallback, convert: true } : fromPreset(examples[0], true);
}

export function App() {
  const [current, setCurrent] = useState<Current | null>(null);

  useEffect(() => {
    void resolveInitial().then(setCurrent);
    // Back/Forward AND direct hash navigations land here (hash changes are same-document
    // navigations, so they fire popstate too).
    const onPopState = () => {
      void resolveLocation().then((resolved) => {
        if (resolved) setCurrent(resolved);
      });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  if (!current) return null;
  return (
    <Editor document={current.doc} onChange={(doc) => void save(doc)}>
      <Host
        presetId={current.presetId}
        convert={current.convert}
        onLoadPreset={(preset) => {
          const next = fromPreset(preset, false);
          // New history entry per loaded preset: Back restores the previous document.
          void urlStore.push(next.doc);
          setCurrent(next);
        }}
      />
    </Editor>
  );
}

// Inside <Editor>, so it can reach the mounted editor for the exact current document.
function Host({
  presetId,
  convert,
  onLoadPreset,
}: {
  presetId?: string;
  convert: boolean;
  onLoadPreset(preset: ExamplePreset): void;
}) {
  const { editor } = useEditor();
  const [flash, setFlash] = useState<string | null>(null);

  // Convert alias / hash-less entries to the canonical payload URL.
  useEffect(() => {
    if (convert && editor) void save(editor.getDocument());
  }, [convert, editor]);

  const share = async () => {
    if (!editor) return;
    await save(editor.getDocument());
    try {
      await navigator.clipboard.writeText(location.href);
      setFlash("Copied!");
    } catch {
      // Clipboard can be denied (permissions/no user activation) - the URL is still fresh
      // in the address bar, so point there.
      setFlash("Copy the URL above");
    }
    setTimeout(() => setFlash(null), 1500);
  };

  const title = presetId
    ? (examples.find((e) => e.id === presetId)?.name ?? "Example")
    : "Shared document";

  const actions: TopBarAction[] = [
    ...(flash ? [{ element: <span className="playground-flash">{flash}</span> }] : []),
    {
      icon: "share",
      label: "Share a link to this exact program + inputs",
      onClick: () => void share(),
    },
  ];

  return (
    <Editor.DefaultLayout
      topBar={{
        title,
        menus: [
          {
            label: "File",
            items: [
              {
                label: "Load example",
                items: examples.map((preset) => ({
                  label: preset.name,
                  onSelect: () => {
                    // Keep the fallback slot fresh with the outgoing document (its URL
                    // lives in history already).
                    if (editor) void fallbackStore.save(editor.getDocument());
                    onLoadPreset(preset);
                  },
                })),
              },
            ],
          },
        ],
        actions,
      }}
    />
  );
}
