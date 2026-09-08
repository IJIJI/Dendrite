import { createStdlib } from "@dendrite-lang/core";
import { styledRanges } from "@dendrite-lang/editor";

//? Dendrite source → highlighted parts, by the editor's own lexer - the classification the
// canvas uses, so the site never carries a grammar of its own that could drift from what
// actually parses. Two renderings: HTML (DenCode, .md) and, in remark-den.ts, JSX nodes (.mdx).

export interface Part {
  text: string;
  /** A token class from the editor (`tok-${cls}` in its stylesheet), or plain text. */
  cls?: string;
}

const language = createStdlib();

export function denParts(code: string): Part[] {
  const parts: Part[] = [];
  let at = 0;
  for (const range of styledRanges(code, language)) {
    if (range.from > at) parts.push({ text: code.slice(at, range.from) });
    parts.push({ text: code.slice(range.from, range.to), cls: range.cls });
    at = range.to;
  }
  if (at < code.length) parts.push({ text: code.slice(at) });
  return parts;
}

const escape = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The parts as HTML: spans for tokens, escaped text between. */
export const denHtml = (code: string): string =>
  denParts(code)
    .map((part) =>
      part.cls ? `<span class="tok-${part.cls}">${escape(part.text)}</span>` : escape(part.text),
    )
    .join("");
