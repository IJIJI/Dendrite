# Dendrite docs

The documentation site: [Astro](https://astro.build) + [Starlight](https://starlight.astro.build),
deployed at the root of `ijiji.github.io/Dendrite/` with the playground beside it under
`/playground/` (`.github/workflows/pages.yml` builds and assembles both).

```sh
yarn                                    # once, at the repo root (one workspace install)
yarn workspace dendrite-docs dev        # http://localhost:4321
yarn workspace dendrite-docs build      # dist/; `preview` serves it
yarn workspace dendrite-docs typecheck  # astro check
```

The site bundles the language and editor SOURCE through Vite aliases (`astro.config.ts`), so
edits to either package show up here without a package build. Live examples open in the
playground at `PUBLIC_PLAYGROUND_URL` (`http://localhost:5173/` when unset).

## Where things are

- `src/content/docs/` — the pages: `index.mdx` (the splash), `learn/`, `stdlib/`, `host/`,
  `contribute/`. Sections and their order live in the sidebar in `astro.config.ts`.
- `src/components/OpsReference.astro` — one stdlib segment, generated from the descriptor at
  build time: signature, description, and every example, run.
- `src/lib/den-parts.ts`, `src/plugins/remark-den.ts`, `src/components/DenCode.astro` —
  Dendrite highlighted by the editor's own lexer: ` ```den ` fences and `` `…{:den}` `` inline
  code in Markdown, `<DenCode code=… />` in `.astro` templates.
- `src/components/Live.tsx` — a live example: the editor in the page, with "open in playground".
- `src/styles/dendrite.css` — the brand tokens mapped onto Starlight's `--sl-*` variables, fonts,
  and the snippet styles.
