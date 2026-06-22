import {
  type ArrayNode,
  type ASTNode,
  type FieldAccessNode,
  type InputNode,
  type LambdaParam,
  type LiteralNode,
  type LiteralValue,
  type OperationNode,
  type RefNode,
  type SourceRef,
} from "../infra/nodes";
import { type LanguageDescriptor, type OpDefinition } from "../infra/registry";
import { Type } from "../infra/types";
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
// member access (.) and call (() are infix forms, and the lambda arrow (=>) is the
// lowest-binding, right-associative infix (so `x => body` grabs the whole body).
const BP = {
  ARROW: 5,
  MEMBER: 90,
  CALL: 100,
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

  // Comma-separated items up to a closing punct, trailing comma allowed. The kernel
  // list primitive: arrays, call-args, lambda-params and type-lists all build on it,
  // each supplying its own per-item parser.
  separated<T>(close: string, parseItem: () => T): T[] {
    const items: T[] = [];
    while (!this.check("punct", close) && !this.atEnd()) {
      items.push(parseItem());
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
// The four literal nuds differ only in how the raw token text becomes a value.
const literalNud =
  (convert: (raw: string) => LiteralValue): Nud =>
  (_p, t): LiteralNode => ({ kind: "literal", value: convert(t.value), source: t.source });

NUDS.set("number", literalNud(Number));
NUDS.set("string", literalNud((v) => v));
NUDS.set("boolean", literalNud((v) => v === "true"));
NUDS.set("null", literalNud(() => null));

// Identifier → always a binding reference. Context inputs use the $ sigil
// (below), so a bare name is never an input: no descriptor lookup, no shadowing.
NUDS.set("ident", (_p, t): RefNode => ({ kind: "ref", name: t.value, source: t.source }));

// Input sigil: $name → InputNode. Declared type comes from the descriptor; an
// unknown name still produces the node so the analyser's unknown_program_input
// fires (it overrides the type for valid inputs anyway).
NUDS.set("$", (p, t): InputNode => {
  const name = p.expect("ident");
  const def = p.descriptor.inputs.get(name.value);
  return { kind: "input", name: name.value, type: def?.type ?? Type.any, source: t.source };
});

// '(' opens either a parenthesised lambda - (x: T, y) => body, () => body - or a
// grouping. They're told apart by a lookahead: a '(' whose matching ')' is followed
// by '=>' is a lambda param list; otherwise the parens only steer precedence.
NUDS.set("(", (p, t): ASTNode => {
  if (arrowParamsAhead(p)) {
    const params = parseLambdaParams(p);
    p.expect("punct", "=>");
    const body = p.parseExpr(0);
    return { kind: "lambda", params, body, source: t.source };
  }
  const inner = p.parseExpr(0);
  p.expect("punct", ")");
  return inner;
});

// Single-parameter lambda without parens: x => body. The left, already parsed as a
// ref, is reinterpreted as the (untyped) parameter. parseExpr(0) makes the body
// extend as far right as possible (lowest precedence) and right-associative.
LEDS.set("=>", {
  bp: BP.ARROW,
  parse: (p, left, token): ASTNode => {
    const params: LambdaParam[] = [];
    if (left.kind === "ref") {
      params.push({ name: left.name });
    } else {
      p.error("syntax_error", "A lambda parameter must be a name", token.source);
    }
    const body = p.parseExpr(0);
    return { kind: "lambda", params, body, source: left.source ?? token.source };
  },
});

// Array literal: [ a, b, c ] with an optional trailing comma. ArrayNode.type is
// the ELEMENT type; left as "any" for the analyser to derive.
NUDS.set("[", (p, t): ArrayNode => {
  const items = p.separated("]", () => p.parseExpr(0));
  return { kind: "array", items, type: Type.any, source: t.source };
});

// Field access: left . field  (left-associative via the loop in parseExpr).
LEDS.set(".", {
  bp: BP.MEMBER,
  parse: (p, left): FieldAccessNode => {
    const name = p.expect("ident");
    return { kind: "field", struct: left, field: name.value, type: Type.any, source: name.source };
  },
});

// Call: callee(args) → OperationNode. The callee may be any left expression
// (keeping f(3) / lambdas open); for now only a ref to a registered op is callable.
LEDS.set("(", {
  bp: BP.CALL,
  parse: (p, left, token) => buildCall(p, left, parseCallArgs(p), token),
});

//? Call arguments (slice 3a)
// Arrows for higher-order bodies are in slice 3b. They slot in as another Arg variant.
type Arg =
  | { kind: "positional"; node: ASTNode }
  | { kind: "named"; name: string; node: ASTNode };

// IDENT ':' EXPR is a named argument; anything else is positional.
function parseArg(p: Parser): Arg {
  if (p.check("ident") && p.peek(1).kind === "punct" && p.peek(1).value === ":") {
    const name = p.advance().value;
    p.advance(); // ':'
    return { kind: "named", name, node: p.parseExpr(0) };
  }
  return { kind: "positional", node: p.parseExpr(0) };
}

// Parse a (…)-delimited argument list, enforcing positional-before-named.
// Consumes the closing ')'.
function parseCallArgs(p: Parser): Arg[] {
  let sawNamed = false;
  return p.separated(")", () => {
    const start = p.peek();
    const arg = parseArg(p);
    if (arg.kind === "named") sawNamed = true;
    else if (sawNamed) {
      p.error("syntax_error", "Positional argument after a named argument", start.source);
    }
    return arg;
  });
}

// callee(args) is one of two things: an OperationNode when the callee is a ref to a
// registered op, or otherwise a function application (AppNode) - a ref to a lambda
// binding, a lambda literal, another application, … . Whether a non-op callee is
// actually callable is the analyser's check (app_callee_not_function), not ours.
function buildCall(p: Parser, callee: ASTNode, args: Arg[], token: Token): ASTNode {
  const positional: ASTNode[] = [];
  const named = new Map<string, ASTNode>();
  for (const arg of args) {
    if (arg.kind === "positional") positional.push(arg.node);
    else named.set(arg.name, arg.node);
  }

  if (callee.kind === "ref") {
    const opDef = p.descriptor.ops.get(callee.name);
    if (opDef) {
      const inputs = mapArgsToInputs(p, opDef, positional, named, token);
      return {
        kind: "operation",
        op: callee.name,
        inputs,
        output: opDef.output,
        source: callee.source,
      };
    }
  }

  return {
    kind: "app",
    callee,
    positional,
    named: Object.fromEntries(named),
    source: token.source,
  };
}

// Positional args fill the op's declared inputs in order (a variadic input soaks
// all remaining); named args bind by name, overriding. Completeness (missing /
// unknown inputs) is the analyser's job, not the parser's.
function mapArgsToInputs(
  p: Parser,
  opDef: OpDefinition,
  positional: ASTNode[],
  named: Map<string, ASTNode>,
  token: Token,
): OperationNode["inputs"] {
  const inputs: OperationNode["inputs"] = {};
  let pi = 0;
  for (const input of opDef.inputs) {
    if (input.variadic) {
      inputs[input.name] = positional.slice(pi);
      pi = positional.length;
    } else if (pi < positional.length) {
      inputs[input.name] = positional[pi++];
    }
  }
  if (pi < positional.length) {
    p.error("syntax_error", `Too many positional arguments for '${opDef.name}'`, token.source);
  }
  for (const [name, node] of named) inputs[name] = node;
  return inputs;
}

//? Lambda & type parsing (slice 3b)

// Lookahead from just after a '(': is the matching ')' followed by '=>'? Pure - it
// never advances the cursor. Tracks nesting so function-typed params like
// (f: (number) -> boolean) are spanned correctly.
function arrowParamsAhead(p: Parser): boolean {
  let depth = 1; // the '(' that triggered this nud is already consumed
  for (let i = 0; ; i++) {
    const t = p.peek(i);
    if (t.kind === "eof") return false;
    if (t.kind === "punct" && t.value === "(") depth++;
    else if (t.kind === "punct" && t.value === ")") {
      if (--depth === 0) {
        const after = p.peek(i + 1);
        return after.kind === "punct" && after.value === "=>";
      }
    }
  }
}

// Param list of a parenthesised lambda: NAME (':' TYPE)? , … . The opening '(' is
// already consumed; this consumes through the closing ')'.
// TODO: This is a combination of a single type atom parse and a complete param crawler. Should this be split somehow?
function parseLambdaParams(p: Parser): LambdaParam[] {
  return p.separated(")", () => {
    const name = p.expect("ident");
    const param: LambdaParam = { name: name.value };
    if (p.match("punct", ":")) param.type = parseType(p);
    params.push(param);
    if (!p.match("punct", ",")) break;
  }
  p.expect("punct", ")");
  return params;
}

// Type sub-grammar for annotations: NAME, T[], and (A, B) -> C function types
// (with parenthesised grouping, so a function type can be a return or an element).
function parseType(p: Parser): Type {
  let t = parseTypeAtom(p);
  // Array suffixes: T[], T[][], …
  while (p.check("punct", "[") && p.peek(1).kind === "punct" && p.peek(1).value === "]") {
    p.advance(); // [
    p.advance(); // ]
    t = Type.array(t);
  }
  return t;
}

// TODO: This is a combination of a single type atom parse and a complete param crawler. Should this be split somehow?
function parseTypeAtom(p: Parser): Type {
  if (p.check("punct", "(")) {
    p.advance(); // (
    const types: Type[] = [];
    while (!p.check("punct", ")") && !p.atEnd()) {
      types.push(parseType(p));
      if (!p.match("punct", ",")) break;
    }
    p.expect("punct", ")");
    if (p.match("punct", "->")) {
      return Type.fn(types, parseType(p));
    }
    // No '->': a parenthesised grouping, valid only around a single type.
    if (types.length === 1) return types[0];
    p.error("syntax_error", "Expected '->' after a parenthesised type list", p.peek().source);
    return types[0] ?? Type.any;
  }
  const name = p.expect("ident");
  return Type.name(name.value);
}

// TODO: Make slice ordering linear
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
