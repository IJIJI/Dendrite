import { type ASTNode, operationNode } from "../infra/nodes";
import { Type } from "../infra/types";

//? What more than one stdlib segment needs: the two symbol builders, the list guard, and the
// type of an op that gives a list back.

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
// the list through `any`, left out. Sum, Average, Max and Min read their list through it, so
// `Average([1, null])` is 1 and `Max([-4, null])` is -4 (0.8.0, option B). The list itself is
// a list by the time an op runs: the evaluator gives null for a null, or anything that is no
// list, before the op is called, so this is the one guard the stdlib keeps.
// The list is `number[]` by declaration; its items are checked here, by kind, because the door
// checks a list's kind and not its items (the one limit of the typed keys, 0.8.1).
export const numbersOf = (list: readonly number[]): number[] =>
  list.filter((item) => typeof item === "number");

// The output type of an op that gives back a list of the same items (Filter, Sort, Slice, ...):
// the list's own type, so `number[]` in is `number[]` out.
export const sameListType = (inputTypes: Record<string, Type>): Type => {
  const list = inputTypes["list"];
  return list?.kind === "array" ? list : Type.array(Type.any);
};
