# Dendrite — Todo

The near future: what is being worked on now, and what comes straight after. Anything for
some later point in time is in `backlog.md`; finished work, kept for its reasoning, is in
`done.md`.

---

## After 0.6.0

0.6.0 is on npm since 2026-10-08, and its group of items is in `done.md` ("0.6.0 on npm").
What follows is the order the maintainer gave that day. "Possibly" is the maintainer's word for
the last two.

| Release | Holds | Entry |
| --- | --- | --- |
| 0.6.1 | The editor's styling, then a docs pass. The editor alone is released. | below |
| After 0.6.1 | Two symbols that want `?`: `??` and `c ? a : b` | below |
| 0.7, possibly | Union types, `A \| B` | `backlog.md`, "Language — union types" |
| 0.8, possibly | Strings as lists, with `Split`, `Slice` and `Replace` | `backlog.md`, "Language — strings as lists" |

---

## 0.6.1 — the editor's styling, to fit the site's new look, then a docs pass

**When:** the release after 0.6.0 (the maintainer, 2026-10-08). Two parts, in this order: the
editor first, the docs pass afterwards.

**Part 1 is done** (2026-10-09, six commits; `done.md`, "Editor — its styling, to fit the
site's new look"). It is not released. Open: part 2, then the release of the editor alone, and
its record.

### Part 2: a docs pass

**Scope, decided 2026-10-08 (the maintainer):** three things.

- **The site with the restyled editor in it.** Every page that mounts a block or shows a
  static one wears the editor's stylesheet: the Learn samples, the stdlib reference, *Every
  diagnostic*, the landing's live block. Each in both themes, and in the three layouts where
  a page uses them.
- **The two known docs faults**, both in `backlog.md`: *Embedding core* shows a call that
  throws, and a `continues=` chain deeper than one page is assembled in the wrong order.
- **What the maintainer finds** while reading. "Docs — review the rest of the site after
  Learn", below, is where those observations collect.

Not in it: "show what every fence produces", sent to the backlog the same day.

**Carried from part 1, to look at in the same pass.** Part 1 changed the dark surfaces and
nothing else of the editor's look, so three of its observations are still open:

- **Light, in Compact and Full.** In light a block's panel is the page's colour (both are
  ground), so a block is its 1px border and its white code area. That is the sheet's white
  well, and it suits Minimal. Compact, Full and their panes were not looked at on the site's
  ground.
- **Type and controls were not compared:** the site's display face, its button and field
  shapes and its sidebar item, against the editor's bar items, panes and fields. A difference
  of VALUE is this release's. A difference of SHAPE is the backlog's ("Editor — the top bar in
  the site's shape" says why).
- **In dark, hover and border are one colour now:** dark-3, in `--dendrite-hover` and in
  `--dendrite-border`. The brand's ramp names dark-3 for both. A hovered row or button that
  has a border may lose its edge: look at the port rows, the menu items and the bar's buttons.

**How to look.** The launch configs `docs` (4321), `playground` and `docs-preview` (4322,
serves the build). The matrix is light and dark, times Minimal, Compact and Full, times a doc
page, the landing and the playground; and the system on dark with the picker on Light, and
the reverse. The pages that mount the editor: `Live.tsx`, `DenCode.astro`,
`OpsReference.astro`, `DiagnosticsTable.astro`, and the playground's `App.tsx`. One test pins
colours, and only the five surfaces (`packages/editor/src/style.test.ts`), so measure computed
styles. A decision by eye is made on a mock in the real page (injected CSS, no source change),
not on a built trial. The traps are in `done.md`, under part 1.

### The release

0.6.1 releases the editor alone. Its number then parts from core's and link's, which stay at
0.6.0; the editor's peer range `^0.6.0` allows it, and the publish workflow stages only the
versions npm lacks (`release-plan.md`, "Every later release"). The editor's changelog holds two
lines under "Unreleased": the dark surfaces, which change every host's default look, and the
code-height fix. After the record, the canvas takes tokens 1.3 (`backlog.md`, "Brand canvas").

---

## After 0.6.1 — two symbols that want `?`: `??` and `c ? a : b`

**When:** after 0.6.1, as ONE plan for both. The maintainer placed it first after 0.6.0 on
2026-10-05, and named 0.6.1 for the editor on 2026-10-08, which comes before it by its number.
Asked on 2026-10-05, as "`||` as sugar on `Default`" and "an inline if, `condition ? true : false`".

**Why one plan:** three ideas want `?`: these two, and the optional lambda parameter
(`backlog.md`). The first one built fixes what the lexer does with `?`, `??` and `?:`, so the plan
settles all three spellings, even if it builds two.

**`??` for `Default`, not `||`** (probed 2026-10-05). `||` is taken: it is sugar over `Or`, `Or`
takes booleans, and `null || 5` is `op_input_type_mismatch` today. A symbol becomes its op while
the parser reads, before any type is known, so `||` cannot choose between `Or` and `Default` by
type. The other way is an `Or` that accepts `any` and decides at runtime, and then the reference
prints a signature that is not honest, which is what keeps `+` from text (`backlog.md`). `Default`
tests for `null`, not for false, and that is what other languages spell `??`.
`registerInfix("??", …)` is plain sugar, as `++` is over `Join`, and a registered symbol reaches
the lexer through `grammar.symbols`. **To decide:** its tier in the ladder (`precedence.ts` has
room below `OR`).

**`condition ? a : b` for `If`.** Sugar over `If(condition, a, b)`, so it inherits what `If` does:

- **Both branches are evaluated** ("`If` evaluates both branches", `backlog.md`). A reader of `?:`
  expects the opposite more than a reader of `If(…)` does. Decide whether the symbol waits for a
  lazy `If`, or ships with the fact said in the docs.
- **Its type** is the branches' type when they agree, and `any` when they differ (`If`'s
  `inferOutput`).
- **The registration has no route today.** `registerInfix` builds a symbol with two operands. A
  conditional needs a led that reads two more, and `registerLed` does not add its key to
  `grammar.symbols`, so the lexer still answers `unknown_character` for `?` (probed). It should
  not go in the core grammar either, which names no stdlib op. The smallest fix is a way to
  register a symbol with a hand-written led.
- **To decide:** its tier (between `ARROW` and `OR`), whether `a ? b : c ? d : e` chains, and
  that a `:` inside the first branch still reads (a lambda's annotation,
  `c ? (x: number) => x : y`).

**No consumer but the wish:** `If` and `Default` work. Estimate: a plan, then about three commits
(one per symbol, one for the docs).

---

## Docs — review the rest of the site after Learn

**What:** the user is reading the docs page by page and sending observations. Learn comes first
(its observations were the samples step, now in `done.md`); **then** How it works, Host
developers and the stdlib reference, the same way. The site-wide passes (the colouring, the
dashes, the chain) already landed with the samples step, so these pages start from them.

**When:** next, alongside the inline TypeScript colouring: the user reads, and the
observations collect here until there is a section's worth to plan.
