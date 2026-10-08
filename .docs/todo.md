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
editor first, the docs pass afterwards. Part 1 was the backlog entry "Editor — its styling, to
fit the site's new look", moved here whole. It needs a plan, and the plan starts with a
decision: item 1 below is the brand's before it is the stylesheet's.

### Part 1: the editor's styling

**What:** the docs site took the brand sheet's look on 2026-10-06 (`done.md`: the grounds, the
type, the top bar, the controls). `@dendrite-lang/editor` did not: `packages/editor/style.css`
and the playground wear the look they were built with. Where the two differ now:

1. **The dark surfaces are a step above the site's.** The editor has bar dark-0, page level
   dark-1 and canvas dark-2, for the reason its stylesheet gives (dark-0 under near-white text
   reads harsh). The site's page is dark-0 now. A block on a doc page is therefore a dark-1
   card with a dark-2 code area, and the playground as a whole is a step lighter than the
   docs. Sheet §20 (a dark-0 page, dark-1 wells) and sheet §25 (the editor's three levels)
   disagree here, so this is a brand decision before it is a stylesheet change.
2. **In light, a block's panel is the page's colour.** Both are ground, so a block is marked
   by its 1px border and its white code area alone. That is the sheet's white well, and it
   suits the Minimal layout. The Compact layout and its panes were not looked at on the new
   ground.
3. **The playground's top bar is not the site's.** The site has the wordmark, section links
   and a small search on the page's ground, over a 1px rule; the playground has
   `Editor.TopBar` on `--dendrite-bar`. Going from one to the other changes the chrome. Not
   compared in detail.
4. **Type and controls were not compared**: the site's display face, its button and field
   shapes, and its sidebar item against the editor's bar items, panes and fields.

**Why it waited (2026-10-06):** the restyle changed the site and left the editor alone on
purpose, and the editor is a published package: a change to its stylesheet ships in a release.
That release is 0.6.1.

**What it requires:** the playground beside a doc page, in both themes and in the three
layouts; the decision of item 1; then the `--dendrite-*` values in `packages/editor/style.css`
(the properties stay, they are the theming API), the "Theming" table of the editor's README,
`--dn-editor-*` in `brand/dendrite-tokens.css`, and a release. A fifth difference, a block
that ignored the site's theme picker, was a defect and was fixed on 2026-10-07 (`done.md`).
Neighbours in `backlog.md`, to take or to leave when this is planned: "try cooler background
colours", "tune the highlight colours" and "the stylesheet per group". The code-height entry
is taken: it is below.

### Part 1, as it stands on 2026-10-09

**Decided by the maintainer that day:**

- **Values, not shapes.** Colours, levels, rules and sizes that exist; the names of the
  `--dendrite-*` variables stay, they are the theming API. A new shape (another top bar,
  another button) is possible, and only after thorough consideration: it needs a frame from
  Claude Design first, so it does not ride in by itself.
- **Where the difference is seen:** the docs site follows the sheet now, and did not before.
  The editor is still in the old docs style, and what shows most is its surfaces.
- **The playground's top bar is decided from a mock**, beside the site's nav.
- **The dark surfaces are decided from a mock too** ("we'll decide once we get to it").
- **The playground gets a favicon of its own, in this release:** the brand's reversed avatar
  (`brand/assets/icons/dendrite-avatar-square.svg`: an Iris field, a white D and fork), where
  both apps have icon A today, an identical file. The brand's own rule asks for it under 24 px
  ("below 24 px always the reversed avatar", `brand/CHANGES.md`), and the same file wires icon
  A to the favicon, so the two lines disagree. The work: the playground's `favicon.svg`, and a
  row in `brand/render.ts` for its touch icon.

**How far this goes without Claude Design: all of it, while it changes values only.** The
decisions by eye are made on a mock in the REAL page: injected CSS, no source change, a doc
page and the playground side by side, both themes. That shows real markup and real content,
which a frame in the canvas does not. Claude Design is needed for a new shape, and AFTERWARDS,
to take the result back so that sheet §20 and §25 stop disagreeing ("Brand — take the hero's
corrections back to the Claude Design source", `backlog.md`).

**Measured on a doc page, dark theme** (the second handoff, from the chat that restyled the
site; the editor's column checked against `packages/editor/style.css`):

| Surface | Level | Value |
| --- | --- | --- |
| Site: page, nav, sidebar | dark-0 | `#141312` |
| Site: raised (search, cards) | dark-1 | `#201e1d` |
| Site: the TypeScript code frame | dark-2 | `#2c2a29` |
| Site: inline code | dark-3 | `#3a3735` |
| Editor: bar | dark-0 | `--dendrite-bar` |
| Editor: panel, which is the block | dark-1 | `--dendrite-panel` |
| Editor: code area | dark-2 | `--dendrite-bg` |
| Editor: well, hover | dark-3, dark-4 | `--dendrite-well`, `--dendrite-hover` |

**The three options for the dark surfaces:**

- **A. Leave the values.** A block stays a dark-1 card with a dark-2 code area. No release is
  needed for this item.
- **B. Move the editor one step down:** panel dark-0, code dark-1, well dark-2, hover dark-3.
  The bar is dark-0 already, so bar and panel become one ground and need a 1px rule, which is
  how the site parts its nav. The site's TypeScript code frame (dark-2) must then move too, or
  the two kinds of code block differ.
- **C. Override `--dendrite-*` in the docs' stylesheet only.** The playground stays as it is.

A precedent, not a decision: the maintainer chose the sheet's dark-0 page for the site over
the same worry, that dark-0 under near-white text reads harsh.

**Light theme.** The editor's panel equals the site's page (ground `#f3f2f2`), so a Minimal
block is its 1px border and its white code area, as the sheet has it. Compact and Full were
not checked. The editor's bar is ground-2 `#e6e4e3`; the site's nav is ground over a 1px rule
(`#cfcccb`).

**A guard to add:** a test that the editor stylesheet's values equal the `--dn-editor-*`
mirror in `brand/dendrite-tokens.css`. The palette lives in the canvas, the sheet, the tokens
file and the editor's stylesheet (39 `--dendrite-*` variables with hex literals, no `--dn-*`
token, because it ships alone), and nothing compares the last two.

**Files:** `packages/editor/style.css` (the values, lines 16 to 36), `packages/editor/src/code/cm.ts`
(CodeMirror's chrome, from the same variables), `packages/editor/README.md` (the "Styling"
paragraph), `brand/dendrite-tokens.css` (`--dn-editor-*`), `apps/playground/src/style.css` and
`App.tsx` (the playground's own chrome and top bar), `apps/docs/src/styles/dendrite.css` (the
site's palette, which reads some editor values), `apps/docs/src/components/Hero.astro` (the
height workaround).

**Traps the second handoff names:**

- **Cascade layers.** The editor's sheet is in `@layer dendrite`; the docs order the layers
  `starlight, dendrite` (`apps/docs/src/styles/layers.css`). An unlayered docs rule wins.
- **Two `color-scheme` lines in `dendrite.css` must stay.** They make a block follow the
  site's theme picker; the editor's `:root { color-scheme: light dark }` beat Starlight's
  before that fix.
- **The landing's hero forces `color-scheme: dark`**, so its block is the dark editor in both
  site themes. The landing stays dark by decision, and its theme picker is hidden.
- **The docs reuse editor classes:** `.dendrite-tag` for the sample tags, and the red and
  amber edges target `.dendrite-minimal-layout` and `.dendrite-compact-layout`. A renamed
  class or a changed border breaks them silently.
- **No test pins a colour.** The gates do not catch a visual regression: measure computed
  styles, do not judge by eye.
- **A docs build while the dev server runs leaves the dev server stale** (504 on
  `@codemirror_*` modules, no live block): touch `apps/docs/astro.config.ts`, reload twice. A
  changed remark plugin needs the same restart. Seen again on 2026-10-09 in another form: the
  landing's three pillars were gone on the dev server, with the build and the live site
  correct. Its content store (`apps/docs/.astro/data-store.json`) held no `pillars` field at
  all, after docs builds had deleted and rewritten that folder beside it. The remedy that is
  certain: stop the dev server, delete `apps/docs/.astro`, start it again.
- **Headless Chrome with a temp profile per run filled the C: drive** (33 profiles, 1.6 GB).
  Use the Browser pane.
- **A built trial costs a round.** A light landing was built, disliked and reverted; a
  picture got a one-word answer.

**How to verify:** the launch configs `docs` (4321), `playground` and `docs-preview` (4322,
serves the build). The matrix is light and dark, times Minimal, Compact and Full, times a doc
page, the landing and the playground; and the system on dark with the picker on Light, and
the reverse. The pages that mount the editor: `Live.tsx`, `DenCode.astro`,
`OpsReference.astro`, `DiagnosticsTable.astro`, and the playground's `App.tsx`.

**Rejected, not to be reopened:** a line-wrap option for the editor, and a light landing.

**The order:** (1) the mock for the dark surfaces and the top bar, and the maintainer picks;
(2) a plan, then approval; (3) the height fix, its own commit; (4) the surface values in
`style.css`, the tokens and the README, one commit, with the guard; (5) the playground's top
bar and controls, only if the comparison finds something, and its favicon; (6) the docs'
follow-ups: the hero's knob, the TypeScript code frame if dark moved; (7) part 2 below;
(8) the release, the editor alone; (9) the decision recorded for Claude Design.

### The code-height fix, in this release

Moved here from the backlog on 2026-10-09, where it was "`--dendrite-code-min-height` leaves
the sideways scrollbar floating".

**What:** the knob sets `min-height` on `.cm-editor` (`packages/editor/style.css`, Minimal
layout). CodeMirror's scroller inside it does not stretch, because its `height: 100%` has no
definite height to resolve against. When the code is shorter than the minimum and one line is
wider than the editor, the sideways scrollbar sits under the last line with empty canvas below
it. At 11rem over five lines the gap was 8px and nobody saw it; at 16rem it was 80px.

**Why deferred (2026-10-06):** found while the landing's live block grew, in a round that left
the editor alone. The landing sets `min-height` on `.cm-scroller` itself for now
(`apps/docs/src/components/Hero.astro`).

**What it requires:** let the scroller fill the editor (`flex-grow: 1` on `.cm-scroller` in the
Minimal and Compact layouts, or the minimum on the scroller), a look at both layouts with a
long line, and then the landing goes back to the knob.

**From the second handoff:** the knob is `packages/editor/style.css` line 188, Minimal layout
only. The candidate is `flex-grow: 1` on `.cm-scroller`, in `cm.ts` or beside the knob, and it
is NOT verified. The check: a line wider than the editor and code shorter than the minimum;
the scrollbar must sit at the bottom of the box, in Minimal and in Compact. Then the three
`.cm-scroller` rules in `Hero.astro` become the knob.

### Part 2: a docs pass, afterwards

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

**Also decided:** 0.6.1 releases the editor alone. Its number then parts from core's and
link's, which stay at 0.6.0; the editor's peer range `^0.6.0` allows it, and the publish
workflow stages only the versions npm lacks (`release-plan.md`). **Left for the plan:** item 1
of part 1, the dark surfaces ("we'll decide once we get to it").

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
