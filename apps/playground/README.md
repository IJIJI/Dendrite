# Dendrite Playground

A fully client-side playground for the Dendrite language: a CodeMirror editor with
lexer-driven syntax highlighting and inline diagnostics, an inputs panel generated from
the language descriptor, and live (incrementally re-evaluated) outputs.

```sh
yarn                                    # once, at the repo root (one workspace install)
yarn workspace dendrite-playground dev  # http://localhost:5173
```

## How it's wired

- A workspace member of the Dendrite monorepo (`apps/playground`); `@dendrite-lang/core` and
  `@dendrite-lang/editor` are `workspace:^` dependencies.
- Consumes both packages' **source** (`packages/*/src/index.ts` via a Vite/TS alias that
  overrides the workspace links), so editing the language or the editor hot-reloads the
  playground — it doubles as their dev harness.

## Layout

The playground is a **host** of `@dendrite-lang/editor` (see that package's README): it mounts
`createEditor`, renders panes from the session's observables, and owns persistence and routing
policy. Nothing here knows CodeMirror or the language internals.

- `src/ui/main.ts` — the host: mount/dispose per document, stores (URL as the source of truth,
  localStorage as a single-slot fallback), preset entry links, Back/Forward, Share.
- `src/ui/panes.ts` — vanilla-DOM pane renderers (data in, DOM out); the React UI replaces this
  file in the next phase.
- `src/examples.ts` — presets as documents: `doc(source, surface)`.

## Documents & share URLs

The session state is a **document** — `{ version, program, surface, inputValues }`
(`EditorDocument` in `@dendrite-lang/editor`): a core `SavedProgram` (the host-envelope pattern
from `.docs/architecture.md`; today always code-form) plus the language's inputs/outputs/types as
data (`SurfaceSpec`) and the values the program is evaluated against. Decoding runs the document
through `migrateDocument`, so envelope changes get a per-version migration rather than breaking
old links.

The URL fragment always holds the current document (deflate + base64url, live-updated on every
debounced edit), so **copying the address bar — or the Share button — shares the exact program,
surface, and inputs**. Examples are just preset documents; `…/#<exampleId>` (e.g. `#tally`) works
as a one-shot entry link that loads the preset and converts to a payload URL. Loading a preset
pushes a history entry, so Back restores your previous document. localStorage keeps a single
fallback slot for hash-less visits.

## Known limitations (MVP)

- Input _declarations_ come from the document's surface (presets), not yet from the UI
  (`.docs/editor-plan.md` Phase 3 — the surface-as-data structure is ready for it).
