import { sourceHtml, sourceParts } from "@dendrite-lang/editor";
import type { Code, InlineCode, Root } from "mdast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";

//? Dendrite in Markdown: a ```den fence, or inline code ending in {:den}, highlighted by the
// editor's own lexer instead of a Shiki grammar. A fence becomes the editor's static Source
// block (the markup a MinimalLayout's code has, inside `not-content` so Starlight's prose
// rules leave it alone). Runs before Starlight's Expressive Code (user plugins run first),
// replacing the node with markup it will not touch. A .md file takes raw HTML; MDX drops
// `html` nodes, so it gets JSX nodes instead - the same tree.

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

const flow = (name: string, className: string, children: JsxElement[]): JsxElement => ({
  type: "mdxJsxFlowElement",
  name,
  attributes: [attr("class", className)],
  children,
});

// The parts as JSX nodes, for MDX (text nodes are not escaped; MDX does that).
const jsxSpans = (code: string): (JsxElement | JsxText)[] =>
  sourceParts(code).map(({ text, cls }) =>
    cls
      ? {
          type: "mdxJsxTextElement",
          name: "span",
          attributes: [attr("class", `tok-${cls}`)],
          children: [{ type: "text", value: text }],
        }
      : { type: "text", value: text },
  );

const blockHtml = (code: string): string =>
  `<div class="not-content dendrite-minimal-layout"><div class="dendrite-code"><pre class="dendrite-source"><code>${sourceHtml(code)}</code></pre></div></div>`;

const blockJsx = (code: string): JsxElement =>
  flow("div", "not-content dendrite-minimal-layout", [
    flow("div", "dendrite-code", [
      flow("pre", "dendrite-source", [
        { type: "mdxJsxTextElement", name: "code", attributes: [], children: jsxSpans(code) },
      ]),
    ]),
  ]);

export const remarkDen: Plugin<[], Root> = () => (tree, file) => {
  const mdx = /\.mdx$/.test(file.path ?? "");

  visit(tree, "code", (node: Code, index, parent) => {
    if (node.lang !== "den" || !parent || index === undefined) return;
    const replacement = mdx ? blockJsx(node.value) : { type: "html", value: blockHtml(node.value) };
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
      : { type: "html", value: `<code class="den">${sourceHtml(code)}</code>` };
    parent.children.splice(index, 1, replacement as never);
  });
};
