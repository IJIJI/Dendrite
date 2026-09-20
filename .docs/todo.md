# Dendrite — Todo

The near future: what is being worked on now, and what comes straight after. Anything for
some later point in time is in `backlog.md`; finished work, kept for its reasoning, is in
`done.md`.

---

## Core — the stdlib, configurable per category, maybe per op

**When:** straight after the conversion and string ops (the plan of 2026-09-20). Moved here from
the backlog, where it was "the stdlib in segments a host can pick", and widened.

**What changed since it was written:** it now owns a smell as well as a feature. `createStdlib()`
(`packages/core/src/language/stdlib/index.ts`) is one 600-line function in three bands: every
`registerOp` by category, every `registerEvaluator` far below, then the symbols. It is a **Long
Method**, and adding an op is two edits a screen apart. The conversion and string ops were added
in that same style ON PURPOSE (2026-09-20), so this restructure meets one shape, not two.

**Widened to:** a host picks categories, and **possibly single ops** ("maybe even per method",
the user). Decide whether per-op selection has a named consumer before building it: per category
has one (Beacon choosing its vocabulary), per op does not yet.

**What adding two categories taught it (2026-09-20):** a new category is **Shotgun Surgery**,
six edits in five files: an op block in `createStdlib`, an evaluator block a screen below it, a
`describe` in `evaluator.test.ts`, a docs page (three lines, generated from the descriptor), a
**hand-written row** in `apps/docs/src/content/docs/stdlib/index.md`, and a changelog line. The
row is the avoidable one: that table could be generated from the descriptor the way the pages
are, and then a category is complete the moment its ops are registered. Do that here.

Two helpers now sit at module level in `stdlib/index.ts` and belong to their categories when the
file splits: `DECIMAL` (what `ToNumber` accepts as text) and `toText` (a value as text, shared by
`ToString` and every string op, so they stay together or share a module).

**The original entry:**

**What:** `createStdlib()` is all or nothing. A host should be able to take the segments it
wants - logic, comparison, control, array, arithmetic, list - and leave the rest, so a
lighthouse that never needs list ops does not carry them, and the docs can say "your host
has these".

**Why deferred:** no host exists yet that wants less than everything; the segment names are
already the ops' `category`, so the split is mostly mechanical when it comes.

**What it requires:** one builder per segment (`createLogic()`, … each an `extendLanguage`
step over the base) with `createStdlib()` composing all of them; operators registered with
the segment that owns their op; a test that the composition equals today's stdlib; the docs'
per-segment pages (already one per `category`) gain "how to include only this".

**Driving need:** Beacon choosing its vocabulary; the docs' promise that a host picks parts.

---

## Docs — review the rest of the site after Learn

**What:** the user is reading the docs page by page and sending observations. Learn comes first
(its observations were the samples step, now in `done.md`); **then** How it works, Host
developers and the stdlib reference, the same way. The site-wide passes (the colouring, the
dashes, the chain) already landed with the samples step, so these pages start from them.

**When:** next, alongside the inline TypeScript colouring: the user reads, and the
observations collect here until there is a section's worth to plan.

---

## Docs — show what every fence produces (candidate, not decided)

**What:** run each ```den fence at build time in `remark-den.ts` and show what it produces
beneath it (its output values, or the diagnostic it raises), the way the ops reference and
*Every diagnostic* already do. Proposed 2026-09-17 as "the step to add more editors"; left out
of the samples step because it was never decided.

**Open question:** do it, or send it to the backlog. Deferred until the site review is done
(2026-09-20): the observations on How it works, Host and the stdlib reference will show whether
the static fences there want their values, and the pages that most needed it (the ops reference,
*Every diagnostic*, the Learn samples) already show theirs.
