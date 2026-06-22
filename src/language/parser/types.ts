import { SourceRef } from "../infra/nodes";
import { RawProgram } from "../infra/program";

//? Parsing
export type ParseErrorKind =
  | "syntax_error"
  | "unexpected_token"
  | "unexpected_end"
  | "duplicate_binding"
  // Lexer-originated errors (recoverable: the lexer never throws).
  | "unterminated_string"
  | "unknown_character";

export interface ParseError {
  kind: ParseErrorKind;
  message: string;
  source?: SourceRef;
}

export type ParseWarningKind =
  | "deprecated_syntax"
  // Lexer-originated warnings.
  | "unterminated_comment"
  | "invalid_escape";

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
