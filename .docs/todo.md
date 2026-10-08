# Dendrite — Todo

The near future: what is being worked on now, and what comes straight after. Anything for
some later point in time is in `backlog.md`; finished work, kept for its reasoning, is in
`done.md`.

---

## The 0.6.0 group

The stdlib release, grouped on 2026-10-05. The rows are in the order of the work, and every
status is the maintainer's word.

| # | Item | Entry | Status |
| --- | --- | --- | --- |
| 1 | The stdlib per segment | `done.md` | **done** 2026-10-08 |
| 2 | A math batch, seven ops, and `null` for "no answer" | `done.md` | **done** 2026-10-08 |
| 3 | A mixed list literal refuses a function | below | **decided** 2026-10-08, and next |
| 4 | `AnalysisContext` leaves the public surface | `backlog.md` | **out** 2026-10-08: it stays public |
| 5 | Strings as lists | `backlog.md` | **moved** 2026-10-08, to 0.8 (possibly) |
| 6 | The release | `release-plan.md` | after row 3 |

## After 0.6.0

The order the maintainer gave on 2026-10-08. "Possibly" is the maintainer's word for the last
two.

| Release | Holds | Entry |
| --- | --- | --- |
| 0.6.1 | The editor's styling, then a docs pass. The editor alone is released. | below |
| After 0.6.1 | Two symbols that want `?`: `??` and `c ? a : b` | below |
| 0.7, possibly | Union types, `A \| B` | `backlog.md`, "Language — union types" |
| 0.8, possibly | Strings as lists, with `Split`, `Slice` and `Replace` | `backlog.md`, "Language — strings as lists" |

---

## Core — a mixed list literal refuses a function

**When:** next, the last item of 0.6.0 (the maintainer, 2026-10-08). Moved from the backlog,
where it was "a list literal with mixed items hides a function behind `any`".

**What:** `["a", x => x]` analyses with no error, and so does everything built on it:
`Join(["a", x => x])`, `` `a{x => x}` `` and `"a" ++ (x => x)` all give `"a"`, and
`Length(["a", x => x])` is 2. A list literal whose items differ in type falls back to `any[]`,
and the function goes in with the rest, although a function is never `any` everywhere else.
A list of functions alone is caught: `Join([x => x])` and `` `{x => x}` `` are
`op_input_type_mismatch`. Found 2026-10-02 while probing `++`, and first recorded here as a
fault of the `convert` flag, which it is not: no converting input is needed to see it.

**Probed again 2026-10-08:** two functions of different types hide the same way,
`[x => x, (a, b) => a]` is `any[]` with no error. And the hole is not a loop: an item typed `any`
cannot be called (`app_callee_not_function`), so the language stays total. What it lets through
is a function in an OUTPUT, which is not JSON, the same fault a `NaN` was.

**Decided 2026-10-08 (the maintainer):**

- **An error, with a kind of its own: `function_in_mixed_list`.** It is the existing rule at one
  more position: items that differ make a list of `any`, and a function is never `any`.
- **Two functions of different types are the same error.** No type fits both except `any`.

**What was weighed against it:**

| Option | Why not |
| --- | --- |
| A general kind, `list_item_type_mismatch` | It fits the family of names, but `[1, "a"]` stays legal, so the name promises a check that does not exist |
| Reuse `op_input_type_mismatch` | No op is involved |
| Refuse every function in a list | It removes a real use: a host op that takes a list of functions |
| A warning | The function still reaches an output |
| Union types, so the list has a true type | The clean answer, and a release of its own (`backlog.md`). It would not make the list usable either: every op would refuse it at the use. When it lands, this kind retires. |

**What it requires:** the analyser's `array` case, where the element type falls back to `any`
(`analyser.ts`); an entry in `diagnostics.ts` with a sample, which puts the kind on *Every
diagnostic* by itself; a test per spelling (`["a", x => x]`, inside `Join`, in a template, with
`++`, and two functions that differ); and a look at variadic inputs, which fall back to `any` the
same way in `validateInputs` and were NOT probed. A changelog line: it tightens a behaviour.

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
Neighbours, all in `backlog.md`, to take or to leave when this is planned: the code-height
entry ("`--dendrite-code-min-height` leaves the sideways scrollbar floating"), "try cooler
background colours", "tune the highlight colours" and "the stylesheet per group".

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
