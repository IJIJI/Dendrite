# Dendrite Playground

A fully client-side playground for the Dendrite language: a CodeMirror editor with
lexer-driven syntax highlighting and inline diagnostics, an inputs panel generated from
the language descriptor, and live (incrementally re-evaluated) outputs.

```sh
cd playground
yarn        # own install - this is a standalone nested project (node_modules linker)
yarn dev    # http://localhost:5173
```

## How it's wired

- Consumes the language **source** (`../src/index.ts` via a Vite/TS alias), so editing the
  language hot-reloads the playground — it doubles as Dendrite's dev harness.
- The repo root is Yarn PnP; this project deliberately has its own `.yarnrc.yml`
  (`nodeLinker: node-modules`) + lockfile so Vite gets a plain dependency tree.

## Layout (the layering matters)

- `src/lang/` — **framework-free** modules, the seed of the future `@dendrite-lang/editor`:
  - `session.ts` — compile/run loop (Environment + runner + input values)
  - `tokens.ts` — highlighting classes from the language's own `tokenise`
  - `cm.ts` — the only CodeMirror-aware file (decorations + lint squiggles)
  - `input-widgets.ts` — `descriptor.inputs` → widget descriptions
- `src/ui/` — throwaway vanilla-DOM shell (replaced by React when the editor era starts)
- `src/examples.ts` — presets; each registers its own inputs/outputs/types via `setup()`

## Documents & share URLs

The session state is a **document** — `{ program, surface, values }`: a core `SavedProgram`
(the host-envelope pattern from `.docs/architecture.md`; today always code-form) plus the
language's inputs/outputs/types as data (`lang/surface.ts`) and the current input values. The URL fragment always holds the
current document (deflate + base64url, live-updated on every debounced edit), so **copying the
address bar — or the Share button — shares the exact program, surface, and inputs**. Examples are
just preset documents; `…/#<exampleId>` (e.g. `#tally`) works as a one-shot entry link that loads
the preset and converts to a payload URL. Loading a preset pushes a history entry, so Back restores
your previous document. localStorage keeps a single fallback slot for hash-less visits.

## Known limitations (MVP)

- Input _declarations_ come from the document's surface (presets), not yet from the UI
  (backlogged in `.docs/todo.md` — the surface-as-data structure is ready for it).
