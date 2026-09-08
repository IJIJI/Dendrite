import { unified } from "@astrojs/markdown-remark";
import react from "@astrojs/react";
import starlight from "@astrojs/starlight";
import { defineConfig, passthroughImageService } from "astro/config";
import { fileURLToPath, URL } from "node:url";

import { remarkDen } from "./src/plugins/remark-den";

//? The docs site: Starlight at the root, the playground beside it under /playground/ (the
// Pages workflow assembles the two builds). `.ts` rather than `.mjs` for the same reason the
// playground's Vite config is: it reads process.env, which the root ESLint config resolves
// through @types/node for TS files and would flag as undefined in plain JS.

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  site: "https://ijiji.github.io",
  // GitHub Pages serves project sites under /<repo>/ - CI sets DOCS_BASE. Dev stays at /.
  base: process.env.DOCS_BASE ?? "/",
  // Only SVGs so far; the default service wants sharp for nothing.
  image: { service: passthroughImageService() },
  // ```den fences and `…{:den}` inline code, highlighted by the editor's own lexer. Astro 7's
  // default Markdown processor takes no remark plugins, so the unified pipeline is chosen
  // explicitly - it is the one Starlight's own plugins use. User plugins run before
  // Starlight's Expressive Code, which then leaves them alone.
  markdown: { processor: unified({ remarkPlugins: [remarkDen] }) },
  integrations: [
    starlight({
      title: "Dendrite",
      logo: {
        light: "./src/assets/dendrite-wordmark.svg",
        dark: "./src/assets/dendrite-wordmark-dark.svg",
        replacesTitle: true,
      },
      favicon: "/favicon.svg",
      // The editor's stylesheet is global: its .tok-* classes colour every Dendrite snippet
      // on the site (DenCode), and its --dendrite-* tokens follow color-scheme, so the
      // islands and the snippets flip with Starlight's theme.
      customCss: ["@dendrite-lang/editor/style.css", "./src/styles/dendrite.css"],
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/IJIJI/Dendrite" }],
      // The social links open in a new tab (Starlight's own component, one attribute added).
      components: { SocialIcons: "./src/components/SocialIcons.astro" },
      // Sidebar labels are plain text, so a label that is CODE - `stdlib` - is marked from a
      // script rather than markup; dendrite.css sets it in Kode Mono. Runs before first paint.
      head: [
        {
          tag: "script",
          content:
            'document.addEventListener("DOMContentLoaded",()=>{for(const s of document.querySelectorAll(".sidebar-content summary .large"))if(s.textContent.trim()==="stdlib")s.classList.add("mono")})',
        },
      ],
      sidebar: [
        // Since Starlight 0.39 `autogenerate` is an ITEM inside a labelled group, never a
        // group by itself - so every section names itself here and lists what it holds.
        // Two readers: a USER writes programs (Learn, then stdlib); a HOST DEVELOPER embeds
        // the language (Host developers, which also holds the packages).
        {
          label: "Learn",
          items: [
            "learn/getting-started",
            {
              label: "Writing programs",
              items: [{ autogenerate: { directory: "learn/writing" } }],
            },
            {
              label: "How it works",
              items: [{ autogenerate: { directory: "learn/how-it-works" } }],
            },
            { label: "Examples", items: [{ autogenerate: { directory: "learn/examples" } }] },
          ],
        },
        { label: "stdlib", items: [{ autogenerate: { directory: "stdlib" } }] },
        {
          label: "Host developers",
          items: [
            "host/installation",
            "host/embedding-core",
            "host/extending-the-language",
            { label: "Packages", items: [{ autogenerate: { directory: "host/packages" } }] },
          ],
        },
        { label: "Contribute", items: [{ autogenerate: { directory: "contribute" } }] },
      ],
    }),
    react(),
  ],
  vite: {
    resolve: {
      // Consume the language AND editor SOURCE (not the workspace-linked dist), exactly as the
      // playground does, so edits to either package HMR straight into the docs. Bare names
      // match EXACTLY (regex), so other subpaths (./style.css) resolve through the package's
      // exports map instead of being rewritten under src/index.ts.
      alias: [
        {
          find: "@dendrite-lang/editor/react",
          replacement: source("../../packages/editor/src/react/index.tsx"),
        },
        {
          find: /^@dendrite-lang\/editor$/,
          replacement: source("../../packages/editor/src/index.ts"),
        },
        { find: /^@dendrite-lang\/core$/, replacement: source("../../packages/core/src/index.ts") },
      ],
    },
  },
});
