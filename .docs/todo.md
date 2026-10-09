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
  Learn", below, is where those observations collect. The first one has its own entry:
  "Docs — *How a program runs* gets simpler", below.

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

### Part 2: the visual pass, 2026-10-09

Run on the built site (`docs-preview`) and on the playground, at 1440 x 900, by computed
styles and seven pictures: the landing; *Examples* (Minimal and Compact) in both themes; *Types
in practice* (a sample with a warning); *Arithmetic*; *Every diagnostic*; the playground in
both themes. No source file changed.

**Decided 2026-10-09 (the maintainer): rows 1, 2, 4 and 5 are taken**, one commit each. **Row
3 is decided from a mock**: one picture of *Types in practice* with the same paragraphs twice,
the chip on dark-3 and on dark-2, and the sidebar's current page under each. **Decided from
it (the maintainer): the chip on dark-2.** The sidebar's current page reads the same
variable and goes with it, as the mock showed it.

| # | Finding | Measured | Where the fix is | Size |
| --- | --- | --- | --- | --- |
| 1 | **An output value is not in the editor's mono.** `.dendrite-output-value` is a `<code>`, and the stylesheet gives it no font, so it takes the browser's `monospace`. | Playground: `monospace` 13px, beside a name in IBM Plex Mono 13px. Docs: IBM Plex Mono 11.7px, because Starlight styles `code`. | `packages/editor/style.css`: `font: inherit` on the value. It ships in 0.6.1. | One declaration |
| 2 | **The site's prose rule reaches into a block.** `.sl-markdown-content code { font-size: 0.9em }` (`dendrite.css`) is unlayered and does not leave out `.not-content`, so it beats the editor's layered sizes. | A type tag is 12.6px in a Minimal strip and 11.7px in a pane, where the editor says 11px. An output value is 11.7px in a 13px row. | `apps/docs/src/styles/dendrite.css`: the rule leaves out `.not-content`, as Starlight's own prose rules do. | One selector |
| 3 | **In dark, an inline code chip is a step lighter than an editor well.** The site's chip is dark-3 (`--sl-color-bg-inline-code`). The editor's well and tag went to dark-2 in part 1; before, both were dark-3. In light both are ground-2. The sidebar's current page reads the same variable. | Chip `rgb(58, 55, 53)`, well `rgb(44, 42, 41)`. | `dendrite.css`, the dark block, if the chip moves. By the tokens a dark well is dark-2. On a dark-0 page a dark-2 chip shows less. | One line, after a mock |
| 4 | **Every diagnostic has two tags for one word.** The heading's badge (`.severity`) is Starlight's red and orange: pink text, IBM Plex Mono 11.2px, upper case. The sample under it shows the editor's status tag: ink on the soft fill, Kode Mono 11px, a dot. The brand has one status tag (README section 3). | Badge `rgb(78, 34, 50)` and `rgb(78, 64, 34)`; tag `oklch(0.28 0.06 25)` and `oklch(0.28 0.05 75)`. | `apps/docs/src/components/DiagnosticsTable.astro`: the heading wears the editor's tag, and `.severity` goes. The same component draws the edge and the text of an "as if" block in Starlight's orange, where a `warns` fence has `--dendrite-warning`: the same commit. | A few lines |
| 5 | **In light, the search field's border is not the brand's.** Starlight draws it in gray-5, which is ground-3 here. An editor field has the brand's border. In dark both are dark-3. | Search `rgb(217, 214, 213)`, an editor field `rgb(207, 204, 203)`. | `dendrite.css` | One line |

**Looked at and found in order:**

- **The landing.** The block's panel is dark-0 on the dark-0 band, so the block is its 1px
  rule (dark-3) and its dark-1 code area and field.
- **Light, in Compact and Full** (carried from part 1). Compact has no ground of its own: its
  panes are on the page's ground, the code is the white well, a field is white in the brand's
  border, and the diagnostics line is on ground under a rule. Full, in the playground: the
  bar on ground-2 over a rule, the side column on ground, the code white. Compact's cut code
  lines are the backlog's "Compact is not compact enough", not this.
- **Type and controls** (carried). Where the site and the editor draw the same thing, the
  values agree: a field is 2px corners on the raised ground in the border colour (but row 5),
  an overline is Archivo 11px 600 in both, code is IBM Plex Mono 14px in both. The editor's
  panes are 14px Archivo where a page is 16px, and its bar 13px: density, which is shape, and
  the backlog's ("Editor — the top bar in the site's shape").
- **Hover and border in dark** (carried). Closed by reading the stylesheet: `--dendrite-hover`
  has one use, the pressed state of the icon button, which has no border. No element holds
  both. And one gain: a well (dark-2) is no longer the border's colour, as it was at dark-3.
- **The theme picker against the system**, both ways, on a reload: a block follows the picker.
- **The dark surfaces on every page type:** page dark-0, block dark-0, code and static source
  and the TypeScript blocks dark-1, wells and tags dark-2, the red and amber edges and their
  tags as before.

**Two traps of the Browser pane, both nearly reported as faults:**

- **A hidden pane's clock stands still.** `document.timeline` does not advance, so a
  transition never ends. After a theme switch IN the page, a property with a transition
  (a field's border, an icon button's colour) reads as the OLD theme's value. Reload on the
  theme (`localStorage["starlight-theme"]`), or finish the animations first:
  `document.getAnimations().forEach((a) => a.finish())`.
- **After a navigation or a reload, set the viewport again before a picture**, or the picture
  is the top-left corner unscaled. A picture may also time out once: take it again.

### Part 2: the two known faults, as plans

**A. *Embedding core* shows a call that throws.** Probed on 2026-10-09: on Installation's
instance `instance.setInput("limit", 35)` throws `'limit' is not a program-level input`. Three
ways, and the first is the proposal:

1. **A fence under "Four commands" that gives the program an input of its own**, with a command
   the table above it lists:
   `instance.setProgram(serialiseSource("output alert = $temperature > $limit", { inputs: [{ name: "limit", type: Type.number, default: 25 }], outputs: [] }))`.
   Then the two-line contrast is tagged `runs` and gains claims. Probed: no diagnostics,
   `alert` is `false` at 20, `true` after `updateInputs({ temperature: 30 })`, `false` after
   `setInput("limit", 35)`; `setInput("temperature", 1)` throws, as the sentence under it says;
   and the page's later fence (the broken program) still gives `stale: true`. `outputs: []`
   has to be written.
2. **Installation's instance declares `limit` from the start.** The first sample a host reads
   grows by a concept, and the two package pages that continue it are checked against it.
3. **The contrast loses its second line.** It then shows one kind of input.

**B. A `continues=` chain deeper than one page is assembled in the wrong order.** `assemble()`
in `ts-samples.test.ts` pushes each ancestor as it walks up, so a three-page chain reads
prelude, parent, grandparent, page. Latent: every chain is one page deep. The plan: the walk
becomes a small function that takes the page map and returns the chain ROOT FIRST, `assemble`
reads it, and a test gives it three hand-made units. No fixture page.

**Decided 2026-10-09 (the maintainer), after more explanation of both: A takes way 1, and B
is built in full**, the function with its test. For B the smaller size was the same change
checked once by a throwaway script, with no test left behind.

**The commits, once the rows are decided** (each row that is taken is one commit, in this
order): the output value's font (editor, with a changelog line); the prose rule; the severity
tag; the search border; *Embedding core*; the chain; the chip on dark-2; the notes.

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

## Core — two styles for setting an input: the runtime's and an instance's

**What:** asked by the maintainer on 2026-10-09, while the *Embedding core* sample was planned:
look at the difference in style between setting a global input and setting a program input.
The page shows the two side by side:

```ts
runtime.updateInputs({ temperature: 30 }); // your state, every program
instance.setInput("limit", 35);            // this program's own input
```

**How they differ today** (`runtime/runtime.ts`, `runtime/instance.ts`):

| | A global input | A program-level input |
| --- | --- | --- |
| Call | `runtime.updateInputs(changes)` | `instance.setInput(name, value)` |
| Shape | One record of several names | One name and one value a call |
| Returns | The outputs, per program | Nothing: it reports through the observables |
| A value that does not fit | Throws, and the batch changes nothing | Is refused: `value_does_not_fit` on `diagnostics` |
| The other kind's name | Not probed | Throws |

A runtime's program handle has a third: `setInput(name, value)`, which returns the outputs.
*Embedding core* gives the reason for two of the rows: a command of an instance returns nothing
and cannot throw for a value because a pane, or a client across a network, calls it.

**When:** not placed by the maintainer.

**What it requires:** first the question itself, which is not decided: whether the difference
is wanted, or whether an instance wants a batch (`setInputs`), or the two want one verb. Then a
plan: a change here is core's public API, the link's protocol carries `setInput` as a command,
and the docs name both calls on several pages.

---

## Docs — *How a program runs* gets simpler, and the complexity stays on *The chain*

**What:** asked by the maintainer on 2026-10-09: simplify the Learn page *How a program runs*,
and keep the complexity on *The chain* (How it works).

**The two pages today.** Both draw `<Chain>` and both walk the same steps:

| | *How a program runs* (Learn) | *The chain* (How it works) |
| --- | --- | --- |
| File | `learn/how-a-program-runs.mdx` | `how-it-works/the-chain.mdx` |
| Size | 100 lines, 850 words | 210 lines, 1409 words |
| Sections | Lex, Parse, Compose, Analyse, Evaluate, "What each step may not do", "That is Learn" | Lex, Parse, Desugar, Compose, Analyse, Prune, Evaluate, "Why it is separate artefacts and not one pass" |

So the Learn page is 60 % of the reference page's length and has the same outline: a reader
of Learn meets the chain twice.

**When:** in the docs pass of 0.6.1 or straight after it; not placed by the maintainer.

**What it requires:** a plan first, with the maintainer, because it is a page's content and
not a fix. The questions for it: what a Learn reader needs from the page (a first reading, not
decided: one picture and a few sentences a step, each step linking to its section of *The
chain*); whether "What each step may not do" moves to *The chain*; and which other pages link
to this page's anchors (`content.test.ts` checks every internal link).

---

## Docs — review the rest of the site after Learn

**What:** the user is reading the docs page by page and sending observations. Learn comes first
(its observations were the samples step, now in `done.md`); **then** How it works, Host
developers and the stdlib reference, the same way. The site-wide passes (the colouring, the
dashes, the chain) already landed with the samples step, so these pages start from them.

**When:** next, alongside the inline TypeScript colouring: the user reads, and the
observations collect here until there is a section's worth to plan.
