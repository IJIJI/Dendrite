import type { Element, Text } from "hast";
import type { InlineCode, Root } from "mdast";
import { createHighlighter, type Highlighter } from "shiki";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";

import { attr, type JsxElement, type JsxText } from "./mdx-jsx";

//? TypeScript in Markdown: inline code ending in {:ts}, the `{:den}` convention with another
// language. Code BLOCKS are Starlight's Expressive Code; this is the inline half it does not
// cover, so it uses the same themes EC does - Night Owl, light and dark - and the same two
// colours ride on every span as `--shiki-light` and `--shiki-dark`. Which one shows is
// dendrite.css, switching on Starlight's `data-theme`, so a snippet needs no re-render to
// follow the toggle.

const MARK = /\{:ts\}$/;
const OPTIONS = {
  lang: "ts",
  themes: { light: "night-owl-light", dark: "night-owl" },
  defaultColor: false,
  structure: "inline", // spans only: no <pre>, no <code>, since this sits in a sentence
} as const;

// One highlighter for the whole build: loading a theme and a grammar costs more than every
// snippet on the site put together.
let loading: Promise<Highlighter> | undefined;
const highlighter = (): Promise<Highlighter> =>
  (loading ??= createHighlighter({ themes: ["night-owl", "night-owl-light"], langs: ["ts"] }));

// Shiki's hast, as MDX nodes. Every element it makes inline is a <span> with a style.
const toJsx = (nodes: unknown[]): (JsxElement | JsxText)[] =>
  nodes.flatMap((node): (JsxElement | JsxText)[] => {
    const child = node as Element | Text;
    if (child.type === "text") return [{ type: "text", value: child.value } satisfies JsxText];
    if (child.type !== "element") return [];
    const style = typeof child.properties?.style === "string" ? child.properties.style : "";
    return [
      {
        type: "mdxJsxTextElement",
        name: "span",
        attributes: style ? [attr("style", style)] : [],
        children: toJsx(child.children),
      } satisfies JsxElement,
    ];
  });

export const remarkTs: Plugin<[], Root> = () => async (tree, file) => {
  const mdx = /\.mdx$/.test(file.path ?? "");
  const found: { node: InlineCode; index: number; parent: { children: unknown[] } }[] = [];

  visit(tree, "inlineCode", (node: InlineCode, index, parent) => {
    if (MARK.test(node.value) && parent && index !== undefined) {
      found.push({ node, index, parent: parent as unknown as { children: unknown[] } });
    }
  });
  if (found.length === 0) return; // no snippet on this page, no highlighter to load

  const shiki = await highlighter();
  for (const { node, index, parent } of found) {
    const code = node.value.replace(MARK, "");
    const replacement = mdx
      ? {
          type: "mdxJsxTextElement",
          name: "code",
          attributes: [attr("class", "ts")],
          children: toJsx(shiki.codeToHast(code, OPTIONS).children),
        }
      : { type: "html", value: `<code class="ts">${shiki.codeToHtml(code, OPTIONS)}</code>` };
    parent.children.splice(index, 1, replacement);
  }
};
