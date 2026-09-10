import { createStdlib, type Language } from "@dendrite-lang/core";

import { styledRanges } from "./tokens";

//? Dendrite source as highlighted parts, by the editor's own lexer - the classification the
// canvas uses (cm.ts), so a static rendering never carries a grammar of its own that could
// drift from what actually parses. Two renderings: the React <Editor.Source/> block, and
// HTML for anything that renders at build time (a docs site, a remark plugin).

export interface SourcePart {
  text: string;
  /** A token class from the lexer (`tok-${cls}` in style.css), or plain text between tokens. */
  cls?: string;
}

let stdlib: Language | undefined;
const defaultLanguage = (): Language => (stdlib ??= createStdlib());

/** The source split into tokens and the text between them, in order. */
export function sourceParts(code: string, language = defaultLanguage()): SourcePart[] {
  const parts: SourcePart[] = [];
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

/** The parts as HTML: `tok-*` spans for tokens, escaped text between. */
export function sourceHtml(code: string, language?: Language): string {
  return sourceParts(code, language)
    .map((part) =>
      part.cls ? `<span class="tok-${part.cls}">${escape(part.text)}</span>` : escape(part.text),
    )
    .join("");
}
