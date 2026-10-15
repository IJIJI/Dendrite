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

// The skip: the numbers in a list, with a null item, or an item of another kind that reached
// the list through `any`, left out. Average, Max and Min read their list through it, so
// `Average([1, null])` is 1 and `Max([-4, null])` is -4 (0.8.0, option B). The list itself is
// a list by the time an op runs: the evaluator gives null for a null, or anything that is no
// list, before the op is called, so this is the one guard the stdlib keeps.
export const numbersOf = (list: unknown): number[] =>
  (list as unknown[]).filter((item): item is number => typeof item === "number");
