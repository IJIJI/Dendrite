# @dendrite-lang/editor

The Dendrite editor: a **headless core** (document, stores, CodeMirror adapter) plus
**React compound components** under `@dendrite-lang/editor/react`. A host lays the components out
however it likes and owns persistence and routing; the editor owns everything inside.

## React

```tsx
import "@dendrite-lang/editor/style.css";
import { defaultActions, Editor } from "@dendrite-lang/editor/react";

<Editor document={doc} language={myLanguage} onChange={(d) => void store.save(d)}>
  <Editor.FullLayout topBar={{ title, start: [fileMenu] }} actions={[...defaultActions, share]} />
</Editor>;
```

Three presets on one scale, every one a composition of the blocks below, every one taking
the same `LayoutConfig` with its own defaults:

| Preset                    | Arrangement                                                                                                                                                                                                                                                                                                                                                                                                                                            | `code.gutters` | `declarations` | `actionsAt` (spots · default)                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | -------------- | -------------------------------------------------------------------------------------------------------------- |
| `<Editor.MinimalLayout/>` | the inputs in one line, the code, the outputs as `→ name = value` lines; no Diagnostics pane (squiggles and their hover message instead); the height follows the content. Extends the config with `inputs: "row" \| "column"` (a wrapping grid of `$name = [field]` cells, at least `--dendrite-inline-min` (12rem) wide each, or the pane's stacked rows); `--dendrite-code-min-height` asks for a taller code area that still grows with its content | `none`         | `false`        | `inputs` (the end of the input strip) · `code-start` · `code-end` · `bar-start` · `bar-end` — default `inputs` |
| `<Editor.CompactLayout/>` | the code with Inputs and Outputs beside it, below it when narrow (a flex wrap); Diagnostics collapsed to one line; the code follows its content up to `--dendrite-compact-max-height` (24rem)                                                                                                                                                                                                                                                          | `compact`      | `true`         | `side` (a strip above the panes) · `code-start` · `code-end` · `bar-start` · `bar-end` — default `side`        |
| `<Editor.FullLayout/>`    | the playground: a top bar, the code, the three panes stacked beside it, filling its parent                                                                                                                                                                                                                                                                                                                                                             | `full`         | `true`         | `bar-end` · `bar-start` · `code-start` · `code-end` · `side` — default `bar-end` (`code-end` without a bar)    |

`LayoutConfig`: `code` (`editable`, `gutters` — every preset is editable by default), `declarations`,
`actions` (the buttons: the editor's own and the host's; default the editor's own controls,
`defaultActions`; listing replaces), `actionsAt` (the spot, from the preset's list above; a
`bar-*` spot without a `topBar` falls back to the preset's non-bar default; typed per preset, so
an unsupported spot does not compile), `topBar` (whole, `TopBarProps`; its `start` and `end` are
the host's own items, and a `bar-*` spot appends the actions after them — the bar's standalone
default never applies inside a preset), `className`, `style`. A preset is only a composition —
arrange the pieces yourself when none fits:

```tsx
<Editor document={doc} onChange={save}>
  <Editor.TopBar
    title="Live tally"
    end={[...defaultActions, { icon: "share", label: "Share", onClick }]}
  />
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

| Component                                   | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<Editor>`                                  | The provider. Either a `connection` (`joinRuntime`, `attach`, a link replica — see Headless) or the `ownStack` shorthand: `document`; `language?` (default: the stdlib, copied so nothing leaks back); `layers?` (host port layers beneath the document's own). `onChange?` (debounced; fires for anything a save would capture). A new `connection`, `document`, `language` or `layers` remounts the editor, so pass stable references                                                                                                                                                              |
| `<Editor.Canvas/>`                          | The code editor and the place the running program is born — required. `editable?` (default true) and `gutters?: "full" \| "compact" \| "none"` (default full: line numbers and lint dots; compact: the dots alone; none: nothing — squiggles and their hover message stay). Changing either remounts the editor, history included                                                                                                                                                                                                                                                                    |
| `<Editor.Inputs/>`                          | One row per program-level input, in layer order. `readOnly`: `true`, or a predicate by input name — host policy, deliberately not part of the document. An input a host layer FEEDS is always read-only, whatever the prop says. `declarations={false}` keeps the values settable but hides the declaration affordances (rename, type, add, remove) a `user` layer would otherwise offer — a documented example. Rows keep rendering while the ports fail to compose, which is when you need to see them. Class `dendrite-inputs-inline` lays the rows out as one wrapping line of `$name = [field]` |
| `<Editor.Outputs/>` `<Editor.Diagnostics/>` | Last evaluation / diagnostics with click-to-jump. Outputs carry a **stale** tag when the running program is no longer the one in the editor, take `declarations` like Inputs, and class `dendrite-outputs-lines` prints them as `→ name = value` lines. A problem with the ports names its layer and row instead of a line. A failed mount surfaces in Diagnostics as `boot_failed`                                                                                                                                                                                                                  |
| every pane                                  | `title?: string \| null` (retitle / hide), `className`, `style`, and `collapsible` — a closed `<details>` whose summary line is the title plus `summary`; Diagnostics fills its own summary ("No problems", "2 errors · 1 warning", never opening by itself)                                                                                                                                                                                                                                                                                                                                         |
| `<Editor.TopBar/>`                          | `brand`, centred `title`, and two item clusters: `start` (after the brand; menus, typically) and `end` (default: the editor's own controls, `defaultEnd`). An item is a `Menu` (`{ label, items }`, one submenu level), an icon action (`{ icon, label, onClick }`), an `{ element }` of the host's own, or one of the editor's built-ins - `Editor.items.undo`, `.redo`, `.theme` - listed where the host wants them. Listing replaces: an item left out is not there (no theme toggle: leave `items.theme` out). Undo/redo render only inside an `<Editor>` whose code is editable                 |
| `<Editor.Actions/>`                         | One cluster of the items above, on its own: in a layout without a bar it floats in the code block's corner (`.dendrite-code > .dendrite-actions`), and the code keeps its first line clear of it                                                                                                                                                                                                                                                                                                                                                                                                     |
| `<Editor.Source/>`                          | A program shown, not run: the same code block a layout has, highlighted by the editor's lexer, no CodeMirror and no `<Editor>` around it - so it renders on a server too. `children` land in its corner. Wrap it in `.dendrite-minimal-layout` for the bordered block the presets draw                                                                                                                                                                                                                                                                                                               |
| `<Wordmark/>`                               | The outlined brand wordmark: letters in the text colour, fork in the accent. `<Editor.TopBar/>`'s default `brand`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `<Editor.Row/>` `<Editor.Column/>`          | Flex primitives: `grow`, `size`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `useEditor()`                               | `{ editor, error }` for host components rendered inside `<Editor>` (e.g. to read `editor.getDocument()` on Share, or `editor.instance` for anything the panes do not cover)                                                                                                                                                                                                                                                                                                                                                                                                                          |

**Open in the playground:** the editor ships the URL shape, the host the action - routing is host
policy. `documentUrl(base, editor.getDocument())` gives the link; put the action where the layout
shows actions: `end` (the bar's end, or the code's corner in a layout without a bar), or a File
menu in `start`.

```tsx
const open = {
  icon: "external",
  label: "Open in playground",
  onClick: () =>
    void documentUrl(PLAYGROUND, editor.getDocument()).then((href) =>
      window.open(href, "_blank", "noopener"),
    ),
};
```

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
import {
  attach,
  createEditor,
  joinRuntime,
  LocalStorageStore,
  ownStack,
  watch,
} from "@dendrite-lang/editor";

// The editor edits ONE thing - a core ProgramInstance - and highlights with ONE thing - a
// Language. A Connection is where those come from; pick the one that fits the host:
const store = new LocalStorageStore("my-app:document");
const connection = ownStack({
  document: (await store.load()) ?? myPreset, // a private language copy, runtime and instance
  language: myLanguage, // optional - default createStdlib(), copied so nothing leaks back
  layers: { global: [hostContract] }, // optional
});
// joinRuntime(language, runtime, { document })  - the editor's own instance on a runtime the
//                                                 host runs; sees the host's live global values
// attach(language, instance)                    - a program the host already runs, local or a
//                                                 @dendrite-lang/link replica; edits are live

const editor = createEditor(el, {
  connection, // a STABLE reference: a new one is a new editor
  editable: false, // optional, default true; gutters?: "full" | "compact" | "none" beside it
  onChange: (doc) => void store.save(doc), // debounced; anything a save would capture
});

// Five observables and four commands, whatever the connection.
watch(editor.instance.outputs, (result) => renderOutputs(result)); // { outputs, error, stale }
watch(editor.instance.diagnostics, (list) => renderDiagnostics(list, editor.jumpTo));
editor.instance.setInput("score", 42); // from whatever inputs UI the host renders
editor.dispose(); // releases what the connection MADE - never a program it was handed
```

| Module                         | Role                                                                                                                                                                                                                                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session/connection.ts`        | `Connection` - the instance to edit and the language to highlight with - and the three ways to get one: `ownStack` (private stack), `joinRuntime` (own instance on a host runtime), `attach` (a program the host runs). `release` undoes only what was made                                               |
| `session/editor.ts`            | `createEditor` - the lifecycle Facade over a connection: CodeMirror view, debounced recompile, lint, `onChange`, `dispose`; takes the `CodeOptions` (`editable`, `gutters`) and reports `editable` on the handle                                                                                          |
| `session/document.ts`          | `EditorDocument` (`version`, `program` incl. its `ports`, `inputValues`) - core's `Snapshot` plus an envelope version; `migrateDocument` over an `applyMigrations` chain                                                                                                                                  |
| `session/store.ts`             | `DocumentStore` + `MemoryStore` / `LocalStorageStore` / `UrlStore` (adapters never reject)                                                                                                                                                                                                                |
| `session/permalink.ts`         | document ↔ URL payload (deflate + base64url, native streams); `documentUrl(base, doc)` - a document as a link to a page that reads the fragment, the one shape every "open in the playground" affordance builds                                                                                           |
| `session/carry-value.ts`       | an input's value carried across a rename or an undo once the change is published                                                                                                                                                                                                                          |
| `code/tokens.ts`, `code/cm.ts` | lexer-driven highlighting, `codeExtensions` (the CodeMirror extension list: the setup, editing or read-only, the chosen gutter, the theme, the highlighting) and the editor chrome theme; `cm.ts` + `session/editor.ts` are the only CodeMirror-aware modules                                             |
| `code/diagnostic.ts`           | `positionOf` - the one adapter from a core `SourceRef` to a line and column; `sortDiagnostics` (errors first) and `summarise` (the one-line count a collapsed pane shows)                                                                                                                                 |
| `ports/port-rows.ts`           | port declarations → the rows a pane renders (`widgetsFor`, `outputRows`), each carrying its layer and whether that layer is editable; `editableLayer`, `declaredNames`                                                                                                                                    |
| `ports/ports-edit.ts`          | add / update / remove inputs and outputs on a layer's `Ports`, plus the type options a picker offers. Pure; `instance.setLayer` judges the result                                                                                                                                                         |
| `ports/format.ts`              | `formatValue` - the one value→text rule every pane shares                                                                                                                                                                                                                                                 |
| `theme.ts`                     | `getTheme()` - the page's colour scheme (`auto` / `light` / `dark`): `mode` observable + `set()`, remembered in localStorage; call it before the first render so a remembered mode never flashes. `createThemeController` takes fakes for tests                                                           |
| `observable.ts`                | `watch`, plus core's `createSubject` re-exported - the only reactive primitive (React's external-store contract)                                                                                                                                                                                          |
| `react/`                       | the compound components above - the only place React is allowed: `blocks/` (TopBar, Canvas) with `blocks/panes/` beneath it (Inputs, Outputs, Diagnostics and what they share), `layouts/` (the presets and the `Row` / `Column` primitives); the provider, its hooks, the icons and the brand at the top |

## Principles

- **The host owns persistence and policy.** The editor emits `onChange`; a host wires one store
  (a Composite if it needs several backends) and decides autosave versus an explicit save. Which
  inputs a user may edit is host policy too (`readOnly`), never document data. The one thing the
  editor remembers on its own is the theme mode, a UI preference (opt out with `themeToggle={false}`).
- **Observables, not callbacks.** Any number of consumers subscribe; the instance never learns who.
- **The editor edits a running program.** `editor.instance` is a core `ProgramInstance`: the same
  object a host runs headless. Where it comes from is the `Connection`'s business - a private
  stack, a host's runtime, or a program the host already runs, in-process or through a
  `@dendrite-lang/link` replica - and the editor cannot tell which.
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
