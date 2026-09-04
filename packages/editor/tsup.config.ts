import { defineConfig } from "tsup";

// Browser library over CodeMirror: ESM only. Dependencies and the core peer stay external.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
});
