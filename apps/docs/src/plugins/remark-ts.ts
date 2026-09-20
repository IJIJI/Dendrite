import type { Element, Text } from "hast";
import type { InlineCode, Root } from "mdast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";

import { attr, type JsxElement, type JsxText } from "./mdx-jsx";
import { TS_INLINE, tsHighlighter } from "./shiki-ts";

//? TypeScript in Markdown: inline code ending in {:ts}, the `{:den}` convention with another
// language. Code BLOCKS are Starlight's Expressive Code; this is the inline half it does not
// cover, through the site's own highlighter (`shiki-ts.ts`), which says how the colours work.

const MARK = /\{:ts\}$/;
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

  const shiki = await tsHighlighter();
  for (const { node, index, parent } of found) {
    const code = node.value.replace(MARK, "");
    const replacement = mdx
      ? {
          type: "mdxJsxTextElement",
          name: "code",
          attributes: [attr("class", "ts")],
          children: toJsx(shiki.codeToHast(code, TS_INLINE).children),
        }
      : { type: "html", value: `<code class="ts">${shiki.codeToHtml(code, TS_INLINE)}</code>` };
    parent.children.splice(index, 1, replacement);
  }
};
