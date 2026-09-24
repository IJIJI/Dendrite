import { ASTNode, CNode } from "./nodes";
import { type Type } from "./types";

//? Raw EXT Program - Parser output without validation. Nothing is computed with this.
export interface RawProgram {
  bindings: Map<string, ASTNode>;
  outputs: Map<string, ASTNode>;
  /**
   * The type a binding states, `let rows: number[] = …`, keyed by its name. Kept beside the
   * node rather than on it: a raw node carries no type, and an annotation is a claim about
   * the binding, checked by the analyser, not a property of the expression. Absent when no
   * binding is annotated.
   */
  annotations?: Map<string, Type>;
}

// ? Core C Program - output of analyse, input to interpreter.
export interface CoreProgram {
  bindings: Map<string, CNode>;
  outputs: Map<string, CNode>;
}
