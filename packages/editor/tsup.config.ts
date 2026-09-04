import { defineConfig } from "tsup";

// Browser library over CodeMirror: ESM only. Two entries - the headless core and the React
// compound components (subpath ./react, so React loads only when a host imports it).
// Dependencies and peers (core, react) stay external.
export default defineConfig({
  entry: { index: "src/index.ts", "react/index": "src/react/index.tsx" },
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
});
