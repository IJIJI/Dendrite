import { SourceRef } from "../infra/nodes";
import { RawProgram } from "../infra/program";


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
