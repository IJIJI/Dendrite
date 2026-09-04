import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages serves project sites under /<repo>/ - CI sets PLAYGROUND_BASE to the
  // deploy path. Local dev/build stays at the default root.
  base: process.env.PLAYGROUND_BASE ?? "/",
  resolve: {
    // Consume the language AND editor SOURCE (not the workspace-linked dist) so edits to
    // either package HMR straight into the playground - it doubles as their dev harness.
    alias: {
      "@dendrite-lang/core": fileURLToPath(
        new URL("../../packages/core/src/index.ts", import.meta.url),
      ),
      "@dendrite-lang/editor": fileURLToPath(
        new URL("../../packages/editor/src/index.ts", import.meta.url),
      ),
    },
  },
});
