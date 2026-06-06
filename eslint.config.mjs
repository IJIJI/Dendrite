// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
    { ignores: ["dist/**", "node_modules/**", ".yarn/**", ".pnp.cjs", ".pnp.loader.mjs"] },
    js.configs.recommended,
    tseslint.configs.recommended,
    {
        files: ["**/*.ts"],
        languageOptions: {
            parserOptions: {
                projectService: true,
            },
        },
        rules: {
            "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
            "@typescript-eslint/no-explicit-any": "warn",
        },
    },
);
