import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages serves project sites under /<repo>/ - CI sets PLAYGROUND_BASE to the
  // deploy path. Local dev/build stays at the default root.
  base: process.env.PLAYGROUND_BASE ?? "/",
  resolve: {
    // Consume the language SOURCE (not the workspace-linked dist) so edits to
    // packages/core/src HMR straight into the playground - it doubles as the language's
    // dev harness.
    alias: {
      "@dendrite-lang/core": fileURLToPath(
        new URL("../../packages/core/src/index.ts", import.meta.url),
      ),
    },
  },
});
