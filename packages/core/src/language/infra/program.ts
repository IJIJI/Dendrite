import { ASTNode, CNode } from "./nodes";

//? Raw EXT Program - Parser output without validation. Nothing is computed with this.
export interface RawProgram {
  bindings: Map<string, ASTNode>;
  outputs: Map<string, ASTNode>;
}

// ? Core C Program - output of analyse, input to interpreter.
export interface CoreProgram {
  bindings: Map<string, CNode>;
  outputs: Map<string, CNode>;
}
