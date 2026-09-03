import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  // GitHub Pages serves project sites under /<repo>/ - CI sets PLAYGROUND_BASE=/Dendrite/.
  // Local dev/build stays at the default root.
  base: process.env.PLAYGROUND_BASE ?? "/",
  resolve: {
    // Consume the language SOURCE (not dist) so edits to ../src HMR straight into the
    // playground - it doubles as the language's dev harness.
    alias: {
      "@dendrite-lang/core": fileURLToPath(new URL("../src/index.ts", import.meta.url)),
    },
    // ../src imports "zod"; the repo root has no node_modules (PnP), so force zod to
    // resolve from THIS project's node_modules regardless of the importer's location.
    dedupe: ["zod"],
  },
  server: {
    fs: {
      // Allow serving the language source one level up from the Vite root.
      allow: [".."],
    },
  },
});
