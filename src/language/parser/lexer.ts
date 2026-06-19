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
  | "punct" // ( ) [ ] { } , . : = => == != > >= < <= + - * / % !
  | "eof";

export interface Token {
  readonly kind: TokenKind;
  readonly value: string; // raw source text (string token: unquoted, unescaped content)
  readonly source: SourceRef; // { kind: "code", line, column, length }
}

// The lexer never throws. Like the analyser, it accumulates everything it can
// find and recovers, returning best-effort tokens alongside the diagnostics.
export interface LexResult {
  readonly tokens: Token[];
  readonly errors: ParseError[];
  readonly warnings: ParseWarning[];
}

//? Defaults
// Core multi-char operators. The real vocabulary is sourced from the language
// descriptor and passed into tokenise(); this is only the standalone fallback.
// TODO: Check if there should be a default or these should be removed.
const DEFAULT_OPERATORS: readonly string[] = ["=>", "==", "!=", ">=", "<="];

// Structural single-char punctuation. Always one token, never extensible.
// TODO: Is this the right list? Should it be extensible somehow?
const SINGLE_CHAR_PUNCT = new Set("()[]{},.=!<>+-*/%:");

// Only literal values are recognised at the lexer level (see the note above TokenKind).
const LITERAL_WORDS: Record<string, TokenKind> = {
  true: "boolean",
  false: "boolean",
  null: "null",
};

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

//? Character utilities (pure, no state)
const isLetter = (ch: string) => /[a-zA-Z_]/.test(ch);
const isDigit = (ch: string) => ch >= "0" && ch <= "9";
const isAlnum = (ch: string) => isLetter(ch) || isDigit(ch);
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
    if (ch === "\n") { // TODO: How is \r handled?
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
    if (s.peek() === "\\") {
      const escMark = s.mark();
      const escPos = s.pos;
      s.advance(); // backslash
      if (s.atEnd()) break; // dangling backslash → unterminated, reported below
      const esc = s.advance();
      if (esc in ESCAPES) {
        value += ESCAPES[esc];
      } else {
        // Unknown escape: keep both characters verbatim rather than silently
        // dropping the backslash, and warn.
        value += "\\" + esc;
        s.warn(
          "invalid_escape",
          `Unknown escape sequence '\\${esc}'`,
          s.ref(escMark, s.pos - escPos),
        );
      }
    } else {
      value += s.advance();
    }
  }

  if (s.atEnd()) {
    // Recovery: emit the string we have so far, spanning to EOF.
    s.error("unterminated_string", "Unterminated string literal", s.ref(start, s.pos - startPos));
    return { kind: "string", value, source: s.ref(start, s.pos - startPos) };
  }

  s.advance(); // closing quote
  return { kind: "string", value, source: s.ref(start, s.pos - startPos) };
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
  while (!s.atEnd() && isAlnum(s.peek())) value += s.advance();
  const kind = LITERAL_WORDS[value] ?? "ident";
  return { kind, value, source: s.ref(start, value.length) };
}

// operators MUST be pre-sorted longest-first so multi-char ops beat their
// single-char prefixes (=> over =, >= over >). Returns null when the character
// starts no token (unknown char): the error is recorded and the char skipped.
// TODO: Auto sort them by length?
function scanPunct(s: Scanner, operators: readonly string[]): Token | null {
  const start = s.mark();

  for (const op of operators) {
    if (s.source.startsWith(op, s.pos)) {
      for (let i = 0; i < op.length; i++) s.advance();
      return { kind: "punct", value: op, source: s.ref(start, op.length) };
    }
  }

  const ch = s.peek();
  if (SINGLE_CHAR_PUNCT.has(ch)) {
    s.advance();
    return { kind: "punct", value: ch, source: s.ref(start, 1) };
  }

  // Unknown character: skip it and keep lexing.
  s.advance();
  s.error("unknown_character", `Unexpected character '${ch}'`, s.ref(start, 1));
  return null;
}

// Discards the comment; never produces a token.
function skipComment(s: Scanner): void {
  if (s.peek(1) === "/") {
    while (!s.atEnd() && s.peek() !== "\n") s.advance();
    return;
  }
  // Block comment.
  const start = s.mark();
  const startPos = s.pos;
  s.advance();
  s.advance(); // /*
  while (!s.atEnd() && !(s.peek() === "*" && s.peek(1) === "/")) s.advance();
  if (s.atEnd()) {
    // Recovery: an unterminated block comment runs to EOF; warn, do not abort.
    s.warn("unterminated_comment", "Unterminated block comment", s.ref(start, s.pos - startPos));
    return;
  }
  s.advance();
  s.advance(); // */
}

//? Driver
export function tokenise(
  source: string,
  operators: readonly string[] = DEFAULT_OPERATORS,
): LexResult {
  const s = new Scanner(source);
  const ops = [...operators].sort((a, b) => b.length - a.length);
  const tokens: Token[] = [];

  while (!s.atEnd()) {
    const ch = s.peek();
    if (isSpace(ch)) {
      s.advance();
      continue;
    }
    if (ch === "/" && (s.peek(1) === "/" || s.peek(1) === "*")) {
      skipComment(s);
      continue;
    }
    if (ch === '"' || ch === "'") {
      tokens.push(scanString(s, ch));
      continue;
    }
    if (isDigit(ch)) {
      tokens.push(scanNumber(s));
      continue;
    }
    if (isLetter(ch)) {
      tokens.push(scanIdent(s));
      continue;
    }
    const token = scanPunct(s, ops);
    if (token) tokens.push(token);
  }

  tokens.push({
    kind: "eof",
    value: "",
    source: { kind: "code", line: s.line, column: s.col, length: 0 },
  });
  return { tokens, errors: s.errors, warnings: s.warnings };
}
