# Dendrite — Todo

The near future: what is being worked on now, and what comes straight after. Anything for
some later point in time is in `backlog.md`; finished work, kept for its reasoning, is in
`done.md`.

---

## Learn — the samples step (collecting observations, then one plan)

**What:** the user is working through the Learn section page by page (started 2026-09-18). Their
observations are collected here and built as ONE step once Learn is done, rather than piecemeal,
since most of them touch the same files. Decided so far:

- **Live where a sample shows a warning.** The three `den warns` fences left - `let unused = 99`
  (bindings and outputs), the closure shadowing `n` (lambdas and lists), `Length($whatever)`
  (types in practice) - become live MinimalLayout editors, **editable** like every live block,
  with the warning edge. A live block shows the squiggle AND the value the program still makes.
- **A full colouring pass.** Every inline Dendrite snippet marked `{:den}`: about 40 in Learn are
  plain today, nearly all of them the symbols table (`>=`, `&&`, `!` and the op names beside
  them), plus `$price`, `60`, `29.95`. Inline identifiers take the editor's identifier colour -
  `code.den .tok-ident { color: inherit }` in dendrite.css is what makes them grey today.
- **One highlighter.** `OpsReference.astro` (op signatures) and `components/diagnostics.ts`
  (types, declarations) hand-apply `tok-*` spans and escape HTML themselves. Build those as
  Dendrite-shaped strings - `Add(nodes...: number) -> number`, `Bus { id: number }` - and run
  them through the editor's `sourceParts`, so every snippet on the site is coloured by the one
  highlighter the editor uses. Check first that the lexer copes with `{`, `}` and `...`.
- **A type colour, in type positions.** A new `tok-type` class and `--dendrite-syntax-type` token.
  The editor's highlighter marks a name as a type when it is a registered type in a type
  position - after the `:` of a lambda parameter - and an inline snippet that is a type on its
  own (`number{:den}`) gets it too. NOT every name that matches a type: a binding may share one.
- **The chain.** On Learn's *How a program runs*: lex, parse, compose, analyse, evaluate - the
  lexer is missing today, and compose is only a note on an arrow. On How it works' *The chain*:
  the full version - lex, parse, desugar, compose, analyse, prune, evaluate - with a section
  diving into each step. `Chain.astro` serves both pages today, so it needs a detail setting.
- **No dashes as punctuation** in any docs prose: each rewritten by hand as a comma, colon or
  parentheses. Code, tables and lists untouched.

**Candidate, not decided:** show what every ```den fence produces - its output values, or the
diagnostic it raises - the way the ops reference and *Every diagnostic* already do, by running
each fence at build time in `remark-den.ts`. Proposed on 2026-09-17 as "the step to add more
editors"; it was never written down until now.

**Still to collect:** the rest of the user's Learn observations.

---

## Release — the next version, and why it is 0.2.0

**What:** everything since 0.1.0 is committed on `dev` and not yet on npm. It was going to be
0.1.1 - `require()` for editor and link, and the branded npm pages - and grew:

- **core:** negative numbers (`Negate`, prefix `-`), lexical order enforced for outputs,
  whole-`$name` input spans, variadic inputs reaching `inferOutput` (`Concat` typed), and the
  `AnalysisContext.currentBindingIndex` → `currentDeclarationIndex` rename.
- **editor:** squiggles painted on mount, output types on a Minimal line, equal Compact columns,
  Minimal's actions kept right, a `stale` option on layouts and the Outputs pane, `require()`.
- **link:** `require()`.

**Why 0.2.0, not 0.1.1:** a program with an output above the binding it reads stopped compiling,
`Negate` is new API, and an exported type lost a field. Pre-1.0 that is a minor. Editor and link
peer on core `^0.1.0`, so a core 0.2.0 means **all three** go to 0.2.0 and their peer ranges move
to `^0.2.0` - the coupling the changelogs promise.

**What it requires:** rename each changelog's `Unreleased` to `0.2.0`, bump the three versions and
the two peer ranges, then the runbook in `release-plan.md`: PR, tags, one GitHub release on core's
tag, approve the three staged versions core first.

**When:** after the Learn samples step, per the user (2026-09-18).

---

## Docs — review the rest of the site after Learn

**What:** the user is reading the docs page by page and sending observations. Learn comes first
(its observations are the samples step above); **then** How it works, Host developers and the
stdlib reference, the same way. Observations that touch every page - the colouring pass, no
dashes in prose, the chain - are already in the samples step, so they land site-wide once.

**When:** after the samples step, before or alongside the 0.2.0 release.
