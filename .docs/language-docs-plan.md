# The language documentation — plan

> The content pass into the site skeleton built 2026-09-09 (`docs-plan.md`), approved
> 2026-09-12 after two review rounds. The skeleton, the generated stdlib reference and the
> live example blocks all landed; every prose page is still a one-paragraph stub saying what
> it will cover, and those stubs are the outline.

## Context

`@dendrite-lang/core@0.1.0` should ship documented, and nothing written so far teaches the
language: `.docs/` holds design records and an architecture map for someone already inside the
code. This is the gap `todo.md` marks IMPORTANT — "the code is good" versus "the language
exists for other people". The site skeleton, the generated stdlib reference and the live
example blocks all landed on 2026-09-09 through 09-12; every prose page is still a
one-paragraph stub saying what it will cover. Those stubs are the outline: each already
promises the right thing, so this plan fills them rather than redesigning them.

## The four sections, and the rule that keeps them apart

| Section | Reader | Holds |
|---|---|---|
| **Learn** | writes programs | getting started · a couple of worked examples · writing programs (bindings and outputs, inputs, operators and ops, lambdas and lists, types) · how a program runs, plain |
| **stdlib** | writes programs | the conventions ops share, then the generated page per segment |
| **How it works** | wants to predict behaviour | the chain in depth, one page per stage · the diagnostics catalogue · persistence · glossary |
| **Host developers** | embeds the language | installation · embedding core · extending the language, the stdlib included · the three packages |
| **Contribute** | works on Dendrite | points at the repo, unchanged |

**The rule, written at the top of How it works:** Learn says what you can rely on; How it
works says why, and in what order. A fact belongs in one of them, never both. When a Learn
page needs a mechanism to explain itself, it states the guarantee and links down. In
particular, `learn/writing/types` describes the experience of a type error and shows one; the
catalogue of kinds lives only on the diagnostics page.

Settled with the user (2026-09-12): the section is named **How it works**; live means editable,
and a block goes live wherever an input teaches something or could; the diagnostics table is
generated from core.

## Decisions

| Point | Decision | Why |
|---|---|---|
| The chain, twice | a plain page ending Learn, the deep one per stage in How it works | the two-layer ask in `todo.md`; the rule above stops the overlap |
| Section URLs | `learn/how-it-works/*` **moves** to `how-it-works/*` | nothing links there yet, so the move costs one commit now and never again; keeping the old path buys nothing |
| The diagram | one `<Chain/>` component in **CSS grid**: five labelled stage cells with arrow cells between them, `↓` when it stacks, plus one line showing where port layers join | responsive for free; the earlier note said inline SVG, but SVG text goes tiny on a phone. SVG is the fallback if the port-layer join reads badly |
| The worked example | `grade.den`, already carried through every stage by the four scripts in `packages/core/examples/3-(code)/` | real output per stage, and the scripts keep it honest |
| Live sources | the programs behind `<Live>` move into `apps/docs/src/examples/*.den`, imported with `?raw` | the review is right that JSX props are invisible to a fence test; as files they are globbed by the same test, and a page reads `<Live source={grade} />` |
| Samples | every ` ```den ` fence **and** every `src/examples/*.den` loaded by a test; a fence tagged ` ```den fails ` is asserted to produce errors instead | the `todo.md` requirement, and the diagnostics pages need broken samples on purpose |
| Fence ports | the test collects `$names` from the sample and declares each as `any`; ` ```den inputs="score:number" ` overrides when the type matters | a sample using `$score` cannot load against a descriptor with no inputs, so the ports have to come from somewhere |
| Diagnostics | one registry in core over all five families, keyed by **(stage, kind)**, with a message and a triggering example each | 49 union members live as scattered string literals, and `unknown_type` / `incompatible_field_override` each appear in two families, so the kind alone is not a key |
| Live blocks | editable, one per page at the moment it teaches; every other sample static | pages stay fast, and Pagefind indexes static code but not islands |
| Glossary | How it works' last page, written last from the terms the other pages used | the content note deferred it until terms accumulated; four sections accumulate them |
| Reader signposting | one line at the top of each section's first page saying who it is for and where the other reader goes | the content note's "two readers" |

## Steps

Prose first, the registry when the page that needs it arrives (the review's reorder: Learn
needs nothing from core, and writing the prose first tells the registry what it has to hold).
Each step is one commit; root gates after each; a commit table with its message follows each.

### Step 1 - docs: the sections, and the two stale programs

- `astro.config.ts`: **How it works** becomes a top-level group between `stdlib` and Host
  developers, and the four pages move from `content/docs/learn/how-it-works/` to
  `content/docs/how-it-works/`. Inside Learn, Examples moves above Writing programs, and a new
  `learn/how-a-program-runs.md` closes it.
- Each section's first page gains its reader line; the splash's three cards gain one sentence
  pointing the two readers at their section.
- `packages/core/examples/3-(code)/grade.den`: the header comment says operators "arrive with
  slice 4 … until then, ops are written in function form" while the program below uses `>=`,
  `>` and `+`. Corrected. The deliberate `And(true, "Country")` line stays and gets a clearer
  comment: it is there to show a type error, an unused-binding warning and pruning at once.
- `4-(environment)/heights.den`: the `treshold` typo, in the program **and** in
  `4-(environment)/1-run.ts` which feeds it, plus the three commented-out field-access lines.

| File | Change |
|---|---|
| `apps/docs/astro.config.ts` | the sidebar |
| `apps/docs/src/content/docs/how-it-works/*` | moved from `learn/how-it-works/*` |
| `apps/docs/src/content/docs/learn/how-a-program-runs.md` | new stub, filled in step 3 |
| `.../learn/getting-started.md`, `.../stdlib/index.md`, `.../host/installation.md`, `index.mdx` | reader lines |
| `packages/core/examples/3-(code)/grade.den`, `4-(environment)/{heights.den,1-run.ts}` | the fixes |

Est. 1.5 h.

### Step 2 - docs: the sample test

A vitest project for `apps/docs`, which has none: `vitest.config.ts` with the same core source
alias `astro.config.ts` carries (otherwise it resolves the workspace `dist` and needs a build
first), and a `test` script so the root `yarn test` picks it up.

`src/content/content.test.ts`:

- glob every `.md`/`.mdx` under `content/docs` and pull each ` ```den ` fence; glob
  `src/examples/*.den` as whole programs.
- for each sample, collect `$name` occurrences and build a port layer declaring each as `any`,
  unless the fence carries ` inputs="score:number, bonus:number" `, which wins.
- load through `createEnvironment(createStdlib()).forProgram([], [layer])`. A plain sample must
  load; a ` fails `-tagged one must produce at least one error, and the test prints the kinds it
  produced so a diagnostics page can quote them.
- `remark-den.ts` reads them from `node.meta`, which mdast already separates from `node.lang`
  (a fence ` ```den fails inputs="…" ` arrives as `lang: "den"`, `meta: 'fails inputs="…"'`),
  so nothing is parsed out of the tag. A `fails` block gets a warning border in `dendrite.css`.
- **Where `any` would hide the point:** a derived `any` port accepts anything, so a sample
  written to show a type error would load happily. Every ` fails ` sample and every sample on
  `writing/types` declares its inputs with the ` inputs="…" ` tag; prose samples elsewhere keep
  the derived ports.

| File | Change |
|---|---|
| `apps/docs/vitest.config.ts`, `apps/docs/package.json` | the test project |
| `apps/docs/src/content/content.test.ts` | new |
| `apps/docs/src/plugins/remark-den.ts`, `apps/docs/src/styles/dendrite.css` | the tags |

Est. 2 h.

### Step 3 - docs: Learn

Eight pages, in the order a reader meets them, each ending in one "next" line.

| Page | Contents |
|---|---|
| `getting-started` | the playground, no install: a binding, an input, an output typed in, then the input changed and the output moving. One live block. Ends by splitting the two readers |
| `examples/index` | two worked programs, live and editable: the grader (cleaned of the deliberate error) and the heights roll-up, each with a sentence on what it shows |
| `writing/bindings-and-outputs` | `let` and `output`; computed once per cycle; order does not matter; nothing mutates |
| `writing/inputs` | `$name`, who supplies it, and that a change recomputes only what depends on it |
| `writing/operators-and-ops` | every operator is sugar (`a + b` is `Add(a, b)`); precedence; when to write the op |
| `writing/lambdas-and-lists` | a lambda, then `Filter`, `Map`, `Reduce`; closures are lexical; recursion is impossible, so every program terminates |
| `writing/types` | the checker runs before anything does; what a type error looks like (one ` fails ` sample, its inputs declared so the error is real); `any` and `null`. No catalogue |
| `how-a-program-runs` | the `<Chain/>` diagram, then five short paragraphs, one per stage, each saying what you can rely on. Links into How it works |

Source material: `architecture.md`'s first-class-functions and type-system sections adapt
almost verbatim once the file names come out; `CLAUDE.md`'s key-properties list is the spine of
getting-started.

Est. 1 day.

### Step 4 - docs: the stdlib conventions page

`stdlib/index.md` grows the conventions the generated pages assume: how an op is called,
variadic inputs, `any` as an input type, function-typed inputs and what that means at a call
site, output types that depend on inputs (`inferOutput`), and the segments a host will be able
to pick, pointing at the core backlog entry rather than promising a date.

Est. 1 h.

### Step 5 - core: one registry for every diagnostic kind

Five families, 49 union members, each documented today only by a trailing comment:

| Stage | Where | Members | Channel |
|---|---|---|---|
| `load` | `environment.ts` `LoadError` | 3 | `LoadResult` |
| `parse` | `parser/types.ts` | 6 errors, 3 warnings | `ProgramDiagnostic` |
| `analyse` | `analyser/types.ts` | 18 errors, 7 warnings | `ProgramDiagnostic` |
| `ports` | `compose.ts` `PortProblem` | 5 | `ProgramDiagnostic` |
| `evaluate` | `evaluator/types.ts` | 7 | `outputs.error`, **not** a diagnostic |

New `language/infra/diagnostics.ts`:

```ts
export interface DiagnosticDoc {
  stage: "load" | "parse" | "analyse" | "ports" | "evaluate";
  severity: "error" | "warning";
  /** One line: what it means, in the reader's terms. The unions' comments, rewritten. */
  message: string;
  /** A program that triggers it - `den` template, loaded by the test. */
  example?: SavedProgram;
  /** Input values, for an evaluate-stage kind that only fires when the program runs. */
  inputs?: Record<string, unknown>;
  /** For kinds a program cannot trigger (a language registered wrong), what does. */
  triggeredBy?: string;
}
export const diagnostics: readonly DiagnosticDoc[];
```

Built as one `satisfies Record<ParseErrorKind, …>` object per family (the review's point: a
missing or extra kind is then a compile error, with no new exports in the type files), flattened
into the array with its stage and severity stamped on. The registry is keyed by stage and kind
together, because `unknown_type` and `incompatible_field_override` each appear in two families
and mean different things there.

`diagnostics.test.ts`: every entry with an `example` loads (or, for `evaluate`, runs with its
`inputs`) and **includes** that kind among what it produced — not "exactly", since one mistake
cascades into several diagnostics. The three descriptor-level kinds (`missing_evaluator`,
`orphan_evaluator`, and `incompatible_field_override` at the analyse stage) carry `triggeredBy`
prose instead of an example, because they need a language registered wrongly rather than a
program.

Leave `ProgramDiagnostic.kind` as `string`: narrowing it to a union of four families would
couple the runtime shape to every family's type, and the registry already gives the docs what
they need.

| File | Change |
|---|---|
| `packages/core/src/language/infra/diagnostics.ts`, `diagnostics.test.ts` | new |
| `packages/core/src/index.ts` | export |
| `.docs/analyser-spec.md` | its hand-listed kinds point at the registry |

Est. 1 day (49 worked examples, not 3 h as first written).

### Step 6 - docs: How it works

| Page | Contents |
|---|---|
| `the-chain` | the diagram again, then `grade.den` through every stage with the real output of the four scripts: tokens, raw program, core program, values. What each stage may decide and must leave alone |
| `types` | the structured `Type` union; named versus structural; `isCompatible`'s rules one at a time — `any` is data-only, functions are never `any` and why that keeps programs total, array covariance, function variance, `extends` chains |
| `ports-and-layers` | a language is vocabulary; layers compose in order; order is authority and there is no override; policy as data; at most one persisted layer; `shadowed_name` blamed on the later layer |
| `evaluation` | pull-based, `dependsOn`, the cache decision, the three cache layers, what a changed input actually recomputes, stale rather than hidden |
| `diagnostics` | the generated table from step 5: stage, kind, what it means, a sample that triggers it |
| `persistence` | the authoring form is canonical; the `code` / `rete` / `ast` union; re-analysis on load, so descriptor drift surfaces; the two version axes |
| `glossary` | written last, from the terms these pages used |

Source material: `decisions.md` §7 is the authority for ports and layers and is current;
`architecture.md`'s pipeline, cache and type sections carry over; `analyser-spec.md` predates
the ports split and disclaims itself, so verify every sentence against the code.

Est. 1 day.

### Step 7 - docs: Host developers

| Page | Contents |
|---|---|
| `installation` | install, a language, an environment, a runtime, the host's contract as a port layer; every option each takes |
| `embedding-core` | the four execution levels and what each owns; the instance as the front door, five observables and four commands; one host from bare runtime to deployed program |
| `extending-the-language` | register a type, an op and its evaluator, an operator as sugar; `inferOutput` / `inferInputTypes`; building on stdlib segments. One host-specific op end to end |
| `packages/core` | what the package exports and how the pieces fit |
| `packages/editor` | the connection kinds, the blocks, the three presets and `LayoutConfig`, theming |
| `packages/link` | the protocol, the trust boundary, the worked WebSocket host |

Source material: `architecture.md`'s execution-levels table and linking section; the editor and
link READMEs are already written for this reader and mostly need trimming into pages.

Then: `@dendrite-lang/core@0.1.0`, and `todo.md`'s "Document the core language" closes.

Est. 1 day.

Total ≈ 4.5 days, seven commits. PR point after step 4, and again after step 7.

## Verification

- Root gates after every step, now including the docs test project in `yarn test`.
- Step 2: break a fence deliberately and see the test fail; check a `$`-using sample passes
  through the derived `any` ports, and that an ` inputs="…" ` tag overrides them. Run
  `astro check` as well: no `?raw` import exists in the repo yet, and Astro's `env.d.ts` is
  what types `*?raw`, so this is the first thing that would show a gap.
- Step 5: add a kind to a union temporarily and confirm the build fails until it is documented;
  every example produces its own kind.
- Browser on the built site per content step (`astro preview --port 4323`): the page reads top
  to bottom, its live block edits and recomputes, its static fences are highlighted, the "next"
  link goes where it says, dark and light, phone width, console clean. Pagefind finds a phrase
  from each new page. The `<Chain/>` diagram checked at phone width in step 3 — if the
  port-layer join reads badly in CSS, switch that component to SVG then, not later.
- After step 4: the whole Learn path walked end to end, in order. Does it teach someone who has
  not read the code.

## Patterns and smells

| Pattern / smell | Where |
|---|---|
| Single source of truth | the diagnostics registry feeds the table and the test; op text already feeds the reference |
| Shotgun Surgery — avoided | a kind is added in one place and the build says the docs are missing |
| Duplicate Code — watched | two chain pages; the Learn-says-what / depth-says-why rule is the guard, and `writing/types` carries no catalogue |
| Primitive Obsession — watched | samples live as `.den` files rather than as strings in JSX, so one loader tests them all |
| Speculative Generality — avoided | no glossary until terms accumulated, no versioning, no API reference generator, `ProgramDiagnostic.kind` left as `string` |

## Review passes (what the review changed)

1. **Fence ports.** A sample using `$score` cannot load against a descriptor with no inputs.
   The test derives a layer from the `$names` as `any`, with an ` inputs="…" ` tag to override.
2. **Coverage.** The editable blocks are JSX props, invisible to a fence test. The programs
   move into `src/examples/*.den`, imported with `?raw`, and the same test globs them.
3. **Exactness.** "Includes that kind", not "exactly": one mistake cascades. Evaluate-stage
   entries carry `inputs`, since they only fire when the program runs.
4. **Mechanism.** `satisfies Record<Kind, Doc>` per family instead of exporting kind arrays —
   the compile error comes for free and the type files stay untouched.
5. **Beyond the review, from checking the code:** there are **five** families, not four — the
   review's 46 misses `LoadError`'s three kinds, and `ProgramDiagnostic.stage` already carries
   `load`. Evaluate-stage kinds reach a host through `outputs.error`, never as a diagnostic, so
   the registry's `stage` says which channel carries it. And `unknown_type` /
   `incompatible_field_override` each exist in two families, so the registry keys on (stage,
   kind); keying on kind alone would silently drop one of each pair.
6. **Reorder, accepted.** Prose first, registry fifth. `writing/types` therefore shows what a
   type error looks like and leaves the catalogue to the diagnostics page, which is the better
   page for it anyway.
7. **URLs, accepted.** The four pages move out of `learn/` now.
8. **Diagram, accepted with a fallback.** CSS grid first, SVG only if the port-layer join reads
   badly, decided in the browser during step 3.
9. **The typo is in two files**, not one: `heights.den` and the `1-run.ts` that feeds it.
10. **Second review pass.** Fence meta needs no parsing: mdast already splits `node.lang` from
    `node.meta`. `?raw` has no precedent in this repo, so step 2 verifies with `astro check`.
    And a derived `any` port would swallow the very error a type sample means to show, so
    `writing/types` and every ` fails ` sample declare their inputs.

## ADHD recap

Seven commits, roughly four and a half days, prose first. (1) The sidebar move — How it works
becomes its own section, Examples moves up in Learn — plus the two stale example programs
fixed. (2) A test that loads every ` ```den ` fence and every `src/examples/*.den`, deriving
ports from the `$names`, with a ` fails ` tag for samples that must not compile. (3) Learn,
eight pages. (4) The stdlib conventions page. (5) Core: one registry for all 49 diagnostic
kinds across five families, keyed by stage and kind, with a compile error when one is
undocumented. (6) How it works, seven pages. (7) Host developers, six pages. One live editable
block per page, everything else static so search can see it, every page ending in "next".
