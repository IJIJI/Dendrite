import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves project sites under /<repo>/ - CI sets PLAYGROUND_BASE to the
  // deploy path. Local dev/build stays at the default root.
  base: process.env.PLAYGROUND_BASE ?? "/",
  resolve: {
    // Consume the language AND editor SOURCE (not the workspace-linked dist) so edits to
    // either package HMR straight into the playground - it doubles as their dev harness.
    // Bare names match EXACTLY (regex), so other subpaths (./style.css) resolve through the
    // package's exports map instead of being rewritten under src/index.ts.
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
});
