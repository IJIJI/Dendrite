import {
  type ArrayNode,
  type ASTNode,
  type FieldAccessNode,
  type InputNode,
  type LiteralNode,
  type RefNode,
} from "../infra/nodes";
import { type LanguageDescriptor } from "../infra/registry";
import { type Token, type TokenKind } from "./lexer";
import {
  type ParseError,
  type ParseErrorKind,
  type ParseWarning,
  type ParseWarningKind,
} from "./types";

// SLICE 1: expression core. Atoms, grouping, arrays, field access, and the
// Pratt engine. Statements, calls, arrows and the grammar-registration API are
// later slices; the structure here (nud/led registries, generalized leds) is
// built to absorb them without rework.

//? Pratt building blocks
// nud (null denotation): how a token STARTS an expression (prefix position).
// led (left denotation): how a token CONTINUES one, given a parsed left (infix/
// postfix). bp is the led's left binding power. Higher binds tighter. 
// e.g. if + has bp 50 and * has bp 60, a + b * c expression will parse as
// a + (b * c) due to the higher precedence of *.
type Nud = (p: Parser, token: Token) => ASTNode;
interface Led {
  bp: number;
  parse: (p: Parser, left: ASTNode, token: Token) => ASTNode;
}

// Binding-power tiers. Operators slot in here as the grammar API lands; for now
// only member access (.) is an infix form.
const BP = {
  MEMBER: 90,
} as const;

// A token's grammar key: punctuation dispatches on its text (so ( [ . and future
// operators are distinct), everything else on its kind (number, ident, …).
function keyOf(token: Token): string {
  return token.kind === "punct" ? token.value : token.kind;
}

//? Parser: token cursor, diagnostic collection, and the Pratt driver.
// Descriptor-driven: ident classification (input vs ref) and, later, call-arg
// mapping read from the language descriptor, matching the rest of the codebase.
export class Parser {
  pos = 0;
  readonly errors: ParseError[] = [];
  readonly warnings: ParseWarning[] = [];

  constructor(
    readonly tokens: Token[],
    readonly descriptor: LanguageDescriptor,
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

  // The Pratt loop: a nud opens the expression, then leds extend it while they
  // bind tighter than the caller's threshold.
  parseExpr(minBp = 0): ASTNode {
    const token = this.advance();
    const nud = NUDS.get(keyOf(token));
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
      const led = LEDS.get(keyOf(next));
      if (!led || led.bp <= minBp) break;
      this.advance();
      left = led.parse(this, left, next);
    }
    return left;
  }
}

// Recovery node: a failed expression yields a null literal so callers always get
// an ASTNode. The recorded ParseError is what actually marks the failure.
function placeholder(token: Token): LiteralNode {
  return { kind: "literal", value: null, source: token.source };
}

//? Core grammar (slice 1)
// Hardcoded here; slice 4 moves these into descriptor-backed registries so they
// compose via extendLanguage. The shape (Maps keyed by keyOf) is already final.
const NUDS = new Map<string, Nud>();
const LEDS = new Map<string, Led>();

// Literals -------------------------------------------------------------------
NUDS.set("number", (_p, t): LiteralNode => ({
  kind: "literal",
  value: Number(t.value),
  source: t.source,
}));
NUDS.set("string", (_p, t): LiteralNode => ({ kind: "literal", value: t.value, source: t.source }));
NUDS.set("boolean", (_p, t): LiteralNode => ({
  kind: "literal",
  value: t.value === "true",
  source: t.source,
}));
NUDS.set("null", (_p, t): LiteralNode => ({ kind: "literal", value: null, source: t.source }));

// Identifier: a declared context input becomes an InputNode, anything else a
// RefNode. This is name classification (a Set lookup), not type resolution -
// the parser already holds the descriptor, so it is the natural home.
NUDS.set("ident", (p, t): InputNode | RefNode => {
  const input = p.descriptor.inputs.get(t.value);
  if (input) return { kind: "input", name: t.value, type: input.type, source: t.source };
  return { kind: "ref", name: t.value, source: t.source };
});

// Grouping: ( expr ) - the parentheses only steer precedence, so the inner node
// is returned as-is.
NUDS.set("(", (p): ASTNode => {
  const inner = p.parseExpr(0);
  p.expect("punct", ")");
  return inner;
});

// Array literal: [ a, b, c ] with an optional trailing comma. ArrayNode.type is
// the ELEMENT type; left as "any" for the analyser to derive.
NUDS.set("[", (p, t): ArrayNode => {
  const items = parseDelimited(p, "]");
  return { kind: "array", items, type: "any", source: t.source };
});

// Field access: left . field  (left-associative via the loop in parseExpr).
LEDS.set(".", {
  bp: BP.MEMBER,
  parse: (p, left): FieldAccessNode => {
    const name = p.expect("ident");
    return { kind: "field", struct: left, field: name.value, type: "any", source: name.source };
  },
});

// Comma-separated expressions up to a closing punct, trailing comma allowed.
// TODO: Should this not be part of the parser?
function parseDelimited(p: Parser, close: string): ASTNode[] {
  const items: ASTNode[] = [];
  while (!p.check("punct", close) && !p.atEnd()) {
    items.push(p.parseExpr(0));
    if (!p.match("punct", ",")) break;
  }
  p.expect("punct", close);
  return items;
}

//? Entry point (slice 1) - parse a single expression from a token stream.
export interface ExpressionResult {
  node: ASTNode;
  errors: ParseError[];
  warnings: ParseWarning[];
}

// TODO: Should this not be part of the parser?
export function parseExpression(tokens: Token[], descriptor: LanguageDescriptor): ExpressionResult {
  const p = new Parser(tokens, descriptor);
  const node = p.parseExpr(0);
  if (!p.atEnd()) {
    const token = p.peek();
    p.error("unexpected_token", `Unexpected trailing '${token.value || token.kind}'`, token.source);
  }
  return { node, errors: p.errors, warnings: p.warnings };
}
