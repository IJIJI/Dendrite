# @dendrite-lang/editor

The Dendrite editor: a **headless core** (session, document, stores, CodeMirror adapter) plus
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

| Component                                   | Notes                                                                                                                                                                                                                                         |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<Editor>`                                  | The provider. `document`; `language?` (default: the stdlib — the document's surface is applied to a _copy_); `onChange?` (debounced; source **and** input changes). A new `document` remounts the editor                                      |
| `<Editor.Canvas/>`                          | The code editor and the place the session is born — required                                                                                                                                                                                  |
| `<Editor.Inputs/>`                          | `readOnly`: `true`, or a predicate by input name — host policy, deliberately not part of the document. Editable fields apply once they parse; read-only rows are live                                                                         |
| `<Editor.Outputs/>` `<Editor.Diagnostics/>` | Last evaluation / diagnostics with click-to-jump. A failed mount surfaces as a `boot_failed` diagnostic instead of a white screen                                                                                                             |
| every pane                                  | `title?: string \| null` (retitle / hide), `className`, `style`                                                                                                                                                                               |
| `<Editor.TopBar/>`                          | `brand`, centred `title`, `menus` (data, one submenu level), `actions` (`{ icon, label, onClick }` or `{ element }` for custom UI). Inside `<Editor>` it also carries the editor's own Undo/Redo (source history) ahead of the host's actions |
| `<Wordmark/>`                               | The outlined brand wordmark: letters in the text colour, fork in the accent. `<Editor.TopBar/>`'s default `brand`                                                                                                                             |
| `<Editor.Row/>` `<Editor.Column/>`          | Flex primitives: `grow`, `size`                                                                                                                                                                                                               |
| `useEditor()`                               | `{ editor, error }` for host components rendered inside `<Editor>` (e.g. to read `editor.getDocument()` on Share)                                                                                                                             |

**Styling:** `style.css` lives in the `dendrite` cascade layer (a host's plain rules win without
specificity fights) and is themed through `--dendrite-*` custom properties on `:root`: surfaces
(`bg`, `panel`, `well`, `hover`), ink (`text`, `muted`, `faint`), `border` / `border-strong`,
`accent` (+ `-text`, `-hover`, `-soft`), `error` / `warning` (+ `-soft`), `input`, radii, fonts
(`font`, `mono`, `mono-ui`), motion, and one `--dendrite-syntax-<class>` per lexer class. The
values are the Dendrite brand (`brand/dendrite-tokens.css`). Colours are `light-dark()` pairs: the
theme follows the system, and `data-dendrite-theme="light" | "dark"` on `<html>` forces one. The
package loads no fonts - the host loads Archivo, IBM Plex Mono and Kode Mono, or the fallbacks
apply. CodeMirror's own chrome is themed from the same variables in `cm.ts`, because its base
theme is injected un-layered and a layered sheet cannot override it.
**React** is an optional peer (`^18 || ^19`); the headless entry pulls no React at all — the
boundary is lint-enforced.

## Headless (framework-free)

```ts
import { createEditor, LocalStorageStore, watch } from "@dendrite-lang/editor";

const store = new LocalStorageStore("my-app:document");
const editor = createEditor(el, {
  document: (await store.load()) ?? myPreset,
  language: myLanguage, // optional - default createStdlib(); the surface is applied to a COPY
  onChange: (doc) => void store.save(doc), // debounced; fires on source AND input changes
});

watch(editor.session.outputs, (result) => renderOutputs(result));
watch(editor.session.diagnostics, (list) => renderDiagnostics(list, editor.jumpTo));
editor.session.setInput("score", 42); // from whatever inputs UI the host renders
editor.dispose();
```

| Module               | Role                                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `editor.ts`          | `createEditor` - the lifecycle Facade: language copy + surface, session, CodeMirror view, debounced compile, lint, `onChange` |
| `session.ts`         | `EditorSession` - compile/run one program; publishes `diagnostics` / `outputs` / `inputs` as observables                      |
| `observable.ts`      | `createSubject`, `watch` - the only reactive primitive (React's external-store contract)                                      |
| `document.ts`        | `EditorDocument` (`version`, `program`, `surface`, `inputValues`); `migrateDocument` over an `applyMigrations` chain          |
| `surface.ts`         | `SurfaceSpec` - types/inputs/outputs as JSON data; `applySurface`                                                             |
| `store.ts`           | `DocumentStore` + `MemoryStore` / `LocalStorageStore` / `UrlStore` (adapters never reject)                                    |
| `permalink.ts`       | document ↔ URL payload (deflate + base64url, native streams)                                                                  |
| `tokens.ts`, `cm.ts` | lexer-driven highlighting and the editor chrome theme; `cm.ts` + `editor.ts` are the only CodeMirror-aware modules            |
| `input-widgets.ts`   | descriptor inputs → widget shapes, plus the one shared initial-value rule                                                     |
| `format.ts`          | `formatValue` - the one value→text rule every pane shares                                                                     |
| `react/`             | the compound components above - the only place React is allowed                                                               |

## Principles

- **The host owns persistence and policy.** The editor emits `onChange`; a host wires one store
  (a Composite if it needs several backends) and decides autosave versus an explicit save. Which
  inputs a user may edit is host policy too (`readOnly`), never document data.
- **Observables, not callbacks.** Any number of consumers subscribe; the session never learns who.
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
