import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Test against the core SOURCE (like the playground does), so `yarn test` never depends
    // on a prior core build.
    alias: {
      "@dendrite-lang/core": fileURLToPath(new URL("../core/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
  },
});
