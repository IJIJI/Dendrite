import { Type } from "./types";

//? SourceRef: Points back to the origin of a node in either editor. The code variant is
// a single point (line/column) + the length of a representative token - NOT yet a full
// start→end span. Compound / operator nodes carry their most representative token's ref.
// TODO (when the code editor lands): decide the highlight model - true multi-token ranges
// (would need an absolute offset or end position added here) vs representative-token vs
// whole-line. Rete highlights the whole node (nodeId), so ranges are a code-editor concern.
export type SourceRef =
  | { kind: "code"; line: number; column: number; length: number }
  | { kind: "rete"; nodeId: string };

//? LiteralValue - Used for primitives only for now.
//  TODO: Add more complex types (structs, object even? etc.) in the future.
//  TODO: Add undefined for optional values? Or should they always have a default or use null?
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
  value: LiteralValue;
  source?: SourceRef;
}

// Combine an array of ASTNodes into a single array value.
export interface ArrayNode {
  kind: "array";
  items: ASTNode[];
  type: Type;
  source?: SourceRef;
}

// A named value loaded from context before eval: sourceBusNew, fallbackState
export interface InputNode {
  kind: "input";
  name: string;
  type: Type;
  source?: SourceRef;
}

// A reference to a named binding: Set x = ...; use x elsewhere
export interface RefNode {
  kind: "ref";
  name: string;
  source?: SourceRef;
}

// A named operation applied to named inputs: And(nodes: [s1, s2]), BusSources(busId: "...")
// inputs values are either a single ASTNode or ASTNode[] for variadic inputs.
// Variadic inputs are only valid for OpInputs with variadic: true.
export interface OperationNode {
  kind: "operation";
  op: string;
  inputs: Record<string, OpInputType>;
  output: Type;
  source?: SourceRef;
}

// Constructor for an OperationNode. `output` defaults to `any` for callers that don't
// know it yet (e.g. operator desugars - the analyser overrides `output` from the op
// definition); the parser passes the declared output and a source span.
export const operationNode = (
  op: string,
  inputs: OperationNode["inputs"],
  opts: { output?: Type; source?: SourceRef } = {},
): OperationNode => ({
  kind: "operation",
  op,
  inputs,
  output: opts.output ?? Type.any,
  source: opts.source,
});

// Field access on a struct-typed node: bus.program
// Used for ops that return a struct type.
export interface FieldAccessNode {
  kind: "field";
  struct: ASTNode;
  field: string;
  type: Type;
  source?: SourceRef;
}

// A lambda param: ordered, with an optional type annotation.
// Untyped params default to `any` at analysis time (gradual typing).
export interface LambdaParam {
  name: string;
  type?: Type;
}

/**
 * A first-class function value: ordered params + an expression body.
 * The body is analysed/evaluated in a scope extended with the params (lexical) -
 * see localBindings in the analyser/evaluator.
 *
 * returnType - optional annotation, checked against the inferred body type. The inferred
 * function Type lives only on the analysed CLambdaNode (raw nodes carry no type).
 */
export interface LambdaNode {
  kind: "lambda";
  params: LambdaParam[];
  body: ASTNode;
  returnType?: Type;
  source?: SourceRef;
}

/**
 * Function application: callee(args). The callee is any expression of function
 * type (a lambda, a ref to one, …). Arguments may be positional and/or named -
 * named keys match the callee's param names. The analyser resolves them into a
 * single ordered arg list aligned to the params (see CAppNode.args). The application's
 * result type lives only on the analysed CAppNode (raw nodes carry no type).
 */
// TODO: Should raw ASTNodes even have type?
export interface AppNode {
  kind: "app";
  callee: ASTNode;
  positional: ASTNode[];
  named: Record<string, ASTNode>;
  source?: SourceRef;
}

export type ASTNode =
  | LiteralNode
  | ArrayNode
  | InputNode
  | RefNode
  | OperationNode
  | FieldAccessNode
  | LambdaNode
  | AppNode;

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
  readonly type: Type; // required post-analysis
}
export interface CInputNode extends InputNode, Analysed {}
export interface CRefNode extends RefNode, Analysed {
  readonly type: Type; // required post-analysis
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

// Analysed lambda. `returnType` is intentionally omitted: post-analysis the resolved
// `type` is the single source of truth - `type.returns` already holds the annotation
// (if one was given) or the inferred body type. The raw annotation lives only on the
// unanalysed LambdaNode.
export interface CLambdaNode extends Omit<LambdaNode, "body" | "returnType">, Analysed {
  readonly body: CNode;
  readonly type: Type; // required post-analysis: inferred function Type (Type.fn)
}

// Analysed application: positional/named args are resolved into `args`, ordered to
// match the callee's params. The evaluator binds them positionally to the closure.
export interface CAppNode extends Analysed {
  kind: "app";
  readonly callee: CNode;
  readonly args: CNode[];
  readonly type: Type; // required post-analysis: the function's return type
  readonly source?: SourceRef;
}

export interface CErrorNode extends Analysed {
  kind: "error";
  readonly type?: Type; // known output type when available (e.g. wrong_node_kind_for_op);
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
  | CLambdaNode
  | CAppNode
  | CErrorNode;
