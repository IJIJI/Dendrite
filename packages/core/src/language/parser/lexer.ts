import { isIdentifierPart, isIdentifierStart, LITERAL_WORDS } from "../infra/identifier";
import { type SourceRef } from "../infra/nodes";
import {
  type ParseError,
  type ParseErrorKind,
  type ParseWarning,
  type ParseWarningKind,
} from "./types";

//? Tokens
// The lexer is intentionally keyword-agnostic: `let`, `output` and any
// user-registered statement keyword come out as `ident`. The parser's statement
// registry decides what is a keyword. Only literal values (true/false/null) get
// a dedicated kind here, since they are values rather than syntax.
export type TokenKind =
  | "ident" // myVar, Filter, sourceBus, let, output
  | "string" // "hello", 'hello'
  | "number" // 3, 3.14
  | "boolean" // true, false
  | "null" // null
  | "punct" // ( ) [ ] , . : = $ => -> and the operators; ` { } inside a template only
  | "comment" // // line and /* block */ - trivia, never in the main token stream
  | "eof";

export interface Token {
  readonly kind: TokenKind;
  readonly value: string; // raw source text (string token: unquoted, unescaped content)
  readonly source: SourceRef; // { kind: "code", line, column, length }
}

// The lexer never throws. Like the analyser, it accumulates everything it can
// find and recovers, returning best-effort tokens alongside the diagnostics.
// Comments are trivia: collected on a separate channel (for editor highlighting),
// never in `tokens`, so the parser and grammar remain comment-oblivious.
export interface LexResult {
  readonly tokens: Token[];
  readonly comments: Token[];
  readonly errors: ParseError[];
  readonly warnings: ParseWarning[];
}

//? Core syntax
// Dendrite's core has only TWO operators, both arrows that are part of the base
// language (not stdlib): the lambda arrow `=>` and the function-type arrow `->`.
// Comparisons, arithmetic, etc. are stdlib grammar over ops, supplied (single- AND
// multi-char) by the assembled language via tokenise(source, operators).
//
// Structural punctuation is the only other thing the lexer hardcodes: the delimiters
// of core syntax, which exist independent of any registered op.
//   ( ) grouping & calls   [ ] array literals   , separators
//   .   field access        =   binding (let x = …)   :   named arg / param type
//   $   input sigil ($name → InputNode, resolved by the parser)
// Other operators (+ - < > ! == …) are deliberately absent: they arrive via operators.
const STRUCTURAL_PUNCT = new Set("()[],.=:$");

// Core operators: always recognised, ahead of any language-supplied operators.
// `=>` is the lambda arrow; `->` is the function-type arrow (type annotations).
const CORE_OPERATORS = ["=>", "->"];

// Only literal values are recognised at the lexer level (see the note above TokenKind).
// The literal words come from infra/identifier.ts (shared with port-name validation); only
// their token kinds are lexer knowledge.
const literalKind = (word: string): TokenKind => (word === "null" ? "null" : "boolean");

// Recognised string escapes. Anything else is preserved verbatim and warned on,
// so no source text is ever silently destroyed.
const ESCAPES: Record<string, string> = {
  n: "\n",
  t: "\t",
  r: "\r",
  "\\": "\\",
  '"': '"',
  "'": "'",
};

// A template's text can also escape what would end it or open a hole.
const TEMPLATE_ESCAPES: Record<string, string> = { ...ESCAPES, "`": "`", "{": "{" };

//? Character utilities (pure, no state)
const isDigit = (ch: string) => ch >= "0" && ch <= "9";
const isSpace = (ch: string) => ch === " " || ch === "\t" || ch === "\r" || ch === "\n";

interface Pos {
  line: number;
  col: number;
}

//? Scanner: cursor, position bookkeeping, and diagnostic collection.
// Holds no token logic; the scan functions below drive it.
class Scanner {
  pos = 0;
  line = 1;
  col = 1;
  readonly errors: ParseError[] = [];
  readonly warnings: ParseWarning[] = [];

  constructor(public readonly source: string) {}

  peek(offset = 0): string {
    return this.source[this.pos + offset] ?? "";
  }

  atEnd(): boolean {
    return this.pos >= this.source.length;
  }

  advance(): string {
    const ch = this.source[this.pos++];
    if (ch === "\n") {
      // \r without \n is currently ignored. Fine in general.
      this.line++;
      this.col = 1;
    } else {
      this.col++;
    }
    return ch;
  }

  // Capture BEFORE consuming a token's characters.
  mark(): Pos {
    return { line: this.line, col: this.col };
  }

  ref(start: Pos, length: number): SourceRef {
    return { kind: "code", line: start.line, column: start.col, length };
  }

  error(kind: ParseErrorKind, message: string, source: SourceRef): void {
    this.errors.push({ kind, message, source });
  }

  warn(kind: ParseWarningKind, message: string, source: SourceRef): void {
    this.warnings.push({ kind, message, source });
  }
}

//? Scan functions (one concern each)

// Handles both " and ' (interchangeable) value holds the unquoted, unescaped content;
// source spans the full literal including quotes, computed from the consumed range so
// escapes do not throw the length off.
function scanString(s: Scanner, quote: string): Token {
  const start = s.mark();
  const startPos = s.pos;
  s.advance(); // opening quote
  let value = "";

  while (!s.atEnd() && s.peek() !== quote) {
    value += s.peek() === "\\" ? scanEscape(s, ESCAPES) : s.advance();
  }

  if (s.atEnd()) {
    // Recovery: emit the string we have so far, spanning to EOF.
    s.error("unterminated_string", "Unterminated string literal", s.ref(start, s.pos - startPos));
    return { kind: "string", value, source: s.ref(start, s.pos - startPos) };
  }

  s.advance(); // closing quote
  return { kind: "string", value, source: s.ref(start, s.pos - startPos) };
}

// A backslash sequence, translated. An unknown one keeps both characters verbatim rather than
// silently dropping the backslash, and warns. A dangling backslash at the end gives nothing,
// and the caller then finds the end and reports its own unterminated literal.
function scanEscape(s: Scanner, escapes: Record<string, string>): string {
  const escMark = s.mark();
  const escPos = s.pos;
  s.advance(); // backslash
  if (s.atEnd()) return "";
  const esc = s.advance();
  if (esc in escapes) return escapes[esc];
  s.warn("invalid_escape", `Unknown escape sequence '\\${esc}'`, s.ref(escMark, s.pos - escPos));
  return "\\" + esc;
}

// A template: `text {hole} text`. Structure, not a token kind: the backtick and the braces are
// punct tokens, each text part is a string token, and a hole holds ordinary tokens, scanned by
// scanToken, so a hole can hold a template. The parser's nud on the backtick builds the value.
// A hole ends at the first `}` at its own level: `{` and `}` are no tokens outside a template,
// so nothing inside a hole can open a brace except another template, which consumes its own.
function scanTemplate(
  s: Scanner,
  ops: readonly string[],
  tokens: Token[],
  comments: Token[],
): void {
  const open = s.mark();
  const openPos = s.pos;
  const punct = (value: string): void => {
    const at = s.mark();
    s.advance();
    tokens.push({ kind: "punct", value, source: s.ref(at, 1) });
  };
  punct("`");
  for (;;) {
    // A text part, up to a hole, the closing backtick, or the end of the source.
    const start = s.mark();
    const startPos = s.pos;
    let value = "";
    while (!s.atEnd() && s.peek() !== "`" && s.peek() !== "{") {
      value += s.peek() === "\\" ? scanEscape(s, TEMPLATE_ESCAPES) : s.advance();
    }
    if (s.pos > startPos) {
      tokens.push({ kind: "string", value, source: s.ref(start, s.pos - startPos) });
    }
    if (s.atEnd()) {
      s.error("unterminated_string", "Unterminated template", s.ref(open, s.pos - openPos));
      return;
    }
    if (s.peek() === "`") {
      punct("`");
      return;
    }
    // A hole. `$` is plain text here, so `${n}` is the text "$" and the hole `n`.
    punct("{");
    while (!s.atEnd() && s.peek() !== "}") scanToken(s, ops, tokens, comments);
    if (s.atEnd()) {
      s.error("unterminated_string", "Unterminated template", s.ref(open, s.pos - openPos));
      return;
    }
    punct("}");
  }
}

function scanNumber(s: Scanner): Token {
  const start = s.mark();
  let value = "";
  while (isDigit(s.peek())) value += s.advance();
  // A trailing dot is only part of the number if a digit follows it.
  if (s.peek() === "." && isDigit(s.peek(1))) {
    value += s.advance(); // .
    while (isDigit(s.peek())) value += s.advance();
  }
  return { kind: "number", value, source: s.ref(start, value.length) };
}

function scanIdent(s: Scanner): Token {
  const start = s.mark();
  let value = "";
  while (!s.atEnd() && isIdentifierPart(s.peek())) value += s.advance();
  const kind = LITERAL_WORDS.has(value) ? literalKind(value) : "ident";
  return { kind, value, source: s.ref(start, value.length) };
}

// operators are pre-sorted longest-first by tokenise() (so multi-char ops beat
// their single-char prefixes: >= over >, => over =), and are tried before
// structural punctuation. Returns null when the character starts no token
// (unknown char): the error is recorded and the char skipped.
function scanPunct(s: Scanner, operators: readonly string[]): Token | null {
  const start = s.mark();

  for (const op of operators) {
    if (s.source.startsWith(op, s.pos)) {
      for (let i = 0; i < op.length; i++) s.advance();
      return { kind: "punct", value: op, source: s.ref(start, op.length) };
    }
  }

  const ch = s.peek();
  if (STRUCTURAL_PUNCT.has(ch)) {
    s.advance();
    return { kind: "punct", value: ch, source: s.ref(start, 1) };
  }

  // Unknown character: skip it and keep lexing.
  s.advance();
  s.error("unknown_character", `Unexpected character '${ch}'`, s.ref(start, 1));
  return null;
}

// Scans a `//` line or `/* block */` comment into a trivia token (value = raw text
// including the markers). Emitted on LexResult.comments, never the main stream.
function scanComment(s: Scanner): Token {
  const start = s.mark();
  const startPos = s.pos;

  if (s.peek(1) === "/") {
    // Line comment: runs to (not including) the newline.
    while (!s.atEnd() && s.peek() !== "\n") s.advance();
  } else {
    // Block comment.
    s.advance();
    s.advance(); // /*
    while (!s.atEnd() && !(s.peek() === "*" && s.peek(1) === "/")) s.advance();
    if (s.atEnd()) {
      // Recovery: an unterminated block comment runs to EOF; warn, do not abort.
      s.warn("unterminated_comment", "Unterminated block comment", s.ref(start, s.pos - startPos));
    } else {
      s.advance();
      s.advance(); // */
    }
  }

  return {
    kind: "comment",
    value: s.source.slice(startPos, s.pos),
    source: s.ref(start, s.pos - startPos),
  };
}

// One token (or one piece of trivia) from the cursor: the driver's step, and a template hole's.
function scanToken(s: Scanner, ops: readonly string[], tokens: Token[], comments: Token[]): void {
  const ch = s.peek();
  if (isSpace(ch)) {
    s.advance();
  } else if (ch === "/" && (s.peek(1) === "/" || s.peek(1) === "*")) {
    comments.push(scanComment(s));
  } else if (ch === "`") {
    scanTemplate(s, ops, tokens, comments);
  } else if (ch === '"' || ch === "'") {
    tokens.push(scanString(s, ch));
  } else if (isDigit(ch)) {
    tokens.push(scanNumber(s));
  } else if (isIdentifierStart(ch)) {
    tokens.push(scanIdent(s));
  } else {
    const token = scanPunct(s, ops);
    if (token) tokens.push(token);
  }
}

//? Driver
export function tokenise(source: string, operators: readonly string[] = []): LexResult {
  const s = new Scanner(source);
  // Core operators first, then language-supplied; longest-first so multi-char ops
  // beat their single-char prefixes (=> over =, -> over -).
  const ops = [...CORE_OPERATORS, ...operators].sort((a, b) => b.length - a.length);
  const tokens: Token[] = [];
  const comments: Token[] = [];

  while (!s.atEnd()) scanToken(s, ops, tokens, comments);

  tokens.push({
    kind: "eof",
    value: "",
    source: { kind: "code", line: s.line, column: s.col, length: 0 },
  });
  return { tokens, comments, errors: s.errors, warnings: s.warnings };
}
