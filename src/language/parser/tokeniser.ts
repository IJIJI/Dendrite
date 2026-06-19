import { SourceRef } from "../infra/nodes"

export type TokenKind =
  | 'keyword'   // let, output
  | 'ident'     // myVar, Filter, sourceBus
  | 'string'    // "hello"
  | 'number'    // 3, 3.14
  | 'boolean'   // true, false
  | 'null'      // null
  | 'punct'     // ( ) [ ] { } , . : = => == != > >= < <= + - * / % !
  | 'eof'

export interface Token {
  kind:   TokenKind
  value:  string      // raw source text of this token
  source: SourceRef
}