import { type ASTNode, type LiteralNode } from "../infra/nodes";
import { type LanguageDescriptor } from "../infra/registry";
import { type Token, type TokenKind } from "./lexer";
import { type Grammar } from "./grammar";
import {
  type ParseError,
  type ParseErrorKind,
  type ParseResult,
  type ParseWarning,
  type ParseWarningKind,
} from "./types";

//? Pratt KERNEL. The grammar-agnostic engine: a token cursor, list/recovery
// combinators, the Pratt driver, and the program loop. It holds NO grammar of its
// own - nuds/leds/statements come from the injected Grammar (see grammar.ts /
// core-grammar.ts). This is the kernel/grammar split: any language reuses the kernel.

// A token's grammar key: punctuation dispatches on its text (so ( [ . and operators
// are distinct), everything else on its kind (number, ident, …).
function keyOf(token: Token): string {
  return token.kind === "punct" ? token.value : token.kind;
}

//? Parser: token cursor, diagnostic collection, and the Pratt driver. Descriptor-
// driven (ident/input classification, call-arg mapping) and Grammar-driven (dispatch).
export class Parser {
  pos = 0;
  readonly errors: ParseError[] = [];
  readonly warnings: ParseWarning[] = [];

  constructor(
    readonly tokens: Token[],
    readonly descriptor: LanguageDescriptor,
    readonly grammar: Grammar,
  ) {}

  // The eof token is sticky: peeking past the end always returns it.
  peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }

  atEnd(): boolean {
    return this.peek().kind === "eof";
  }

  advance(): Token {
    const token = this.peek();
    if (!this.atEnd()) this.pos++;
    return token;
  }

  check(kind: TokenKind, value?: string): boolean {
    const token = this.peek();
    return token.kind === kind && (value === undefined || token.value === value);
  }

  match(kind: TokenKind, value?: string): boolean {
    if (!this.check(kind, value)) return false;
    this.advance();
    return true;
  }

  // Consume the expected token, or record an error and stay put (no throw).
  expect(kind: TokenKind, value?: string): Token {
    if (this.check(kind, value)) return this.advance();
    const token = this.peek();
    const what = value ?? kind;
    this.error(
      token.kind === "eof" ? "unexpected_end" : "unexpected_token",
      `Expected ${what} but found '${token.value || token.kind}'`,
      token.source,
    );
    return token;
  }

  error(kind: ParseErrorKind, message: string, source: Token["source"]): void {
    this.errors.push({ kind, message, source });
  }

  warn(kind: ParseWarningKind, message: string, source: Token["source"]): void {
    this.warnings.push({ kind, message, source });
  }

  // The Pratt loop: a nud opens the expression, then leds extend it while they bind
  // tighter than the caller's threshold.
  parseExpr(minBp = 0): ASTNode {
    const token = this.advance();
    const nud = this.grammar.nuds.get(keyOf(token));
    if (!nud) {
      this.error(
        token.kind === "eof" ? "unexpected_end" : "unexpected_token",
        `Unexpected '${token.value || token.kind}'`,
        token.source,
      );
      return placeholder(token);
    }

    let left = nud(this, token);
    while (!this.atEnd()) {
      const next = this.peek();
      const led = this.grammar.leds.get(keyOf(next));
      if (!led || led.bp <= minBp) break;
      this.advance();
      left = led.parse(this, left, next);
    }
    return left;
  }

  // Comma-separated items up to a closing punct, trailing comma allowed. The kernel
  // list primitive: arrays, call-args, lambda-params and type-lists all build on it,
  // each supplying its own per-item parser.
  parseSeparated<T>(close: string, parseItem: () => T): T[] {
    const items: T[] = [];
    while (!this.check("punct", close) && !this.atEnd()) {
      items.push(parseItem());
      if (!this.match("punct", ",")) break;
    }
    this.expect("punct", close);
    return items;
  }

  // Generic panic-mode primitive: skip tokens until `stop` matches, or EOF. The caller
  // supplies the anchor, so the kernel stays free of statement knowledge.
  skipUntil(stop: (token: Token) => boolean): void {
    while (!this.atEnd() && !stop(this.peek())) this.advance();
  }
}

// Recovery node: a failed expression yields a null literal so callers always get an
// ASTNode. The recorded ParseError is what actually marks the failure.
function placeholder(token: Token): LiteralNode {
  return { kind: "literal", value: null, source: token.source };
}

//? Entry point - parse a single expression from a token stream.
export interface ExpressionResult {
  node: ASTNode;
  errors: ParseError[];
  warnings: ParseWarning[];
}

// Parse a single expression. The public program entry is parse() below; this stays for
// expression-level testing and reuse.
export function parseExpression(
  tokens: Token[],
  descriptor: LanguageDescriptor,
  grammar: Grammar,
): ExpressionResult {
  const p = new Parser(tokens, descriptor, grammar);
  const node = p.parseExpr(0);
  if (!p.atEnd()) {
    const token = p.peek();
    p.error("unexpected_token", `Unexpected trailing '${token.value || token.kind}'`, token.source);
  }
  return { node, errors: p.errors, warnings: p.warnings };
}

//? Program entry: parse a token stream into a RawProgram. Gated: any error → no
// program. Lexer diagnostics are merged in by the source→program pipeline, not here.
// TODO: implement partial parsing where errored bindings are set to an error ast node.
export function parse(
  tokens: Token[],
  descriptor: LanguageDescriptor,
  grammar: Grammar,
): ParseResult {
  const p = new Parser(tokens, descriptor, grammar);
  const bindings = new Map<string, ASTNode>();
  const outputs = new Map<string, ASTNode>();

  // A statement begins with a registered keyword — the recovery anchor skipUntil resyncs to.
  const isStatementStart = (t: Token): boolean =>
    t.kind === "ident" && p.grammar.statements.has(t.value);

  while (!p.atEnd()) {
    const head = p.peek();
    const statement = head.kind === "ident" ? p.grammar.statements.get(head.value) : undefined;
    if (!statement) {
      p.error(
        "syntax_error",
        `Expected a statement but found '${head.value || head.kind}'`,
        head.source,
      );
      p.skipUntil(isStatementStart);
      continue;
    }

    const before = p.errors.length;
    const stmt = statement(p);
    if (p.errors.length > before) {
      // Poisoned: identity or value failed to parse. Drop it and resync.
      p.skipUntil(isStatementStart);
      continue;
    }

    const map = stmt.target === "output" ? outputs : bindings;
    if (map.has(stmt.name)) {
      p.error("duplicate_binding", `Duplicate ${stmt.target} '${stmt.name}'`, stmt.source);
    } else {
      map.set(stmt.name, stmt.node);
    }
  }

  if (p.errors.length > 0) return { ok: false, errors: p.errors, warnings: p.warnings };
  return { ok: true, program: { bindings, outputs }, warnings: p.warnings };
}
