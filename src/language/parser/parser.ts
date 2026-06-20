import {
  type ArrayNode,
  type ASTNode,
  type FieldAccessNode,
  type InputNode,
  type LiteralNode,
  type RefNode,
  type SourceRef,
} from "../infra/nodes";
import { type LanguageDescriptor } from "../infra/registry";
import { type Token, type TokenKind } from "./lexer";
import {
  type ParseError,
  type ParseErrorKind,
  type ParseResult,
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

  // Comma-separated expressions up to a closing punct, trailing comma allowed.
  // Reusable list machinery: arrays now, call-args and arrow-params later.
  parseDelimited(close: string): ASTNode[] {
    const items: ASTNode[] = [];
    while (!this.check("punct", close) && !this.atEnd()) {
      items.push(this.parseExpr(0));
      if (!this.match("punct", ",")) break;
    }
    this.expect("punct", close);
    return items;
  }

  // Generic panic-mode primitive: skip tokens until `stop` matches, or EOF. The
  // caller supplies the anchor, so the Parser stays free of statement knowledge
  // (the statement layer passes its keyword check; slice 3 reuses this for
  // call-arg recovery).
  skipUntil(stop: (token: Token) => boolean): void {
    while (!this.atEnd() && !stop(this.peek())) this.advance();
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

// Identifier → always a binding reference. Context inputs use the $ sigil
// (below), so a bare name is never an input: no descriptor lookup, no shadowing.
NUDS.set("ident", (_p, t): RefNode => ({ kind: "ref", name: t.value, source: t.source }));

// Input sigil: $name → InputNode. Declared type comes from the descriptor; an
// unknown name still produces the node so the analyser's unknown_program_input
// fires (it overrides the type for valid inputs anyway).
NUDS.set("$", (p, t): InputNode => {
  const name = p.expect("ident");
  const def = p.descriptor.inputs.get(name.value);
  return { kind: "input", name: name.value, type: def?.type ?? "any", source: t.source };
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
  const items = p.parseDelimited("]");
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

//? Entry point (slice 1) - parse a single expression from a token stream.
export interface ExpressionResult {
  node: ASTNode;
  errors: ParseError[];
  warnings: ParseWarning[];
}

// Parse a single expression. The public program entry is parse() below; this
// stays for expression-level testing and reuse.
export function parseExpression(tokens: Token[], descriptor: LanguageDescriptor): ExpressionResult {
  const p = new Parser(tokens, descriptor);
  const node = p.parseExpr(0);
  if (!p.atEnd()) {
    const token = p.peek();
    p.error("unexpected_token", `Unexpected trailing '${token.value || token.kind}'`, token.source);
  }
  return { node, errors: p.errors, warnings: p.warnings };
}

//? Statements (slice 2)
interface Statement {
  target: "binding" | "output";
  name: string;
  node: ASTNode;
  source: SourceRef;
}

// let NAME = EXPR  /  output NAME = EXPR. They differ only in which map they feed,
// so one helper covers both. The leading keyword is already matched by the caller.
function parseBinding(p: Parser, target: "binding" | "output"): Statement {
  p.advance(); // 'let' / 'output'
  const name = p.expect("ident");
  p.expect("punct", "=");
  const node = p.parseExpr(0);
  return { target, name: name.value, node, source: name.source };
}

// Statement registry, keyed by leading keyword — the same handler-table shape as
// NUDS/LEDS. User-defined statements register here in slice 4.
const STATEMENTS = new Map<string, (p: Parser) => Statement>([
  ["let", (p) => parseBinding(p, "binding")],
  ["output", (p) => parseBinding(p, "output")],
]);

// A statement begins with a registered keyword — the recovery anchor that
// `skipUntil` resyncs to. Lives here, with the statement layer, not on Parser.
const isStatementStart = (token: Token): boolean =>
  token.kind === "ident" && STATEMENTS.has(token.value);

//? Program entry: parse a token stream into a RawProgram.
// Gated: any error → no program. Lexer diagnostics are merged in by
// the source→program pipeline, not here.
// TODO: implement partial parsing where errored bindings are set to an error ast node, implement in analyser to drop all bindings and outputs that depend on it without error.
// TODO: Build some sort of pipeline helper to combine parser and lexer inputs and outputs.
export function parse(tokens: Token[], descriptor: LanguageDescriptor): ParseResult {
  const p = new Parser(tokens, descriptor);
  const bindings = new Map<string, ASTNode>();
  const outputs = new Map<string, ASTNode>();

  while (!p.atEnd()) {
    const head = p.peek();
    const statement = head.kind === "ident" ? STATEMENTS.get(head.value) : undefined;
    if (!statement) {
      p.error(
        "syntax_error",
        `Expected a statement ('let' or 'output') but found '${head.value || head.kind}'`,
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
