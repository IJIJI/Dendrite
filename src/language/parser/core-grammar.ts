import {
  type ASTNode,
  type LambdaParam,
  type LiteralNode,
  type LiteralValue,
  type OperationNode,
  operationNode,
} from "../infra/nodes";
import { type OpDefinition } from "../infra/registry";
import { Type } from "../infra/types";
import { type Token } from "./lexer";
import { type Parser } from "./parser";
import {
  BP,
  createGrammar,
  type Grammar,
  type Nud,
  registerLed,
  registerNud,
  registerStatement,
  type Statement,
} from "./grammar";

//? Dendrite's core grammar: the always-present syntax (literals, refs, the $ input
// sigil, grouping/lambda, arrays, field access, calls/application, and let/output
// statements), plus the productions those handlers use. Installed into a Grammar by
// installCoreGrammar; extensions (e.g. stdlib operators) register on top.

// The four literal nuds differ only in how the raw token text becomes a value.
const literalNud =
  (convert: (raw: string) => LiteralValue): Nud =>
  (_p, t): LiteralNode => ({ kind: "literal", value: convert(t.value), source: t.source });

// ── Productions ──────────────────────────────────────────────────────────────

type Arg = { kind: "positional"; node: ASTNode } | { kind: "named"; name: string; node: ASTNode };

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
function parseCallArgs(p: Parser): Arg[] {
  let sawNamed = false;
  return p.parseSeparated(")", () => {
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
      return operationNode(callee.name, inputs, { output: opDef.output, source: callee.source });
    }
  }

  return { kind: "app", callee, positional, named: Object.fromEntries(named), source: token.source };
}

// Positional args fill the op's declared inputs in order (a variadic input soaks all
// remaining); named args bind by name, overriding. Completeness (missing / unknown
// inputs) is the analyser's job, not the parser's.
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

// Lookahead from just after a '(': is the matching ')' followed by '=>'? Pure - never
// advances the cursor. Tracks nesting so function-typed params like
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
function parseLambdaParams(p: Parser): LambdaParam[] {
  return p.parseSeparated(")", () => {
    const name = p.expect("ident");
    const param: LambdaParam = { name: name.value };
    if (p.match("punct", ":")) param.type = parseType(p);
    return param;
  });
}

// Type sub-grammar for annotations (a separate little language - it yields a `Type`,
// not an `ASTNode`): NAME, T[], and (A, B) -> C function types, with parenthesised
// grouping so a function type can be a return or an array element.
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

function parseTypeAtom(p: Parser): Type {
  if (p.check("punct", "(")) {
    p.advance(); // (
    const types = p.parseSeparated(")", () => parseType(p));
    if (p.match("punct", "->")) return Type.fn(types, parseType(p));
    // No '->': a parenthesised grouping, valid only around a single type.
    if (types.length === 1) return types[0];
    p.error("syntax_error", "Expected '->' after a parenthesised type list", p.peek().source);
    return types[0] ?? Type.any;
  }
  const name = p.expect("ident");
  return Type.name(name.value);
}

// let NAME = EXPR  /  output NAME = EXPR. They differ only in which map they feed, so
// one helper covers both. The leading keyword is already matched by the caller.
function parseBinding(p: Parser, target: "binding" | "output"): Statement {
  p.advance(); // 'let' / 'output'
  const name = p.expect("ident");
  p.expect("punct", "=");
  const node = p.parseExpr(0);
  return { target, name: name.value, node, source: name.source };
}

// ── Installation ─────────────────────────────────────────────────────────────

export function installCoreGrammar(g: Grammar): void {
  // Literals
  registerNud(g, "number", literalNud(Number));
  registerNud(g, "string", literalNud((v) => v));
  registerNud(g, "boolean", literalNud((v) => v === "true"));
  registerNud(g, "null", literalNud(() => null));

  // Identifier → always a binding reference. Context inputs use the $ sigil, so a bare
  // name is never an input: no descriptor lookup, no shadowing.
  registerNud(g, "ident", (_p, t) => ({ kind: "ref", name: t.value, source: t.source }));

  // Input sigil: $name → InputNode. Type from the descriptor; an unknown name still
  // produces the node so the analyser's unknown_program_input fires.
  registerNud(g, "$", (p, t) => {
    const name = p.expect("ident");
    const def = p.descriptor.inputs.get(name.value);
    return { kind: "input", name: name.value, type: def?.type ?? Type.any, source: t.source };
  });

  // '(' opens either a parenthesised lambda - (x: T, y) => body, () => body - or a
  // grouping, told apart by a lookahead for '=>' after the matching ')'.
  registerNud(g, "(", (p, t) => {
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

  // Array literal: [ a, b, c ] with an optional trailing comma. ArrayNode.type is the
  // ELEMENT type; left as "any" for the analyser to derive.
  registerNud(g, "[", (p, t) => ({
    kind: "array",
    items: p.parseSeparated("]", () => p.parseExpr(0)),
    type: Type.any,
    source: t.source,
  }));

  // Single-parameter lambda without parens: x => body. The left, already parsed as a
  // ref, is reinterpreted as the (untyped) param. parseExpr(0) makes the body extend
  // as far right as possible (lowest precedence) and right-associative.
  registerLed(g, "=>", {
    bp: BP.ARROW,
    parse: (p, left, token) => {
      const params: LambdaParam[] = [];
      if (left.kind === "ref") params.push({ name: left.name });
      else p.error("syntax_error", "A lambda parameter must be a name", token.source);
      const body = p.parseExpr(0);
      return { kind: "lambda", params, body, source: left.source ?? token.source };
    },
  });

  // Field access: left . field  (left-associative via the loop in parseExpr).
  registerLed(g, ".", {
    bp: BP.MEMBER,
    parse: (p, left) => {
      const name = p.expect("ident");
      return { kind: "field", struct: left, field: name.value, type: Type.any, source: name.source };
    },
  });

  // Call / application: callee(args). Callee may be any left expression.
  registerLed(g, "(", {
    bp: BP.CALL,
    parse: (p, left, token) => buildCall(p, left, parseCallArgs(p), token),
  });

  // Statements
  registerStatement(g, "let", (p) => parseBinding(p, "binding"));
  registerStatement(g, "output", (p) => parseBinding(p, "output"));
}

// The base grammar - a fresh Grammar with the core forms installed.
export function createCoreGrammar(): Grammar {
  const g = createGrammar();
  installCoreGrammar(g);
  return g;
}
