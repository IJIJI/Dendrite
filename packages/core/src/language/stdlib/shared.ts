import { type ASTNode, operationNode } from "../infra/nodes";

//? What more than one stdlib segment needs: the two symbol builders and the list guard.

// Operator desugar builders (pure - reference only ASTNodes, no `lang`). Module-level so
// they're defined once rather than rebuilt per createStdlib() call. They stay in stdlib:
// they encode stdlib's op-input naming convention (a/b for binary, nodes for variadic),
// which the core has no opinion about. The shared primitive (operationNode) is core
// (infra/nodes); the operator mechanism (registerInfix/Prefix) is the operator-agnostic
// grammar layer - putting these here keeps that convention out of those layers.
export const bin =
  (op: string) =>
  (l: ASTNode, r: ASTNode): ASTNode =>
    operationNode(op, { a: l, b: r });
export const variadic =
  (op: string) =>
  (l: ASTNode, r: ASTNode): ASTNode =>
    operationNode(op, { nodes: [l, r] });

// A value as a list: the one rule every list op shares, so a null (or anything that is not a
// list, reaching the op through `any`) reads as the empty list and no op throws on it. It is
// the list counterpart of Convert.toString, and Join uses both.
export const toList = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
