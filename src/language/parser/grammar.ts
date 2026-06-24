import { type ASTNode, type SourceRef } from "../infra/nodes";
import { type Token } from "./lexer";
import { type Parser } from "./parser";

//? Grammar registration API.
// Grammar is a parser-layer artifact (handlers reference the Parser) and per-language:
// the core installs the base grammar, extensions add to it (operators, statements, …).
// The Parser dispatches from a Grammar instance. The Parser itself stays grammar-agnostic.

// nud (null denotation): how a token STARTS an expression (prefix position).
// led (left denotation): how a token CONTINUES one, given a parsed left (infix/postfix).
// bp is the led's left binding power - higher binds tighter (so `*` (60) over `+` (50)).
export type Nud = (p: Parser, token: Token) => ASTNode;
export interface Led {
  bp: number;
  parse: (p: Parser, left: ASTNode, token: Token) => ASTNode;
}

// A parsed statement (let/output). target picks which program map it feeds.
export interface Statement {
  target: "binding" | "output";
  name: string;
  node: ASTNode;
  source: SourceRef;
}
export type StatementFn = (p: Parser) => Statement;

export interface Grammar {
  nuds: Map<string, Nud>; // keyOf → prefix handler
  leds: Map<string, Led>; // keyOf → infix/postfix handler (+ binding power)
  statements: Map<string, StatementFn>; // leading keyword → statement handler
  operatorTokens: Set<string>; // operator token strings the lexer must recognise (F1b)
}

export const createGrammar = (): Grammar => ({
  nuds: new Map(),
  leds: new Map(),
  statements: new Map(),
  operatorTokens: new Set(),
});

export const registerNud = (g: Grammar, key: string, nud: Nud): void => void g.nuds.set(key, nud);
export const registerLed = (g: Grammar, key: string, led: Led): void => void g.leds.set(key, led);
export const registerStatement = (g: Grammar, key: string, fn: StatementFn): void =>
  void g.statements.set(key, fn);

//? Operator sugar over registerLed / registerNud. An operator is pure surface: it
// builds an AST node from its operands (`build` references only ASTNodes - no Parser -
// so it stays infra-friendly). The token is added to operatorTokens for the lexer.
//
// The operator token's `source` is attached to the built node (unless `build` already
// set one) so desugared operator nodes are not source-less. This is a single
// representative token, NOT a computed start→end span - true ranges are deferred until a
// code editor consumes them (see the SourceRef note in infra/nodes.ts).

// Infix: `left OP right`. Left-associative by default; rightAssoc parses the RHS one
// tier lower so same-level operators nest to the right (e.g. `**`).
export const registerInfix = (
  g: Grammar,
  token: string,
  bp: number,
  build: (left: ASTNode, right: ASTNode) => ASTNode,
  rightAssoc = false,
): void => {
  g.operatorTokens.add(token);
  registerLed(g, token, {
    bp,
    parse: (p, left, tok) => {
      const node = build(left, p.parseExpr(rightAssoc ? bp - 1 : bp));
      return node.source ? node : { ...node, source: tok.source };
    },
  });
};

// Prefix: `OP operand`. bp governs how much of the operand it grabs.
export const registerPrefix = (
  g: Grammar,
  token: string,
  bp: number,
  build: (operand: ASTNode) => ASTNode,
): void => {
  g.operatorTokens.add(token);
  registerNud(g, token, (p, tok) => {
    const node = build(p.parseExpr(bp));
    return node.source ? node : { ...node, source: tok.source };
  });
};
