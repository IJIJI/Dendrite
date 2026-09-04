# Dendrite Playground

A fully client-side playground for the Dendrite language: a CodeMirror editor with
lexer-driven syntax highlighting and inline diagnostics, an inputs panel generated from
the language descriptor, and live (incrementally re-evaluated) outputs.

```sh
yarn                                    # once, at the repo root (one workspace install)
yarn workspace dendrite-playground dev  # http://localhost:5173
```

## How it's wired

- A workspace member of the Dendrite monorepo (`apps/playground`); `@dendrite-lang/core` is
  a `workspace:^` dependency.
- Consumes the language **source** (`packages/core/src/index.ts` via a Vite/TS alias that
  overrides the workspace link), so editing the language hot-reloads the playground — it
  doubles as Dendrite's dev harness.

## Layout (the layering matters)

- `src/lang/` — **framework-free** modules, the seed of the future `@dendrite-lang/editor`:
  - `session.ts` — compile/run loop (Environment + runner + input values)
  - `tokens.ts` — highlighting classes from the language's own `tokenise`
  - `cm.ts` — the only CodeMirror-aware file (decorations + lint squiggles)
  - `input-widgets.ts` — `descriptor.inputs` → widget descriptions
- `src/ui/` — throwaway vanilla-DOM shell (replaced by React when the editor era starts)
- `src/examples.ts` — presets; each registers its own inputs/outputs/types via `setup()`

## Documents & share URLs

The session state is a **document** — `{ program, surface, inputValues }` (`EditorDocument` in
`@dendrite-lang/editor`): a core `SavedProgram` (the host-envelope pattern from
`.docs/architecture.md`; today always code-form) plus the language's inputs/outputs/types as data
(`SurfaceSpec`) and the values the program is evaluated against. Decoding runs the document
through `migrateDocument`, so envelope changes get a per-version migration rather than breaking
old links. The URL fragment always holds the
current document (deflate + base64url, live-updated on every debounced edit), so **copying the
address bar — or the Share button — shares the exact program, surface, and inputs**. Examples are
just preset documents; `…/#<exampleId>` (e.g. `#tally`) works as a one-shot entry link that loads
the preset and converts to a payload URL. Loading a preset pushes a history entry, so Back restores
your previous document. localStorage keeps a single fallback slot for hash-less visits.

## Known limitations (MVP)

- Input _declarations_ come from the document's surface (presets), not yet from the UI
  (backlogged in `.docs/todo.md` — the surface-as-data structure is ready for it).
