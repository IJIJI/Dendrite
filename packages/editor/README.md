# @dendrite-lang/editor

The Dendrite editor, headless: everything an editor needs except a UI framework. A host mounts
`createEditor` into an element, renders its panes from the session's observables, and owns
persistence and routing. The React UI (`@dendrite-lang/editor/react`) comes next and is the only
place React is allowed.

## Use

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

## Modules (all framework-free)

| Module               | Role                                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `editor.ts`          | `createEditor` - the lifecycle Facade: language copy + surface, session, CodeMirror view, debounced compile, lint, `onChange` |
| `session.ts`         | `EditorSession` - compile/run one program; publishes `diagnostics` / `outputs` / `inputs` as observables                      |
| `observable.ts`      | `createSubject`, `watch` - the only reactive primitive (React's external-store contract)                                      |
| `document.ts`        | `EditorDocument` (`version`, `program`, `surface`, `inputValues`); `migrateDocument` over an `applyMigrations` chain          |
| `surface.ts`         | `SurfaceSpec` - types/inputs/outputs as JSON data; `applySurface`                                                             |
| `store.ts`           | `DocumentStore` + `MemoryStore` / `LocalStorageStore` / `UrlStore` (adapters never reject)                                    |
| `permalink.ts`       | document ↔ URL payload (deflate + base64url, native streams)                                                                  |
| `tokens.ts`, `cm.ts` | lexer-driven highlighting; `cm.ts` + `editor.ts` are the only CodeMirror-aware modules                                        |
| `input-widgets.ts`   | descriptor inputs → widget shapes, plus the one shared initial-value rule                                                     |

## Principles

- **The host owns persistence and policy.** The editor emits `onChange`; a host wires one store
  (a Composite if it needs several backends) and decides autosave versus an explicit save.
- **Observables, not callbacks.** Any number of consumers subscribe; the session never learns who.
- **The document is self-contained and versioned.** `applyMigrations` is generic on purpose so a
  host envelope can chain its own versions the same way.
- **`@dendrite-lang/core` is a peer dependency.** Two copies would break `instanceof EvalError`
  and descriptor identity.

## Develop

Part of the Dendrite workspace. `yarn workspace @dendrite-lang/editor run test` runs the suite in
plain Node (no DOM); `createEditor` itself is exercised through the playground, which aliases this
package's source for HMR. Build: ESM + `.d.ts` via tsup.
