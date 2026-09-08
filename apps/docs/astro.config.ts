import react from "@astrojs/react";
import starlight from "@astrojs/starlight";
import { defineConfig, passthroughImageService } from "astro/config";
import { fileURLToPath, URL } from "node:url";

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
  integrations: [
    starlight({
      title: "Dendrite",
      logo: {
        light: "./src/assets/dendrite-wordmark.svg",
        dark: "./src/assets/dendrite-wordmark-dark.svg",
        replacesTitle: true,
      },
      favicon: "/favicon.svg",
      customCss: ["./src/styles/dendrite.css"],
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/IJIJI/Dendrite" }],
      sidebar: [
        // Since Starlight 0.39 `autogenerate` is an ITEM inside a labelled group, never a
        // group by itself - so every section names itself here and lists what it holds.
        {
          label: "Learn",
          items: [
            "learn/getting-started",
            "learn/the-chain",
            { label: "Language", items: [{ autogenerate: { directory: "learn/language" } }] },
            { label: "Examples", items: [{ autogenerate: { directory: "learn/examples" } }] },
            "learn/glossary",
          ],
        },
        { label: "Standard Library", items: [{ autogenerate: { directory: "stdlib" } }] },
        { label: "Integrate", items: [{ autogenerate: { directory: "integrate" } }] },
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
