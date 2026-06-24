//? Dendrite's precedence ladder - the shared binding-power contract.
//
// This is NOT a kernel primitive: the Pratt kernel (parser.ts) and the generic
// registration API (grammar.ts) deal only in `bp: number`. Precedence is a whole-
// language property - a single total order every operator must agree on - so it lives
// in its own module that both the core forms (core-grammar.ts) and any operator-
// providing module (stdlib, future extensions) import. That shared authority is what
// lets independent operator modules slot in consistently.
//
// Higher binds tighter. The core forms own the ends (ARROW lowest, MEMBER/CALL
// highest); registered operators fill the middle tiers.
// TODO: This is currently defined to help future grammar additions, and doesn't necessarily need to be used. Should it be like this?
export const BP = {
  ARROW: 5, // x => body  (lowest: body grabs everything to the right)
  OR: 10, // ||
  AND: 20, // &&
  EQUALITY: 30, // ==  !=
  COMPARE: 40, // <  >  <=  >=
  ADD: 50, // +  -
  MULTIPLY: 60, // *  /
  PREFIX: 70, // !  (unary)
  MEMBER: 90, // .
  CALL: 100, // f(…)  (highest)
} as const;
