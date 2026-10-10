import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// The editor's surfaces are the brand's, and they are written twice: as --dendrite-* in
// style.css, which is what ships, and as --dn-editor-* in the brand's tokens, which is what
// the brand sheet reads. No build step ties the two files, so this does: a surface that
// changes in one of them and not in the other fails here.

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const style = read("../style.css");
// The tokens are one :root block, then the dark theme's overrides inside a media query.
const [root = "", dark = ""] = read("../../../brand/dendrite-tokens.css").split(
  "@media (prefers-color-scheme: dark)",
);

/** The editor's variable, and the brand token that mirrors it. */
const SURFACES = [
  ["--dendrite-bar", "--dn-editor-bar"],
  ["--dendrite-panel", "--dn-editor-page"],
  ["--dendrite-bg", "--dn-editor-canvas"],
  ["--dendrite-well", "--dn-editor-well"],
  ["--dendrite-hover", "--dn-editor-hover"],
] as const;

/** `--name: light-dark(#light, #dark)` in style.css, on one line or as prettier breaks it. */
function editorPair(name: string) {
  const hex = "(#[0-9a-f]{6})";
  const pair = new RegExp(`${name}:\\s*light-dark\\(\\s*${hex},\\s*${hex}\\s*\\)`).exec(style);
  if (!pair) throw new Error(`style.css has no light-dark() pair of hex colours for ${name}`);
  return { light: pair[1], dark: pair[2] };
}

/** A brand token in one theme: the theme's own declaration, else :root's, read through var(). */
function brandColour(name: string, theme: "light" | "dark"): string {
  const declared = (block: string) => new RegExp(`${name}:\\s*([^;]+);`).exec(block)?.[1]?.trim();
  const value = (theme === "dark" ? declared(dark) : undefined) ?? declared(root);
  if (!value) throw new Error(`dendrite-tokens.css does not declare ${name}`);
  const reference = /^var\((--[\w-]+)\)$/.exec(value);
  return reference?.[1] ? brandColour(reference[1], theme) : value;
}

describe("the editor's surfaces are the brand's", () => {
  for (const [editor, brand] of SURFACES) {
    it(`${editor} is ${brand}, in light and in dark`, () => {
      expect(editorPair(editor)).toEqual({
        light: brandColour(brand, "light"),
        dark: brandColour(brand, "dark"),
      });
    });
  }
});
