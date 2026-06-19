import { SourceRef } from "../infra/nodes";
import { RawProgram } from "../infra/program";

//? Tokenization
export type TokenKind =
  | "keyword" // let, output
  | "ident" // myVar, Filter, sourceBus
  | "string" // "hello"
  | "number" // 3, 3.14
  | "boolean" // true, false
  | "null" // null
  | "punct" // ( ) [ ] { } , . : = => == != > >= < <= + - * / % !
  | "eof";

export interface Token {
  kind: TokenKind;
  value: string; // raw source text of this token
  source: SourceRef;
}


//? Parsing
export type ParseErrorKind =
  | "syntax_error"
  | "unexpected_token"
  | "unexpected_end"
  | "duplicate_binding";

export interface ParseError {
  kind: ParseErrorKind;
  message: string;
  source?: SourceRef;
}

export type ParseWarningKind = "deprecated_syntax";

export interface ParseWarning {
  kind: ParseWarningKind;
  message: string;
  source?: SourceRef;
}

export interface ParseSuccess {
  ok: true;
  program: RawProgram;
  warnings: ParseWarning[];
}

export interface ParseFailure {
  ok: false;
  errors: ParseError[];
  warnings: ParseWarning[];
}

export type ParseResult = ParseSuccess | ParseFailure;
