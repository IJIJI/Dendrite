import { defineConfig } from "vitest/config";

// Test discovery is restricted to source so build artifacts (dist/) and examples can
// never pollute the suite — a stray `tsc` emit once double-ran compiled test copies.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
