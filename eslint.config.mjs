// @ts-check
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      // Build output and installs at any depth - every workspace has its own dist/.
      "**/dist/**",
      "**/node_modules/**",
      ".yarn/**",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  // React: the hooks rules wherever components are written.
  { ...reactHooks.configs.flat.recommended, files: ["**/*.tsx"] },
  // Boundary: the editor's headless core stays framework-free - React only under src/react/.
  {
    files: ["packages/editor/src/**/*.{ts,tsx}"],
    ignores: ["packages/editor/src/react/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react-dom", "react/*", "react-dom/*"],
              message:
                "React is only allowed under packages/editor/src/react/ - the headless core stays framework-free.",
            },
          ],
        },
      ],
    },
  },
);
