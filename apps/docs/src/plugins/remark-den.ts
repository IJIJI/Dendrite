import { diagnostics } from "@dendrite-lang/core";
import { sourceHtml, sourceParts } from "@dendrite-lang/editor";
import type { Code, InlineCode, Root } from "mdast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";

import { parseDenMeta, sampleEdge } from "./den-meta";
import { attr, type JsxElement, type JsxText } from "./mdx-jsx";

//? Dendrite in Markdown: a ```den fence, or inline code ending in {:den}, highlighted by the
// editor's own lexer instead of a Shiki grammar. A fence becomes the editor's static Source
// block (the markup a MinimalLayout's code has, inside `not-content` so Starlight's prose
// rules leave it alone). Runs before Starlight's Expressive Code (user plugins run first),
// replacing the node with markup it will not touch. A .md file takes raw HTML; MDX drops
// `html` nodes, so it gets JSX nodes instead - the same tree.

const INLINE = /\{:den\}$/;

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

// A `fails` sample wears an error edge and a `warns` one a warning edge, each with a tag that
// says so in words, so a reader does not copy either out as working code without knowing
// what it is.
const blockClass = (meta: string | null | undefined): string => {
  const edge = sampleEdge(parseDenMeta(meta));
  return `not-content dendrite-minimal-layout${edge ? ` ${edge.className}` : ""}`;
};

const blockHtml = (code: string, meta: string | null | undefined): string => {
  const edge = sampleEdge(parseDenMeta(meta));
  const tag = edge ? `<span class="${edge.tagClassName}">${edge.label}</span>` : "";
  return `<div class="${blockClass(meta)}">${tag}<div class="dendrite-code"><pre class="dendrite-source"><code>${sourceHtml(code)}</code></pre></div></div>`;
};

const blockJsx = (code: string, meta: string | null | undefined): JsxElement => {
  const edge = sampleEdge(parseDenMeta(meta));
  const tag: JsxElement[] = edge
    ? [
        {
          type: "mdxJsxTextElement",
          name: "span",
          attributes: [attr("class", edge.tagClassName)],
          children: [{ type: "text", value: edge.label }],
        },
      ]
    : [];
  return flow("div", blockClass(meta), [
    ...tag,
    flow("div", "dendrite-code", [
      flow("pre", "dendrite-source", [
        { type: "mdxJsxTextElement", name: "code", attributes: [], children: jsxSpans(code) },
      ]),
    ]),
  ]);
};

export const remarkDen: Plugin<[], Root> = () => (tree, file) => {
  const mdx = /\.mdx$/.test(file.path ?? "");

  visit(tree, "code", (node: Code, index, parent) => {
    if (node.lang !== "den" || !parent || index === undefined) return;
    const replacement = mdx
      ? blockJsx(node.value, node.meta)
      : { type: "html", value: blockHtml(node.value, node.meta) };
    parent.children.splice(index, 1, replacement as never);
  });

  visit(tree, "inlineCode", (node: InlineCode, index, parent) => {
    if (!INLINE.test(node.value) || !parent || index === undefined) return;
    const code = node.value.replace(INLINE, "");
    // A diagnostic's name reads in its severity's colour - `forward_reference{:den}` is an
    // error the moment it is on the page - taken from core's registry, so a kind that
    // changes severity changes colour with it.
    const severity = (diagnostics as Record<string, { severity: string } | undefined>)[code]
      ?.severity;
    const className = severity ? `den den-diag den-diag-${severity}` : "den";
    const replacement = mdx
      ? ({
          type: "mdxJsxTextElement",
          name: "code",
          attributes: [attr("class", className)],
          children: severity ? [{ type: "text", value: code }] : jsxSpans(code),
        } satisfies JsxElement)
      : {
          type: "html",
          value: severity
            ? `<code class="${className}">${code}</code>`
            : `<code class="den">${sourceHtml(code)}</code>`,
        };
    parent.children.splice(index, 1, replacement as never);
  });
};
