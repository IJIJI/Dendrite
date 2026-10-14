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
// highest); registered operators fill the middle tiers. The tiers are twenty apart so a
// module can slot a tier between two of these without renumbering anything.
//
// This ladder is a soft convention, not enforced: registerInfix/registerPrefix accept
// any `bp: number`. The named tiers exist so independent operator modules slot in
// consistently relative to each other and the core forms - prefer them unless you have a
// specific reason to pick a raw value.
export const BP = {
  ARROW: 20, // x => body  (lowest: body grabs everything to the right)
  CONDITIONAL: 40, // c ? a : b  (the else branch reads just below this, so it chains right)
  COALESCE: 60, // ??  (below ||, above ? :, as C#, PHP and JS have it)
  OR: 80, // ||
  AND: 100, // &&
  EQUALITY: 120, // ==  !=
  COMPARE: 140, // <  >  <=  >=
  ADD: 160, // +  -
  MULTIPLY: 180, // *  /
  PREFIX: 200, // !  (unary)
  CAST: 220, // as  (tight: `1 + $x as number` casts $x, `!$on as boolean` casts $on)
  MEMBER: 240, // .
  CALL: 260, // f(…)  (highest)
} as const;
