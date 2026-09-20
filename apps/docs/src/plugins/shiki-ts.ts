import { createHighlighter, type Highlighter } from "shiki";

//? The site's TypeScript highlighter, on the themes Starlight's Expressive Code uses for its
// code blocks, so a snippet reads the same whether EC drew it or this did. Two consumers:
// `remark-ts` for inline `…{:ts}` code, and DiagnosticsTable for the one block EC never sees,
// because that block is generated rather than written in a page.
//
// Both colours ride on every span as `--shiki-light` and `--shiki-dark`; dendrite.css picks one
// from Starlight's `data-theme`, so a snippet needs no re-render when the theme flips.

export const TS_THEMES = { light: "night-owl-light", dark: "night-owl" } as const;

/** Spans only: no <pre>, no <code>, for a snippet that sits in a sentence. */
export const TS_INLINE = {
  lang: "ts",
  themes: TS_THEMES,
  defaultColor: false,
  structure: "inline",
} as const;

// One highlighter for the whole build: loading a theme and a grammar costs more than every
// snippet on the site put together.
let loading: Promise<Highlighter> | undefined;
export const tsHighlighter = (): Promise<Highlighter> =>
  (loading ??= createHighlighter({ themes: ["night-owl", "night-owl-light"], langs: ["ts"] }));

/**
 * A block in the editor's own `<pre>`, so it keeps the page's background and padding rather
 * than Shiki's. `ts-block` is what dendrite.css reads to choose a theme's colour.
 */
export const tsBlock = async (code: string): Promise<string> =>
  (await tsHighlighter()).codeToHtml(code, {
    lang: "ts",
    themes: TS_THEMES,
    defaultColor: false,
    transformers: [
      {
        pre(node) {
          node.properties.class = "dendrite-source ts-block";
          delete node.properties.style; // Shiki's own background, which the page already has
        },
      },
    ],
  });
