import type { Code, InlineCode, Root } from "mdast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";

import { denHtml, denParts } from "../lib/den-parts";

//? Dendrite in Markdown: a ```den fence, or inline code ending in {:den}, highlighted by the
// editor's own lexer (den-parts.ts) instead of a Shiki grammar. Runs before Starlight's
// Expressive Code (user plugins run first), replacing the node with markup it will not
// touch. A .md file takes raw HTML; MDX drops `html` nodes, so it gets JSX nodes instead -
// the same spans, built as a tree.

const INLINE = /\{:den\}$/;

type Attribute = { type: "mdxJsxAttribute"; name: string; value: string };
type JsxText = { type: "text"; value: string };
type JsxElement = {
  type: "mdxJsxTextElement" | "mdxJsxFlowElement";
  name: string;
  attributes: Attribute[];
  children: (JsxElement | JsxText)[];
};

const attr = (name: string, value: string): Attribute => ({ type: "mdxJsxAttribute", name, value });

// The parts as JSX nodes, for MDX (text nodes are not escaped; MDX does that).
const jsxSpans = (code: string): (JsxElement | JsxText)[] =>
  denParts(code).map(({ text, cls }) =>
    cls
      ? {
          type: "mdxJsxTextElement",
          name: "span",
          attributes: [attr("class", `tok-${cls}`)],
          children: [{ type: "text", value: text }],
        }
      : { type: "text", value: text },
  );

export const remarkDen: Plugin<[], Root> = () => (tree, file) => {
  const mdx = /\.mdx$/.test(file.path ?? "");

  visit(tree, "code", (node: Code, index, parent) => {
    if (node.lang !== "den" || !parent || index === undefined) return;
    const replacement = mdx
      ? ({
          type: "mdxJsxFlowElement",
          name: "pre",
          attributes: [attr("class", "den")],
          children: [
            {
              type: "mdxJsxTextElement",
              name: "code",
              attributes: [],
              children: jsxSpans(node.value),
            },
          ],
        } satisfies JsxElement)
      : { type: "html", value: `<pre class="den"><code>${denHtml(node.value)}</code></pre>` };
    parent.children.splice(index, 1, replacement as never);
  });

  visit(tree, "inlineCode", (node: InlineCode, index, parent) => {
    if (!INLINE.test(node.value) || !parent || index === undefined) return;
    const code = node.value.replace(INLINE, "");
    const replacement = mdx
      ? ({
          type: "mdxJsxTextElement",
          name: "code",
          attributes: [attr("class", "den")],
          children: jsxSpans(code),
        } satisfies JsxElement)
      : { type: "html", value: `<code class="den">${denHtml(code)}</code>` };
    parent.children.splice(index, 1, replacement as never);
  });
};
