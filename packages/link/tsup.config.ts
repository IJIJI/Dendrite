import { defineConfig } from "tsup";

// Isomorphic library: runs in a browser (the replica) and in node (the serving host). ESM
// only, one entry; core stays external.
export default defineConfig({
  entry: { index: "src/index.ts" },
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
});
