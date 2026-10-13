import { isIdentifier } from "../infra/identifier";
import { type ASTNode, type SourceRef } from "../infra/nodes";
import { type Type } from "../infra/types";
import { LEXER_OWNED, type Token } from "./lexer";
import { type Parser } from "./parser";

//? Grammar registration API.
// Grammar is a parser-layer artifact (handlers reference the Parser) and per-language:
// the core installs the base grammar, extensions add to it (operators, statements, …).
// The Parser dispatches from a Grammar instance. The Parser itself stays grammar-agnostic.

// nud (null denotation): how a token STARTS an expression (prefix position).
// led (left denotation): how a token CONTINUES one, given a parsed left (infix/postfix).
// bp is the led's left binding power - higher binds tighter (so `*` over `+`, see BP).
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
  /** The annotation, when the statement states a type: `let rows: number[] = …`. */
  type?: Type;
}
export type StatementFn = (p: Parser) => Statement;

export interface Grammar {
  nuds: Map<string, Nud>; // keyOf → prefix handler
  leds: Map<string, Led>; // keyOf → infix/postfix handler (+ binding power)
  // A led keyed by a WORD (`as`), not a token kind. Every identifier shares the key "ident"
  // in `leds`, so a word that continues an expression has to be looked up by its text, the way
  // a statement keyword is. The word stays an ordinary name everywhere else: `let as = 1` is
  // fine, because a led is only consulted after an expression.
  wordLeds: Map<string, Led>;
  statements: Map<string, StatementFn>; // leading keyword → statement handler
}

export const createGrammar = (): Grammar => ({
  nuds: new Map(),
  leds: new Map(),
  wordLeds: new Map(),
  statements: new Map(),
});

// The kernel consults each map for one token kind only, so a handler in the wrong map never
// fires, silently. The guards make that a throw at registration instead. A nud or a led is
// keyed by a token's grammar key: its text for punctuation, its kind for everything else. A
// word that is no kind can never be reached - the lexer scans letters as an identifier, whose
// key is "ident" - so `registerLed("as", …)` would sit in the map and never match. The
// reverse holds for a word-led, which must be an identifier.
const assertKey = (what: string, key: string, advice: string): void => {
  if (isIdentifier(key) && !LEXER_OWNED.has(key)) {
    throw new Error(`${what}: '${key}' is a word, which the lexer reads as an identifier${advice}`);
  }
};

export const registerNud = (g: Grammar, key: string, nud: Nud): void => {
  assertKey("registerNud", key, "");
  g.nuds.set(key, nud);
};
export const registerLed = (g: Grammar, key: string, led: Led): void => {
  assertKey("registerLed", key, "; use registerWordLed");
  g.leds.set(key, led);
};
export const registerWordLed = (g: Grammar, word: string, led: Led): void => {
  if (!isIdentifier(word)) {
    throw new Error(
      `registerWordLed: '${word}' is not an identifier; use registerLed for a symbol`,
    );
  }
  g.wordLeds.set(word, led);
};

// Bring a base grammar's entries into an extension's: an entry the extension already has wins.
// The one place that knows every collection a Grammar has, so a new one is added here and
// nowhere else (extendLanguage used to copy each by hand).
export function mergeGrammar(into: Grammar, from: Grammar): void {
  const keep = <V>(target: Map<string, V>, source: Map<string, V>) =>
    source.forEach((v, k) => {
      if (!target.has(k)) target.set(k, v);
    });
  keep(into.nuds, from.nuds);
  keep(into.leds, from.leds);
  keep(into.wordLeds, from.wordLeds);
  keep(into.statements, from.statements);
}
export const registerStatement = (g: Grammar, key: string, fn: StatementFn): void =>
  void g.statements.set(key, fn);

// The symbols the lexer must read as tokens: every nud and led key the lexer does not own on
// its own (a token kind, structural punctuation, the two arrows, the backtick). Derived from
// the handler maps when a source is tokenised, so a registered symbol reaches the lexer with
// no second list to keep in step - and a handler on a word can never be one, by the guards.
export function symbolsOf(g: Grammar): ReadonlySet<string> {
  const symbols = new Set<string>();
  for (const key of [...g.nuds.keys(), ...g.leds.keys()]) {
    if (!LEXER_OWNED.has(key)) symbols.add(key);
  }
  return symbols;
}

//? Operator sugar over registerLed / registerNud. An operator is pure surface: it
// builds an AST node from its operands (`build` references only ASTNodes - no Parser -
// so it stays infra-friendly). The lexer learns the token from the handler's key (symbolsOf).
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
  registerNud(g, token, (p, tok) => {
    const node = build(p.parseExpr(bp));
    return node.source ? node : { ...node, source: tok.source };
  });
};
