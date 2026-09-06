//? The identifier rule, owned in infra so the lexer (parser layer) and ports (infra) agree by
// construction instead of by mirroring: [a-zA-Z_][a-zA-Z0-9_]*, minus the words the lexer turns
// into literal values. A port, binding or output name is exactly what the lexer returns as one
// `ident` token.

export const isIdentifierStart = (ch: string): boolean => /[a-zA-Z_]/.test(ch);

export const isIdentifierPart = (ch: string): boolean =>
  isIdentifierStart(ch) || (ch >= "0" && ch <= "9");

/** Words the lexer lexes as values, never as identifiers. */
export const LITERAL_WORDS: ReadonlySet<string> = new Set(["true", "false", "null"]);

/** Is `name` a legal identifier: lexes as a single `ident` token? */
export const isIdentifier = (name: string): boolean =>
  name.length > 0 &&
  isIdentifierStart(name.charAt(0)) &&
  [...name].every(isIdentifierPart) &&
  !LITERAL_WORDS.has(name);
