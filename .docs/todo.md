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

**When:** the release after 0.6.0 (the maintainer, 2026-10-08).

**Both parts are built** (2026-10-09). `done.md` has them: "Editor — its styling, to fit the
site's new look" for part 1, and "Docs — the docs pass of 0.6.1" for part 2. Nothing is
released. Open: three things the pass left, then the release.

### Open from the docs pass

Each waits for the maintainer, and none of them holds the release.

**Eight TypeScript frames have a line longer than the column.** A frame is 14px since the
pass, and the column holds 79 characters. Four of the eight scrolled sideways before, at the
smaller size. Rewrapping is a content edit on six pages:

| Page | Frames | Over by, at 1440 px |
| --- | --- | --- |
| *Installation* | 1 | 193 px (the import is 101 characters) |
| the core package page | 1 | 110 px |
| *Ports and layers* | 1 | 101 px |
| *Embedding core* | 1 | 69 px |
| the link package page | 3 | 52, 35 and 27 px |
| *The type system* | 1 | 42 px |

**Started 2026-10-09, not edited yet.** A scan of every `ts`, `tsx` and `sh` fence found 12
lines over 77 characters. 77 is the safe width: a frame is 718 px, its padding takes about
64 px, and a character is 8.4 px, so the 79 above was an estimate. The lines, by file and
line: `host/embedding-core.md` 143, 148, 161; `host/installation.md` 41;
`host/packages/editor.md` 78; `host/packages/link.md` 22, 32, 98, 99;
`how-it-works/ports-and-layers.md` 31; `how-it-works/types.md` 12, 14. Proof when done: the
page crawl of the pass reports no frame that scrolls sideways, and the samples test passes.

**Three rules name a step of the grey ramp where they mean "the border".** No step of
Starlight's ramp is the border in both themes; `--sl-color-hairline` is. The nav's two rules
were corrected in the pass. These were not:

| Where | Reads | Off in |
| --- | --- | --- |
| `DiagnosticsTable.astro`, the rule between two entries | gray-5 | Light: ground-3, not the border |
| `Chain.astro`, a step's box and its arrows, five declarations | gray-4 | Dark: dark-4, not dark-3 |
| `Chain.astro`, a substep's dashed box | gray-5 | Light, and it may be meant lighter |

**What the maintainer finds while reading.** "Docs — review the rest of the site after Learn",
below, is where those observations collect. Two have entries of their own, below: "Docs —
*How a program runs* gets simpler" and "Core — two styles for setting an input".

### The release

0.6.1 releases the editor alone. Its number then parts from core's and link's, which stay at
0.6.0; the editor's peer range `^0.6.0` allows it, and the publish workflow stages only the
versions npm lacks (`release-plan.md`, "Every later release"). The editor's changelog holds
three lines under "Unreleased": the dark surfaces, which change every host's default look, the
code-height fix, and an output value's font. After the record, the canvas takes tokens 1.3
(`backlog.md`, "Brand canvas").

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
