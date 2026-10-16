# Handoff — for the next chat

Written 2026-10-14, at the end of the chat that planned, built and released 0.7.0 and 0.7.1.
Replace this file at the next handoff; it describes a moment, not the project. The rules are in
`CLAUDE.md`, the work in `todo.md`, the reasoning in `done.md`.

## Getting started, in this order

1. `git status`, then `git log --oneline origin/main..dev`: the tree must be clean, and `dev`
   holds only notes commits beyond `main` (see "Where things stand"). If not, ask first.
2. `.docs/CLAUDE.md`: the rules. New since the last handoff: a PR comes with its title and a
   one-paragraph description, a release with a walk through the runbook and its title and text
   in the shape of the previous releases, every text to paste in a code block of its own, and
   this file as the fourth notes file.
3. `.docs/todo.md`: "The order after 0.6.1" (0.8.0 is next), then "Before 1.0.0", where every
   decision of option B is a row with its reason and where it is written. That table is the
   whole brief for 0.8.0.
4. `.docs/done.md`, the two records at the top ("0.7.1 on npm", "0.7.0 on npm") and the entries
   kept under them: how a release is built here, and the lazy input, which `And` and `Or`
   three-valued will use.
5. `.docs/backlog.md`, the entries option B touches: "Language — a `null` that goes through
   arithmetic", "Core — a `NaN` inside a list an op returns is not read", "What boundary
   validation left", "Language — a `null` item in a list literal", "Core — run-time tracking",
   "Stdlib — is the split between `Default` and `If` needed?", and for the patch after,
   "Core — a typed evaluator derived from the op's declaration".
6. `.docs/release-plan.md`, "Every later release", with the lessons of the eighth and ninth
   releases at the end.
7. The plan file of 0.7, the shape a plan takes here (revision 7, a "Review passes" section
   with what each pass changed, a "Risks" table): the maintainer's plan folder,
   `agreed-on-both-build-splendid-scone.md`.
8. The code, five files, in this order: `packages/core/src/language/evaluator/evaluator.ts`
   (`resolveInputs` and the result pass: where option B's rule goes), `stdlib/shared.ts` and
   `stdlib/list.ts` (`toList` and the guards option B removes), `stdlib/logic.ts` and
   `stdlib/control.ts` (the four lazy ops), `analyser/analyser.ts` (long: read `analyseNode`
   and the pass pipeline at the end), `runtime/instance.ts` (what a host sees).
9. `yarn test` once, for the baseline: core 709, editor 85, link 31, docs 90, all green.

## Where things stand

| Thing | State |
| --- | --- |
| npm | `@dendrite-lang/core` **0.7.1**, `link` **0.7.1**, `editor` **0.7.0** (its peer `^0.7.0` admits core 0.7.1) |
| `main` | The merge of PR #28 (0.7.1). Pages deploys from it; the site is current |
| `dev` | Ahead of `main` by notes commits only: `b02a749` (a text to paste goes in a code block), `f71f89d` (the 0.7.1 record, the `Default`/`If` question), and the commit of this file. No code is unreleased |
| Tree | Clean at the time of writing, apart from this file |
| `vexp` | Did not connect in this chat either; files were read directly. Say so at the start if it fails again |
| The docs dev server | Was on port 4321 during one build this chat. Check before a docs build, and say so when it is taken |

## The next work: 0.8.0, option B, and it needs a plan first

**What it is.** "No value" everywhere: an op handed a `null` on an input that names a type gives
`null` (today it reads the null as the type's empty value, so `1 / 0 + 1` is `1` and becomes
`null`); a list op skips a `null` (`Average([1, null])` goes from `0.5` to `1`); `And` and `Or`
are three-valued; every `NaN` a host op returns, at any depth, becomes `null`, with a public
mark on the evaluator that promises none; a field read that finds nothing is `null` and the
checker warns; `[1, null]` is `number[]`; a conversion of no value is no value. It changes
results, so it is a minor of all three packages, with breaking lines, and the docs are part of
the plan (the pages on `null` and on types, the reference, *Every diagnostic*, the 1.x promise
sentence about `implicit_any_cast`). The rule lives in the evaluator; the skip lives in the
stdlib, through one helper.

**Every decision is taken** (`todo.md`, "Before 1.0.0", the rows marked "The plan of option
B"). What the plan has to settle is the mechanism and the order:

- Where in `evaluator.ts` the rule sits (the result pass already turns `NaN` into `null`;
  `resolveInputs` already loops over the declared inputs for `convert` and `lazy`), and which
  inputs take a null: an `any` input, an optional one, a converting one, a lazy one read by
  the op itself (`If(null, a, b)` is `null` by decision; `And` and `Or` decide on either side).
- Which of the stdlib's thirty guards go, and the one helper the list ops skip through.
- The `NaN` pass for a host op's list or struct, and the mark that skips it: a member of the
  evaluator definition, named for what it promises, documented on *Extending the language*.
- What `??` and `Default` mean under the new rule, and whether `Default` stays an op (the
  backlog question of 2026-10-14): decide it in this plan, since option B decides what a null
  is.
- The probes first: a table of today's results for each changed case, measured on 0.7.1, as
  the 0.7.0 plan did for the lazy input. Every claim is probed before it is written.

**Decided at the handoff (the maintainer, 2026-10-14):** the scope is option B **plus the
`Default` and `If` question**, since B decides what a null is and both are breaks that fit one
minor; the stdlib names review stays in "Before 1.0.0". The next chat plans, probes and builds
in one, as this chat did for 0.7, with the plan file approved first.

**Seven suggestions of mine** are parked in `todo.md`, "0.8.1 and 0.8.2 — further items",
each with what it touches, the patch it would ride, and what cannot wait for a patch. Three
are bound to 0.8.0's plan by their nature (the cost is measured before the rule is written,
the `NaN` mark's name is public API, the removal of `assertSavedPorts` is a break): the plan
settles those, and the table says what is left.

**After it:** 0.8.1, the strict keys (the evaluator typed from the op's declaration, the 35
casts gone), a patch that only adds; then the visual (Rete) half with a plan of its own; union
types after that.

## What this chat decided beyond the plan, worth carrying

| Decision | Why |
| --- | --- |
| The callee pre-check tests "declared nowhere" (not local, not declared, not an op) | A forward reference and a failed binding fall through to the `ref` path; an `ast` app naming an op would otherwise be told to mean its own name |
| A reference to a cycle member is no second error | A cycle member is failed but never analysed; the cascade line now covers it |
| `nearest`: case-insensitive, a transposition one edit, none for a single letter | `length` must find `Length`, `nmae` must find `name`, `m` must not find `n` |
| Eight diagnostics hint, two wait (`unknown_port_type`, `unknown_op`) | The two get their consumer with the Rete half |
| `malformed_ports` is raised inside `composeLayers` | Every door composes, so every door reports it its own way; the kind is the same at both levels, the channel per level |
| The `layers` option of `createInstance` is host code | A `null` there is read in five places; a guard would be Shotgun Surgery. Data is reported, code throws, pinned by a test |
| `Thunk` is a Virtual Proxy over one node's value, nothing more | Named so in the plan's SOLID pass |

## Habits of this chat, kept

- **Probes** in `packages/core/examples/probe.ts`, typechecked with
  `yarn workspace @dendrite-lang/core exec tsc --noEmit --ignoreConfig --strict --target es2022 --module esnext --moduleResolution bundler --types node examples/probe.ts`,
  run with `yarn workspace @dendrite-lang/core exec tsx examples/probe.ts`, deleted after.
- **Notes edits** by a Python script written to the scratchpad with an `assert` per anchor, run
  with `python -I`. Inline Python on the command line does not survive this shell. The working
  copy is CRLF and the blobs LF (`.gitattributes`); the warning is noise.
- **The gates** by exit code, each commit: `yarn typecheck`, `yarn lint`, `yarn format:check`,
  `yarn test`; the docs build (core and editor rebuilt, `apps/docs/.astro` deleted) when the
  site changed. `yarn prettier --write` over the changed files before them.
- **A peer-range bump changes `yarn.lock`**: `yarn install` after it, and the lockfile in the
  release commit. The version note on *Installation* moves with core's version.
- **The after-approval check**: a folder in the scratchpad with a `package.json` and a
  `check.mjs`, the tarballs from `yarn workspace <name> pack --out <path>`, installed with
  `npm install ./core.tgz …`; the packages' `exports` map hides `package.json`, so read the
  installed files by path. Run on the tarballs (all pass), on the previous version from npm
  (the new lines fail, read one by one), and on `latest` after approval.
- **The release text** in the shape of the previous one: `gh release view "<tag>" --json name,body`.
  The PR's count is `git rev-list --count origin/main..dev`, which holds the notes commits
  between releases too.
- **Reviews from other chats** are pasted in and assessed claim by claim against the repo.
  Several were wrong this chat (a forward reference is analysed first in topo order; a sample
  with bad ports breaks the docs build; two `?.` guards did not reach their claim). Verify, then
  accept or reject with the reason, and record both in the plan.
- **The handover form**: one table per commit, the `git add` and the `git commit` as two
  `bash` blocks valid in PowerShell 5.1, then stop; `git status` first, every time.

## How this chat worked, for continuity

Answers for a reader with ADHD: the answer first, tables, one idea a line, a recap on a long
one. Decisions as lettered options with one recommendation; the maintainer answers by letter,
says "Go" for a commit, and asks "explain more" freely. A plan is approved through the plan
file, then built commit by commit with no stop between a commit's handover and the next
commit's start but the maintainer's "Go".
