# @dendrite-lang/editor

The Dendrite editor: a **headless core** (document, stores, CodeMirror adapter) plus
**React compound components** under `@dendrite-lang/editor/react`. A host lays the components out
however it likes and owns persistence and routing; the editor owns everything inside.

## React

```tsx
import "@dendrite-lang/editor/style.css";
import { Editor } from "@dendrite-lang/editor/react";

<Editor document={doc} language={myLanguage} onChange={(d) => void store.save(d)}>
  <Editor.DefaultLayout topBar={{ title, menus, actions }} />
</Editor>;
```

`DefaultLayout` is only a composition — arrange the pieces yourself when the preset doesn't fit:

```tsx
<Editor document={doc} onChange={save}>
  <Editor.TopBar title="Live tally" actions={[{ icon: "share", label: "Share", onClick }]} />
  <Editor.Row grow>
    <Editor.Column grow>
      <Editor.Canvas />
    </Editor.Column>
    <Editor.Column size="20rem">
      <Editor.Inputs title="Live state" readOnly={(name) => live.has(name)} />
      <Editor.Outputs />
      <Editor.Diagnostics />
    </Editor.Column>
  </Editor.Row>
</Editor>
```

| Component                                   | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<Editor>`                                  | The provider. `document`; `language?` (default: the stdlib, copied so nothing leaks back); `layers?` (host port layers beneath the document's own); `onChange?` (debounced; fires for anything a save would capture). A new `document` **or `layers`** remounts the editor, so both must be stable references                                                                                                                                      |
| `<Editor.Canvas/>`                          | The code editor and the place the running program is born — required                                                                                                                                                                                                                                                                                                                                                                               |
| `<Editor.Inputs/>`                          | One row per program-level input, in layer order. `readOnly`: `true`, or a predicate by input name — host policy, deliberately not part of the document. An input a host layer FEEDS is always read-only, whatever the prop says. Rows keep rendering while the ports fail to compose, which is when you need to see them                                                                                                                           |
| `<Editor.Outputs/>` `<Editor.Diagnostics/>` | Last evaluation / diagnostics with click-to-jump. Outputs carry a **stale** tag when the running program is no longer the one in the editor. A problem with the ports names its layer and row instead of a line. A failed mount surfaces as a `boot_failed` diagnostic instead of a white screen                                                                                                                                                   |
| every pane                                  | `title?: string \| null` (retitle / hide), `className`, `style`                                                                                                                                                                                                                                                                                                                                                                                    |
| `<Editor.TopBar/>`                          | `brand`, centred `title`, `menus` (data, one submenu level), `actions` (`{ icon, label, onClick }` or `{ element }` for custom UI). Inside `<Editor>` it also carries the editor's own Undo/Redo (source history) ahead of the host's actions, and its theme toggle (`themeToggle`, default on: system → light → dark, remembered in `localStorage`; pass `false` when the host has its own theme setting and writes `data-dendrite-theme` itself) |
| `<Wordmark/>`                               | The outlined brand wordmark: letters in the text colour, fork in the accent. `<Editor.TopBar/>`'s default `brand`                                                                                                                                                                                                                                                                                                                                  |
| `<Editor.Row/>` `<Editor.Column/>`          | Flex primitives: `grow`, `size`                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `useEditor()`                               | `{ editor, error }` for host components rendered inside `<Editor>` (e.g. to read `editor.getDocument()` on Share, or `editor.instance` for anything the panes do not cover)                                                                                                                                                                                                                                                                        |

**Styling:** `style.css` lives in the `dendrite` cascade layer (a host's plain rules win without
specificity fights) and is themed through `--dendrite-*` custom properties on `:root`: surfaces
(`bg`, `panel`, `bar`, `well`, `hover`), ink (`text`, `muted`, `faint`), `border`,
`accent` (+ `-text`, `-hover`, `-soft`), `error` / `warning` (+ `-soft`), `input`, radii, fonts
(`font`, `mono`, `mono-ui`), motion, and one `--dendrite-syntax-<class>` per lexer class. The
values are the Dendrite brand (`brand/dendrite-tokens.css`). Colours are `light-dark()` pairs: the
theme follows the system, and `data-dendrite-theme="light" | "dark"` on `<html>` forces one. The
package loads no fonts - the host loads Archivo (400, 600), IBM Plex Mono (400, 400 italic, 600) and Kode Mono
(500), or the fallbacks apply. CodeMirror's own chrome is themed from the same variables in `cm.ts`, because its base
theme is injected un-layered and a layered sheet cannot override it.
**React** is an optional peer (`^18 || ^19`); the headless entry pulls no React at all — the
boundary is lint-enforced.

## Headless (framework-free)

```ts
import { createEditor, LocalStorageStore, watch } from "@dendrite-lang/editor";

const store = new LocalStorageStore("my-app:document");
const editor = createEditor(el, {
  document: (await store.load()) ?? myPreset,
  language: myLanguage, // optional - default createStdlib(), copied so nothing leaks back
  layers: { global: [hostContract] }, // optional - must be a STABLE reference
  onChange: (doc) => void store.save(doc), // debounced; anything a save would capture
});

// The editor mounts a core ProgramInstance: five observables and four commands.
watch(editor.instance.outputs, (result) => renderOutputs(result)); // { outputs, error, stale }
watch(editor.instance.diagnostics, (list) => renderDiagnostics(list, editor.jumpTo));
editor.instance.setInput("score", 42); // from whatever inputs UI the host renders
editor.dispose(); // unregisters the program and stops every subscription
```

| Module               | Role                                                                                                                                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `editor.ts`          | `createEditor` - the lifecycle Facade: language copy, environment, runtime, the `ProgramInstance` the document runs as, CodeMirror view, debounced recompile, lint, `onChange`                                                                  |
| `theme.ts`           | `getTheme()` - the page's colour scheme (`auto` / `light` / `dark`): `mode` observable + `set()`, remembered in localStorage; call it before the first render so a remembered mode never flashes. `createThemeController` takes fakes for tests |
| `observable.ts`      | `watch`, plus core's `createSubject` re-exported - the only reactive primitive (React's external-store contract)                                                                                                                                |
| `document.ts`        | `EditorDocument` (`version`, `program` incl. its `ports`, `inputValues`) - core's `Snapshot` plus an envelope version; `migrateDocument` over an `applyMigrations` chain                                                                        |
| `ports-edit.ts`      | add / update / remove inputs and outputs on a layer's `Ports`, plus the type options a picker offers. Pure; `instance.setLayer` judges the result                                                                                               |
| `diagnostic.ts`      | `positionOf` - the one adapter from a core `SourceRef` to a line and column                                                                                                                                                                     |
| `store.ts`           | `DocumentStore` + `MemoryStore` / `LocalStorageStore` / `UrlStore` (adapters never reject)                                                                                                                                                      |
| `permalink.ts`       | document ↔ URL payload (deflate + base64url, native streams)                                                                                                                                                                                    |
| `tokens.ts`, `cm.ts` | lexer-driven highlighting and the editor chrome theme; `cm.ts` + `editor.ts` are the only CodeMirror-aware modules                                                                                                                              |
| `input-widgets.ts`   | port declarations → widget shapes, each carrying its layer, whether a host feeds it, and whether that layer is editable                                                                                                                         |
| `format.ts`          | `formatValue` - the one value→text rule every pane shares                                                                                                                                                                                       |
| `react/`             | the compound components above - the only place React is allowed                                                                                                                                                                                 |

## Principles

- **The host owns persistence and policy.** The editor emits `onChange`; a host wires one store
  (a Composite if it needs several backends) and decides autosave versus an explicit save. Which
  inputs a user may edit is host policy too (`readOnly`), never document data. The one thing the
  editor remembers on its own is the theme mode, a UI preference (opt out with `themeToggle={false}`).
- **Observables, not callbacks.** Any number of consumers subscribe; the instance never learns who.
- **The editor edits a running program.** `editor.instance` is a core `ProgramInstance`: the same
  object a host runs headless. Today the editor builds its own; mounting one a host already runs
  is the next step (`.docs/todo.md`).
- **The document is self-contained and versioned.** `applyMigrations` is generic on purpose so a
  host envelope can chain its own versions the same way.
- **Composition over configuration.** Layout is JSX; presets are compositions; menus and actions
  are data. No deployment "tiers".
- **`@dendrite-lang/core` is a peer dependency.** Two copies would break `instanceof EvalError`
  and descriptor identity.

## Develop

Part of the Dendrite workspace. `yarn workspace @dendrite-lang/editor run test` runs the headless
suite in plain Node (no DOM); the React components and `createEditor` are exercised through the
playground, which aliases this package's source for HMR. Build: ESM + `.d.ts` via tsup, two
entries (`.` and `./react`).
