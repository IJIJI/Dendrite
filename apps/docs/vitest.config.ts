import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

// The docs' own suite: it loads every Dendrite sample on the site through the real pipeline,
// so a sample cannot rot (src/content/content.test.ts). The core alias mirrors the one in
// astro.config.ts - without it the test resolves the workspace's built dist and would need a
// package build first.
export default defineConfig({
  resolve: {
    alias: {
      "@dendrite-lang/core": fileURLToPath(
        new URL("../../packages/core/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
