# The documentation site — plan

> **Status: built 2026-09-09** (`apps/docs`, Astro 7 + Starlight 0.42), empty - the language
> CONTENT is written afterwards, page by page, into the skeleton; that plan is `todo.md`,
> "Document the core language (two levels)", and the notes from the first look at the empty
> site are there under "Docs — content notes". What settled while building, beyond this plan:
> op examples are `SavedProgram`s written with a `den` tagged template (multi-line, dedented,
> rete-ready) and the reference RUNS each one, showing what it produced; Dendrite in Markdown
> (` ```den ` fences, `{:den}` inline) and in the ops signatures is highlighted through the
> editor's own lexer (`styledRanges`), not a Shiki grammar; the ops reference is one MDX page
> per segment; the config is `astro.config.ts` with the unified Markdown processor declared;
> images pass through (no sharp); sections are Learn (a path) · `stdlib` · Host developers
> (with Installation and the packages) · Contribute. The docs' example block (read-only code,
> settable inputs, live outputs) is `todo.md`, "the example layout".

## Context

The deployed root (`ijiji.github.io/Dendrite/`) is a redirect placeholder that forwards to the
playground under `/playground/`, reserved since the first deploy for a docs site. Everything that
would have made docs age out has landed - ports and layers, the instance, connections, the link -
and `@dendrite-lang/core@0.1.0` should arrive documented. So: build the site now, empty, and fill
it.

## Decisions

| Point | Decision | Why |
|---|---|---|
| Framework | **Astro + Starlight**, in `apps/docs` | Content-first MD/MDX; React islands for a live editor; Vite underneath so the workspace source aliases carry over; zero JS on prose pages; Pagefind search; CSS-variable theming the brand tokens map onto. Docusaurus was the runner-up (React end-to-end, built-in versioning we don't need before 1.0); VitePress is Vue and fights the React editor. |
| Layout on Pages | Docs at `/Dendrite/`, playground stays at `/Dendrite/playground/` | Share links encode the document in the `#` under `/playground/`; nothing moves. The redirect page retires, and the few days the playground spent at the root get no forward. |
| Local dev | Two dev servers, each at `/` | The playground on `:5173`, the docs on `:4321`. Live examples in the docs import the editor directly, so the docs never need the playground server. |
| Audiences → sections | **Learn** (users) · **Standard Library** (reference) · **Integrate** (host developers) · **Contribute** (later) | Audience-first. Getting-started per audience; Examples under Learn; a changelog once 0.1.0 ships. |
| Op text | `OpDefinition.description?` and `examples?: readonly string[]` **in core**, on the stdlib | One source for the reference page, for editor hover later, and for a test that compiles every example so it cannot rot. Docs-only prose stays in MDX around the generated table. |
| Ops reference | Generated **at build time** from `createStdlib()`'s descriptor | Never stale, nothing to commit; the descriptor is the review. |
| Landing | Splash, TypeScript-style: wordmark, tagline, two calls to action, three feature cards, one code sample | The README and the site say the same thing. |
| Live examples | React **islands** (`client:only`), with **open in playground** | No iframe mode until a site outside this repo wants to embed. |
| Embed editor | A `compact` layout, an enlarge-to-page toggle (fixed overlay, NOT the Fullscreen API), responsive CSS | Its own step, right after the skeleton - editor work, walked in the browser. The compact layout is the first step of mobile support; full mobile later. |
| Contributor docs | Later. `.docs/` stays the maintainer folder until moving it is the priority | The site is their right home eventually; not now. |
| Versioning | None before 1.0 | One live tree; `starlight-versions` exists if ever needed. |

## The site

```
apps/docs/
  astro.config.mjs     starlight(); react(); base = DOCS_BASE ?? "/"; site; the same source aliases as the playground
  src/styles/dendrite.css   --sl-* mapped onto the brand tokens; fonts via @fontsource (Archivo, IBM Plex Mono, Kode Mono)
  src/components/Live.tsx   <Editor document> + DefaultLayout (since 2026-09-10: FullLayout, then the Minimal / Compact presets) in a fixed-height box; "open in playground" link
  src/pages/stdlib/ops.astro   StarlightPage; walks descriptor.ops by category → signature, description, examples
  src/content/docs/
    index.mdx                 the splash
    learn/       getting-started · the-chain · language/{syntax, types, ports-and-layers, evaluation} · examples/ · glossary
    stdlib/      index (prose)  + the generated ops page beside it
    integrate/   getting-started · embedding-core · extending-the-language · the-editor · the-link
    contribute/  index (points at the repo's .docs for now)
```

Every page under `learn/` and `integrate/` ships as a one-paragraph **stub** stating what the page
will cover, so the shape is reviewable before the prose. `PUBLIC_PLAYGROUND_URL` is the one env
var: `http://localhost:5173/` in dev, `/Dendrite/playground/` in CI.

## Steps

| # | Commit | Contents | Gate | Est. |
|---|---|---|---|---|
| 1 | core: op descriptions and examples | `OpDefinition.description?` / `examples?`; `extendLanguage` already copies definitions whole; one line + one example per stdlib op; `stdlib/examples.test.ts` compiles every example | core tests | ½ day |
| 2 | docs: the app | Scaffold, brand theme, fonts, navigation, stubs, splash. `typecheck` = `astro check`; prettier-plugin-astro; eslint ignores `.astro` | `yarn typecheck`, `yarn build`, browser at `/` | ½ day |
| 3 | docs: reference + live example | The generated ops page; `<Live>` island rendering a preset with open-in-playground | build; browser | 2 h |
| 4 | ci: one Pages workflow | `pages.yml` replaces `playground.yml`: build both apps, assemble `site/` (docs at root, `playground/` beside), path filters for both apps and every package; retire `.github/pages/index.html`; README link unchanged | deploy from `main`; both URLs walked | 2 h |
| 5 | editor: the embed | `compact` layout + enlarge-to-page + responsive CSS; `<Live>` switches to it | editor tests; browser at docs and playground | ½ day |

Then the content: `todo.md`, "Document the core language", page by page into the skeleton -
and `@dendrite-lang/core@0.1.0` after it.

## Verification

Gates at the root as always. Browser: the docs dev server at `/` (splash, a stub page, the ops
page, the live island editing and opening in the playground); the playground unchanged; after
step 4, both deployed URLs and an old share link.

## Patterns and smells

| Pattern / smell | Where |
|---|---|
| Single source of truth | op text on the definition, read by the reference and by hover later |
| Composition over configuration | the island composes editor components, as the playground does |
| Speculative Generality - avoided | no iframe mode, no versioning, no contributor migration yet |
| Divergent Change - avoided | one Pages workflow, one assembly of `site/` |
