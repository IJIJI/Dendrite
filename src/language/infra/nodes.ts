//? SourceRef: Points back to the origin of a node in either editor.
export type SourceRef =
  | { kind: "code"; line: number; column: number; length: number }
  | { kind: "rete"; nodeId: string };

//? LiteralValue - Used for primitives only for now.
//  TODO: Add more complex types (structs, arrays, etc.) in the future.
//  TODO: Add null/undefined?
export type LiteralValue = string | number | boolean | null;

// InputType<T> - a single or variadic node (multiple connections in editor).
// OpInputType and COpInputType are concrete aliases of this generic.
export type InputType<T> = T | T[];
export type OpInputType = InputType<ASTNode>;
export type COpInputType = InputType<CNode>;

//? AST Nodes
// Primitive value definition
export interface LiteralNode {
  kind: "literal";
  type?: string; // derived by analyser from typeof value - not meaningful on raw nodes
  value: LiteralValue;
  source?: SourceRef;
}

// Combine an array of ASTNodes into a single array value.
export interface ArrayNode {
  kind: "array";
  items: ASTNode[];
  type: string;
  source?: SourceRef;
}

// A named value loaded from context before eval: sourceBusNew, fallbackState
export interface InputNode {
  kind: "input";
  name: string;
  type: string;
  source?: SourceRef;
}

// A reference to a named binding: Set x = ...; use x elsewhere
export interface RefNode {
  kind: "ref";
  name: string;
  type?: string; // set by analyser to the referenced binding's output type - not meaningful on raw nodes
  source?: SourceRef;
}

// A named operation applied to named inputs: And(nodes: [s1, s2]), BusSources(busId: "...")
// inputs values are either a single ASTNode or ASTNode[] for variadic inputs.
// Variadic inputs are only valid for OpInputs with variadic: true.
export interface OperationNode {
  kind: "operation";
  op: string;
  inputs: Record<string, OpInputType>;
  output: string;
  source?: SourceRef;
}

// Field access on a struct-typed node: bus.program
// Used for ops that return a struct type.
export interface FieldAccessNode {
  kind: "field";
  struct: ASTNode;
  field: string;
  type: string;
  source?: SourceRef;
}

/**
 * General higher-order operation.
 * Registered ops (e.g. Filter, Map, Find, Reduce) use this node type.
 *
 * inputs   - pre-resolved before calling the evaluator (like OperationNode)
 * bindings - scoped variable names, one per argument to apply()
 * body     - evaluated in a new environment per apply() call
 *
 * The evaluator receives pre-resolved inputs and a pre-built apply() function.
 * apply() handles environment extension and body evaluation internally.
 * Evaluators never see interpreter internals.
 */
// TODO: Should there even be a difference between higher order and standard? Could higher order not be a standard op with a function as its arg? Would enable multi function higher order nodes too..
export interface HigherOrderNode {
  kind: "higher_order";
  op: string;
  inputs: Record<string, OpInputType>;
  bindings: string[]; // ordered. Positional args to apply(), one per scoped variable
  body: ASTNode;
  /**
   * Optional in raw - editor sets from opDef.output, analyser infers and overrides.
   * Required on CHigherOrderNode.
   */
  output?: string;
  source?: SourceRef;
}

export type ASTNode =
  | LiteralNode
  | ArrayNode
  | InputNode
  | RefNode
  | OperationNode
  | FieldAccessNode
  | HigherOrderNode;

//? Analysed: metadata added by the analyser to every node.
//
//  dependsOn: which context input names transitively affect this node.
//  (set by analyser, enables cache check without binding lookup).
//  Used at evaluate time to skip recomputation when no dependency changed.
export interface Analysed {
  readonly dependsOn: ReadonlySet<string>;
}

//? CNodes analysed representation (CoreProgram).
// Each variant extends its ASTNode counterpart, overriding recursive fields
// with CNode variants and adding Analysed.
export interface CLiteralNode extends LiteralNode, Analysed {
  readonly type: string; // required post-analysis
}
export interface CInputNode extends InputNode, Analysed {}
export interface CRefNode extends RefNode, Analysed {
  readonly type: string; // required post-analysis
}

export interface CArrayNode extends Omit<ArrayNode, "items">, Analysed {
  readonly items: CNode[];
}

export interface COperationNode extends Omit<OperationNode, "inputs">, Analysed {
  readonly inputs: Record<string, COpInputType>;
}

export interface CFieldAccessNode extends Omit<FieldAccessNode, "struct">, Analysed {
  readonly struct: CNode;
}

export interface CHigherOrderNode extends Omit<HigherOrderNode, "inputs" | "body">, Analysed {
  readonly inputs: Record<string, COpInputType>;
  readonly body: CNode;
  readonly output: string; // required: analyser sets to inferred or opDef.output fallback
}

export interface CErrorNode extends Analysed {
  kind: "error";
  readonly type?: string; // known output type when available (e.g. wrong_node_kind_for_op);
  // absent when genuinely unknown (e.g. unknown_op)
  readonly source?: SourceRef; // origin location — for editor diagnostics and debugging
}

export type CNode =
  | CLiteralNode
  | CArrayNode
  | CInputNode
  | CRefNode
  | COperationNode
  | CFieldAccessNode
  | CHigherOrderNode
  | CErrorNode;
