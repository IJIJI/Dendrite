//? The JSX nodes an MDX tree takes, for the two plugins that replace a code node with markup.
// A `.md` file accepts a raw `html` node; MDX drops those, so it gets these instead. Shared
// because both plugins build the same shape, from different highlighters.

export type Attribute = { type: "mdxJsxAttribute"; name: string; value: string };
export type JsxText = { type: "text"; value: string };
export type JsxElement = {
  type: "mdxJsxTextElement" | "mdxJsxFlowElement";
  name: string;
  attributes: Attribute[];
  children: (JsxElement | JsxText)[];
};

export const attr = (name: string, value: string): Attribute => ({
  type: "mdxJsxAttribute",
  name,
  value,
});
