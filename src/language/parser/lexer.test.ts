import { describe, expect, it } from "vitest";
import { tokenise, type Token, type TokenKind } from "./lexer";

// A representative stdlib-like operator set. Core Dendrite has no operators, so
// any test exercising them passes its own vocabulary - exactly how the assembled
// language will hand operators to the lexer.
const OPS = ["=>", "==", "!=", ">=", "<=", "!", "<", ">", "+", "-", "*", "/", "%"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Token kinds excluding the trailing eof - the part each test actually asserts.
function kinds(src: string, operators?: readonly string[]): TokenKind[] {
  return tokenise(src, operators)
    .tokens.slice(0, -1)
    .map((t) => t.kind);
}

function values(src: string, operators?: readonly string[]): string[] {
  return tokenise(src, operators)
    .tokens.slice(0, -1)
    .map((t) => t.value);
}

function first(src: string): Token {
  return tokenise(src).tokens[0];
}

// ─── Literals ───────────────────────────────────────────────────────────────

describe("literals", () => {
  it("integer", () => {
    expect(kinds("42")).toEqual(["number"]);
    expect(values("42")).toEqual(["42"]);
  });

  it("decimal", () => {
    expect(values("3.14")).toEqual(["3.14"]);
    expect(kinds("3.14")).toEqual(["number"]);
  });

  it("trailing dot is not part of the number", () => {
    expect(kinds("3.")).toEqual(["number", "punct"]);
    expect(values("3.")).toEqual(["3", "."]);
  });

  it("leading dot is punctuation, not a number", () => {
    expect(kinds(".5")).toEqual(["punct", "number"]);
    expect(values(".5")).toEqual([".", "5"]);
  });

  it("string value excludes the quotes; source spans them", () => {
    const tok = first('"hello"');
    expect(tok.kind).toBe("string");
    expect(tok.value).toBe("hello");
    expect(tok.source).toEqual({ kind: "code", line: 1, column: 1, length: 7 });
  });

  it("true/false are boolean, null is null", () => {
    expect(kinds("true")).toEqual(["boolean"]);
    expect(kinds("false")).toEqual(["boolean"]);
    expect(kinds("null")).toEqual(["null"]);
  });
});

// ─── Strings: quotes & escapes ────────────────────────────────────────────────

describe("strings", () => {
  it("single and double quotes are interchangeable", () => {
    expect(first("'hello'").value).toBe("hello");
    expect(first('"hello"').value).toBe("hello");
  });

  it("the other quote inside needs no escape", () => {
    expect(first(`"it's"`).value).toBe("it's");
    expect(first(`'say "hi"'`).value).toBe('say "hi"');
  });

  it("recognised escapes are translated", () => {
    expect(first('"line\\nbreak"').value).toBe("line\nbreak");
    expect(first('"a\\tb"').value).toBe("a\tb");
    expect(first('"quote: \\""').value).toBe('quote: "');
    expect(first('"back\\\\slash"').value).toBe("back\\slash");
  });

  it("escaped quote keeps the literal quote; source spans the whole literal", () => {
    const tok = first('"with \\" escape"');
    expect(tok.value).toBe('with " escape');
    expect(tok.source).toEqual({ kind: "code", line: 1, column: 1, length: 16 });
  });

  it("unknown escape is preserved verbatim and warned", () => {
    const { tokens, warnings } = tokenise('"a\\qb"');
    expect(tokens[0].value).toBe("a\\qb");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].kind).toBe("invalid_escape");
  });
});

// ─── Identifiers (no keyword kind - parser resolves keywords) ─────────────────

describe("identifiers", () => {
  it("let and output are plain idents", () => {
    expect(kinds("let")).toEqual(["ident"]);
    expect(kinds("output")).toEqual(["ident"]);
    expect(values("let")).toEqual(["let"]);
  });

  it("prefixes of literal words are idents", () => {
    expect(kinds("letter")).toEqual(["ident"]);
    expect(kinds("trueish")).toEqual(["ident"]);
  });

  it("underscores and trailing digits are allowed", () => {
    expect(kinds("my_var2")).toEqual(["ident"]);
    expect(values("my_var2")).toEqual(["my_var2"]);
    expect(values("_private")).toEqual(["_private"]);
  });
});

// ─── Operators (longest-match) ────────────────────────────────────────────────

describe("operators", () => {
  it("=> is one token, not = then >", () => {
    expect(kinds("=>", OPS)).toEqual(["punct"]);
    expect(values("=>", OPS)).toEqual(["=>"]);
  });

  it("single = is structural and stays single even with operators present", () => {
    // = is core binding punctuation, not an operator - recognised with no OPS.
    expect(values("=")).toEqual(["="]);
    expect(values("=", OPS)).toEqual(["="]);
  });

  it("comparison operators", () => {
    expect(values("==", OPS)).toEqual(["=="]);
    expect(values(">=", OPS)).toEqual([">="]);
    expect(values("<=", OPS)).toEqual(["<="]);
    expect(values("!=", OPS)).toEqual(["!="]);
    expect(values(">", OPS)).toEqual([">"]);
    expect(values("<", OPS)).toEqual(["<"]);
    expect(values("!", OPS)).toEqual(["!"]);
  });

  it("longest match mid-stream", () => {
    expect(kinds("a>=b", OPS)).toEqual(["ident", "punct", "ident"]);
    expect(values("a>=b", OPS)).toEqual(["a", ">=", "b"]);
  });

  it("custom operators are supplied via the operators param", () => {
    expect(kinds("2**3", ["**"])).toEqual(["number", "punct", "number"]);
    expect(values("2**3", ["**"])).toEqual(["2", "**", "3"]);
  });

  it("=-3 is = then -3, not the operator =-", () => {
    // = is structural, - is an operator; =- is in neither set, so it splits.
    expect(values("=-3", OPS)).toEqual(["=", "-", "3"]);
  });

  it("core has no operators: an operator char is unknown without a vocabulary", () => {
    const { errors } = tokenise("1+2");
    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe("unknown_character");
  });
});

// ─── Negative numbers (tokeniser stays context-free) ──────────────────────────

describe("negative numbers", () => {
  it("-3 is two tokens", () => {
    expect(kinds("-3", OPS)).toEqual(["punct", "number"]);
    expect(values("-3", OPS)).toEqual(["-", "3"]);
  });

  it("a - 3 is subtraction-shaped", () => {
    expect(values("a - 3", OPS)).toEqual(["a", "-", "3"]);
  });
});

// ─── Comments discarded ───────────────────────────────────────────────────────

describe("comments", () => {
  it("line comment", () => {
    expect(kinds("// comment\n42")).toEqual(["number"]);
    expect(values("// comment\n42")).toEqual(["42"]);
  });

  it("block comment", () => {
    expect(values("/* block */42")).toEqual(["42"]);
  });

  it("multi-line block keeps line tracking correct", () => {
    const tok = tokenise("/* multi\nline */ 7").tokens[0];
    expect(tok.value).toBe("7");
    expect(tok.source).toEqual({ kind: "code", line: 2, column: 9, length: 1 });
  });
});

// ─── Source positions ─────────────────────────────────────────────────────────

describe("source positions", () => {
  it("leading whitespace shifts the column", () => {
    expect(first("  hello").source).toEqual({ kind: "code", line: 1, column: 3, length: 5 });
  });

  it("tracks line and column across newlines", () => {
    const tok = tokenise("a\n  b").tokens[1];
    expect(tok.value).toBe("b");
    expect(tok.source).toEqual({ kind: "code", line: 2, column: 3, length: 1 });
  });

  it("eof sits at the final position with length 0", () => {
    const { tokens } = tokenise("ab");
    const eof = tokens[tokens.length - 1];
    expect(eof.kind).toBe("eof");
    expect(eof.source).toEqual({ kind: "code", line: 1, column: 3, length: 0 });
  });
});

// ─── Diagnostics (recover, never throw) ───────────────────────────────────────

describe("diagnostics", () => {
  it("never throws on malformed input", () => {
    expect(() => tokenise('"unterminated')).not.toThrow();
    expect(() => tokenise("@")).not.toThrow();
  });

  it("unterminated string is a recoverable error", () => {
    const { tokens, errors } = tokenise('"abc');
    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe("unterminated_string");
    expect(tokens[0]).toMatchObject({ kind: "string", value: "abc" });
  });

  it("unknown character is an error and is skipped", () => {
    const { tokens, errors } = tokenise("a@b");
    expect(errors).toHaveLength(1);
    expect(errors[0].kind).toBe("unknown_character");
    expect(tokens.slice(0, -1).map((t) => t.value)).toEqual(["a", "b"]);
  });

  it("unterminated block comment is a warning, not an error", () => {
    const { errors, warnings } = tokenise("/* never closed");
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].kind).toBe("unterminated_comment");
  });

  it("clean input yields no diagnostics", () => {
    const { errors, warnings } = tokenise("let x = 3");
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });
});

// ─── Integration sanity ───────────────────────────────────────────────────────

describe("integration", () => {
  it("tokenises a full statement", () => {
    const src = "let x = Filter(sources, item => item.active)";
    expect(kinds(src, ["=>"])).toEqual([
      "ident", // let
      "ident", // x
      "punct", // =
      "ident", // Filter
      "punct", // (
      "ident", // sources
      "punct", // ,
      "ident", // item
      "punct", // =>
      "ident", // item
      "punct", // .
      "ident", // active
      "punct", // )
    ]);
    expect(values(src, ["=>"])).toEqual([
      "let",
      "x",
      "=",
      "Filter",
      "(",
      "sources",
      ",",
      "item",
      "=>",
      "item",
      ".",
      "active",
      ")",
    ]);
  });
});
