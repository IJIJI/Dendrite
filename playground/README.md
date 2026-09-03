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

## Known limitations (MVP)

- Comments aren't highlighted (the lexer discards them; highlighting is token-driven).
- Program source persists to localStorage per example; there's no save/load beyond that.
- Input *declarations* come from the selected example, not the UI.
