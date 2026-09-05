# Editor Build-Out Plan

Settled 2026-09-04. The canonical plan for growing the playground's framework-free modules into
`@dendrite-lang/editor` and shipping ONE editor component to every host: the playground, the docs
embed, and Beacon. Supersedes the "Editor era", "React switch", "user-settable inputs/outputs" and
"playground lint" entries in `todo.md` (they point here).

---

## Decisions (settled — do not reopen without a new driver)

| Decision | Choice | Why |
|---|---|---|
| **Repo** | Monorepo for all Dendrite packages; Beacon stays in its own repo and consumes published packages | Editor work surfaces core gaps constantly (spans, error nodes, language service); a publish step inside that loop is the worst place for one. Splitting a package out later is cheap; merging drifted repos is not. Separate *pipelines* come from path filters, not repos. |
| **Linker** | Root switches Yarn PnP → `nodeLinker: node-modules` | The nested playground (own lockfile + linker, `dedupe: ["zod"]`, `fs.allow: [".."]`) was a PnP escape hatch. Three web apps and two UI toolchains would each need one. |
| **Package** | ONE `@dendrite-lang/editor`, with a `@dendrite-lang/editor/react` subpath | One version, one release, one README. React only loads via `/react` (optional `peerDependency`). Boundary enforced by ESLint `no-restricted-imports`. **Split trigger: a second framework wrapper** (Vue…). |
| **UI** | Headless core + React UI (Bridge + Observer) | Editor state lives in framework-free per-pane models with `subscribe`; React components hold *view* state only. Vue later ≈ 1–2 days of render code; without the discipline ≈ a rewrite. No vanilla pane implementation — non-React hosts use the iframe embed. |
| **Tiers** | None. One component + config presets (`playground` / `docs` / `host`) | "Full editor" == the Beacon embed on more platforms; there is no separate studio app. Playground = reference host + dev harness. |
| **Read-only** | No such flag | Docs snippets are editable (better docs); static code blocks are the docs framework's job. Speculative Generality. |
| **Surface ownership** | `surface.provided` (host-owned outputs) + `surface.userInputs: boolean` | "Locked" was the wrong model — the real question is *who supplies a value at runtime*. Outputs are host-owned when a host surface exists (correctness); user-declared inputs are a flag Beacon can flip on later. |
| **Saving / history** | Editor emits `onChange(doc)`; optional `save` config renders button + status; store adapters are a convenience export; history = Memento, later | Host owns persistence. Capability by presence (ISP). |
| **Publish** | `@dendrite-lang/core@0.1.0` after Phase 3 ("editor + some polishes") | The extraction is the first real external consumer of core's API — publish after it, not before. |
| **Pages** | Playground moves to `/Dendrite/playground/` in Phase 0; a root `index.html` forwards `location.hash` | Docs take the root in Phase 4 without breaking share links. |
| **Envelope** | v1 = `{ version, program, surface, inputValues }`; `migrateDocument` chains per-retired-version steps (`applyMigrations`, table empty until v1 is retired) and delegates the program to core's `migrate()`; `id`/`meta` added later as *optional* fields (no bump needed) | Only renames force a version bump; optional additions are backward-compatible. `inputValues` names what they are, not how a host uses them; `version` matches core's `SavedProgram.version`. The playground's earlier `{ v, values }` shape was never deployed, so both renames folded into v1 with no migration. |

---

## Target layout

```
Dendrite/                      monorepo, nodeLinker: node-modules, one lockfile
  package.json                 private workspace manifest; shared tooling devDeps; fan-out scripts
  tsconfig.base.json           shared compilerOptions (incl. TS 6 ignoreDeprecations)
  packages/
    core/                      @dendrite-lang/core   (src/ + examples/ moved here, pure move)
    editor/                    @dendrite-lang/editor (+ /react subpath, + /style.css)
  apps/
    playground/                thin host (moved from playground/)
    docs/                      Phase 4
  .github/pages/index.html     hash-forwarding redirect for the Pages root
```

Root scripts fan out topologically: `yarn workspaces foreach -At run <script>` (core builds before
the editor's dts). Each package typechecks against core *source* via `paths`, so `typecheck` needs
no build. Vite aliases `@dendrite-lang/core`, `@dendrite-lang/editor` and `/react` to source so
language *and* editor edits HMR into the playground.

---

## Phase 0 — Workspace conversion (pure mechanics, zero behaviour change)

**Landed 2026-09-04.** Notes from doing it: git recorded the moves as 54 100%-similarity renames;
root-only tooling bins reach workspace scripts ONLY by PATH inheritance from a root script
(`foreach`) — `yarn workspace <x> run typecheck` fails cold — so each package declares its own
build/test tooling (`typescript`, `tsup`, `vitest`…) and the root keeps just repo-wide
lint/format (found + fixed in Phase 1);
`workspaces foreach --all` does not recurse into the root; the playground's first-ever lint pass
had zero findings, so the planned separate lint commit folded into the move; the Pages redirect
was verified against a local `/Dendrite/`-prefixed server with both an alias link and an
existing payload link.

Commits contain relocation + the config lines required to stay green — **no source content
changes**. Anything spotted en route is listed for a later commit, not fixed in the move.

| Step | Detail |
|---|---|
| Linker + manifest | New root `.yarnrc.yml` (`nodeLinker: node-modules`); root `package.json` → `private`, `workspaces: ["packages/*", "apps/*"]`, shared tooling devDeps, fan-out scripts; one regenerated `yarn.lock` |
| Move core | `git mv src packages/core/src`, `git mv examples packages/core/examples`; core manifest = the old root manifest; `tsconfig`/`tsup`/`vitest` configs move with it; `tsconfig.base.json` at root |
| Move playground | `git mv playground apps/playground`; **delete** its `.yarnrc.yml`, `yarn.lock`, `.yarn/`; dep → `"@dendrite-lang/core": "workspace:^"`; Vite alias → `../../packages/core/src/index.ts`; **delete** `dedupe` + `fs.allow` hacks |
| Lint | Root ESLint drops the `playground/**` ignore (closes the "playground lint" backlog item) |
| CI | All workflows use the shared setup action against the root lockfile; **delete `playground-check.yml`** (root `typecheck`/`build` now fan out to it — Dead Code); `playground.yml` paths → `apps/playground/**`, `packages/core/**`; build with `PLAYGROUND_BASE=/Dendrite/playground/` into `site/playground/` + copy the redirect to `site/index.html`; upload `site/` |

**Gate:** `yarn typecheck` · `yarn lint` · `yarn test` (252) · `yarn build` all green from the root;
playground behaves identically (share URLs, presets, Back). Existing `#…` links resolve via the
redirect.

---

## Phase 1 — Extract `@dendrite-lang/editor` (framework-free only)

**Landed 2026-09-04** (seven commits plus a tooling fix). Notes from doing it:
`extendLanguage(createLanguage(), base)` is the non-mutating copy, so a document's surface never
touches a host's language; `subscribe` is changes-only, so vanilla hosts paint with `watch`
(get + subscribe) — the editor has already compiled when they attach; the observables live on
the session (separate model factories would have been Middle Men); `UrlStore` sequences async
writes last-write-wins (the old `disposed` guard, generalised and tested); the envelope shipped
as v1 `{ version, program, surface, inputValues }` with an empty migration chain because nothing
had been deployed; `editor.ts` is deliberately untested (DOM composition — the playground is its
harness); the playground host ended at 165 lines with zero CodeMirror or core imports.

No React, and **no vanilla panes** (writing panes here only to delete them in Phase 2 is
Speculative Generality). The playground keeps its vanilla shell through this phase.

| Moves in | Stays in the app |
|---|---|
| `session` · `tokens` · `cm` · `input-widgets` · `surface` · `document` (→ `EditorDocument`) · `permalink` (→ `UrlStore`) | `examples` (playground content) · `ui/` (its shell, until Phase 2) |

**New:**

```ts
createEditor(el, config): EditorHandle            // imperative mount, framework-free

interface EditorConfig {
  document: EditorDocument;
  language?: Language;                             // default createStdlib(); Beacon passes its extended one
  mode?: "code";                                   // "rete" | "dual" later
  surface?: { provided?: SurfaceSpec; userInputs?: boolean };
  panes?:   { inputs?: boolean; outputs?: boolean; diagnostics?: boolean };
  actions?: { share?: boolean; save?: boolean; openInPlayground?: string };
  onChange?(doc: EditorDocument): void;
  save?:    { onSave(doc: EditorDocument): Promise<void>; status?: SaveStatus };
}
```

- **Presets** `PRESETS.playground` / `docs` / `host` — plain objects a host spreads (Strategy as data).
- **Models** (Observer): `createInputsModel` / `createOutputsModel` / `createDiagnosticsModel`, each
  `{ state, actions, subscribe }`. DOM-free → unit-tested directly. Several small models observing
  the session, **not** one session pushing to panes (God-Object guard).
- **Store adapters** (Adapter + DIP): one interface; `UrlStore`, `LocalStorageStore`, `MemoryStore`
  (IndexedDb later). The playground's inlined URL + localStorage logic in `main.ts` *is* these
  adapters, just extracted.
- **Envelope**: `v`/`values` → `version`/`inputValues` folded into v1 (nothing had shipped);
  `migrateDocument` = `applyMigrations` chain (empty table, loop-guarded) + core `migrate()`.
- **Boundary**: ESLint `no-restricted-imports` bans `react`/`react-dom` outside `src/react/`.
- **Tests**: models + adapters + migration unit-tested; the playground stays the integration harness.

---

## Phase 2 — React UI (`@dendrite-lang/editor/react`)

| Ships | Notes |
|---|---|
| `<DendriteEditor config />` | ~50-line wrapper over `createEditor` (`useRef` + `useEffect` + prop sync) |
| TopBar · InputsPane · OutputsPane · DiagnosticsPane | Bind to Phase 1 models; **view state only** (Feature-Envy guard) |
| Save indicator + button | Rendered iff `config.save` is present |
| Error boundary | Replaces `renderBootFailure` |
| `@dendrite-lang/editor/style.css` + CSS custom properties | The CodeMirror convention; no CSS-in-JS (runtime dep, can't reach the framework-free canvas). Hosts theme by overriding variables. |
| Playground → React | Its shell was the throwaway layer by design |

The top bar is part of the editor and config-driven — not playground-exclusive. When `meta.name`
exists (post-release), it is what the top bar shows as the document title.

---

## Phase 3 — Surface editing, then publish

Add/remove/edit input + output declarations; type picker over registered named types + structural
arrays; validation UX for dangling type references (`boot_failed` rendering exists). Gated by
`surface.userInputs`; outputs stay host-owned when `surface.provided` exists.

**Per-input read-only shipped in Phase 2** as host policy on the pane
(`<Editor.Inputs readOnly={(name) => …}/>`) — deliberately NOT on the surface, because the same
surface is host-fed in Beacon and user-editable in the playground. What remains for this phase:
should inputs that come from `surface.provided` *default* to read-only? Decide with ownership.

**→ Publish `@dendrite-lang/core@0.1.0`.** Checklist: `repository.directory`, LICENSE + README
inside `packages/core` (npm packs from there), `publishConfig.access: public`, `files`/`exports`/
`sideEffects` (already present).

---

## Phase 4 — Docs site + embed preset

`PRESETS.docs` (minimal panes, no store, `openInPlayground` action encoding the *current* document)
· iframe embed mode · docs framework (React decision → Docusaurus is the natural fit) · op reference
generated from the descriptor · docs index inherits the hash-forward redirect for old share links.

---

## Backlog after this plan (see `todo.md`)

Language service (spans → error nodes → completions → signature help → hover → def/rename) ·
Rete mode · multi-document (+ `id`/`meta` on the envelope, optional, no bump) · history (Memento —
documents are already self-contained snapshots) · undo for surface/value edits (Command + Memento;
CodeMirror only undoes text) · VS Code extension as an LSP client of the language service.

---

## Design principles applied

| Principle / pattern | Where |
|---|---|
| **SRP** | Editor package = editing. Host app = persistence, routing, chrome placement. |
| **OCP** | New store = new adapter. New deployment = new preset. No edits inside the editor. |
| **ISP** | `save?`, `revisions?` optional — capability by presence, not one fat interface. |
| **DIP** | Editor depends on the store *interface*; the host injects the concrete adapter. |
| **Bridge** | Headless models ↔ React renderer vary independently. |
| **Observer** | Model `subscribe` — the mechanism that keeps editor state out of React. |
| **Adapter** | Store adapters; later the Rete adapter. |
| **Strategy** | Presets as data. |
| **Memento** | History (later). |
| Deliberately **not** used | Singleton (`createStdlib()` stays fresh per call), Builder for config, Abstract Factory, State classes for save status, Visitor over the closed AST union (the exhaustive `switch` is correct). |

## Smells this plan targets

| Smell | Evidence today | Guard |
|---|---|---|
| Long Method | `main.ts` `boot()` ~110 lines, `init()` ~65 — boot + routing + history + share + storage | Split across models (editor) and host wiring (app) |
| Divergent Change | `main.ts` changes for *any* reason | Editor/host split gives each one axis of change |
| Shotgun Surgery | A new widget type touches `input-widgets` + `panes` + `surface` | Widget registry keyed by `Type` |
| Primitive Obsession | `values: Record<string, unknown>` with two meanings across hosts | `inputValues` rename |
| Temporary Field | `let view: EditorView` assigned later + `prefer-const` disable | Session emits to a model; the CM extension subscribes — no forward reference |
| Message Chains | `view.state.doc.toString()` ×4 | One `currentSource()` on the canvas adapter |
| Duplicate Code | `localStorage.setItem(FALLBACK_KEY, …)` in `sync` and `dispose` | `LocalStorageStore` |
| Long Parameter List | `renderInputs(pane, widgets, getValue, setValue)` | The inputs model *is* those four things |
| Speculative Generality | Killed `readOnly` + the three-tier design | **Rule: no config flag without a named consumer** |
| Middle Man | `createEditor` becoming pure delegation | If a method only forwards, expose the model directly |
| Large Class / God Object | Session-as-Mediator | Per-pane models observe the session |
| Feature Envy | React components reaching into session internals | Components see models, never the session |
| Dead Code | `playground-check.yml` after fan-out scripts | Deleted in Phase 0 |

---

## Per-phase gate

Every phase ends with the standing workflow: **review passes → commit table (message + per-file
changelog) → `yarn typecheck` + `yarn lint`** (+ `yarn test`, `yarn build`).
