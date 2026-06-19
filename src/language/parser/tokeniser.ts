import { SourceRef } from "../infra/nodes"
import { Token, TokenKind } from "./types"


//? Character utils
const isLetter  = (ch: string) => /[a-zA-Z_]/.test(ch)
const isDigit   = (ch: string) => ch >= '0' && ch <= '9'
const isAlnum   = (ch: string) => isLetter(ch) || isDigit(ch)
const isSpace   = (ch: string) => ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n'


//? Scanner
class Scanner {
  private pos    = 0
  private line   = 1
  private col    = 1

  constructor(private source: string) {}

  peek(offset = 0): string { return this.source[this.pos + offset] ?? '' }
  atEnd():          boolean { return this.pos >= this.source.length }

  advance(): string {
    const ch = this.source[this.pos++]
    if (ch === '\n') { this.line++; this.col = 1 } else { this.col++ }
    return ch
  }

  // Call BEFORE advancing through the token to capture its start position
  mark(): { line: number; col: number } {
    return { line: this.line, col: this.col }
  }

  sourceRef(start: { line: number; col: number }, value: string): SourceRef {
    return { kind: 'code', line: start.line, column: start.col, length: value.length }
  }
}


//? Scan functions
function scanString(s: Scanner): Token {
  const start = s.mark()
  s.advance()  // opening "
  let value = ''
  while (!s.atEnd() && s.peek() !== '"') {
    if (s.peek() === '\\') { s.advance(); value += s.advance() }
    else value += s.advance()
  }
  if (s.atEnd()) throw new TokenError('Unterminated string', s.sourceRef(start, value))
  s.advance()  // closing "
  return { kind: 'string', value, source: s.sourceRef(start, `"${value}"`) }
}

function scanNumber(s: Scanner): Token {
  const start = s.mark()
  let value = ''
  while (isDigit(s.peek())) value += s.advance()
  if (s.peek() === '.' && isDigit(s.peek(1))) {
    value += s.advance()  // .
    while (isDigit(s.peek())) value += s.advance()
  }
  return { kind: 'number', value, source: s.sourceRef(start, value) }
}

// Keywords are a map, not hardcoded branches
const KEYWORDS: Record<string, TokenKind> = {
  let: 'keyword', output: 'keyword',
  true: 'boolean', false: 'boolean',
  null: 'null',
}

function scanIdent(s: Scanner): Token {
  const start = s.mark()
  let value = ''
  while (!s.atEnd() && (isAlnum(s.peek()) || s.peek() === '_')) value += s.advance()
  const kind = KEYWORDS[value] ?? 'ident'
  return { kind, value, source: s.sourceRef(start, value) }
}

function skipComment(s: Scanner): void {
  if (s.peek(1) === '/') {
    while (!s.atEnd() && s.peek() !== '\n') s.advance()
  } else if (s.peek(1) === '*') {
    s.advance(); s.advance()  // /*
    while (!s.atEnd() && !(s.peek() === '*' && s.peek(1) === '/')) s.advance()
    if (!s.atEnd()) { s.advance(); s.advance() }  // */
  }
}