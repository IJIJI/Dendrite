# The language documentation — plan

> The content pass into the site skeleton built 2026-09-09 (`docs-plan.md`). The skeleton,
> the generated stdlib reference and the live example blocks all landed; every prose page is
> still a one-paragraph stub saying what it will cover. Those stubs are the outline: each one
> already promises the right thing, so this plan fills them rather than redesigning them.

## Context

`@dendrite-lang/core@0.1.0` should ship documented, and nothing written so far teaches the
language: `.docs/` holds design records and an architecture map for someone already inside the
code. The gap is the one `todo.md` calls IMPORTANT — "the code is good" versus "the language
exists for other people".

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
page needs a mechanism to explain itself, it states the guarantee and links down.

Settled with the user (2026-09-12): the section is named **How it works**, so the four existing
`learn/how-it-works/*` pages keep their URLs and simply become top-level. Live means editable,
and a block goes live wherever an input teaches something or could. The diagnostics table is
generated from core, after a core change that gives it one source.

## Decisions

| Point | Decision | Why |
|---|---|---|
| The chain, twice | a plain page ending Learn, the deep one per stage in How it works | the two-layer ask in `todo.md`; the rule above stops the overlap |
| The diagram | one `<Chain/>` component, inline SVG themed through `--sl-*`, block style from `brand/brand-sheet.html`; both chain pages use it | the content note asks for diagram first, prose second; one component, two pages |
| The worked example | `grade.den`, already carried through every stage by the four scripts in `packages/core/examples/3-(code)/` | real output per stage, and it cannot rot: the scripts run it |
| Samples | every ` ```den ` fence loaded by a test; a marked fence is asserted to FAIL instead | the `todo.md` requirement, and the diagnostics pages need broken samples on purpose |
| Diagnostics | one registry in core over all four families, with a message and a triggering example each; the docs table and the test read it | 44 kinds live as scattered string literals; a hand-written table drifts on the first rename |
| Live blocks | editable, one per page at the moment it teaches; every other sample static | the pages stay fast and searchable (Pagefind indexes static code, not islands) |
| Glossary | How it works' last page, written last from the terms the other pages actually used | the content note deferred it until terms accumulated; four sections accumulate them |
| Reader signposting | one line at the top of each section's first page saying who it is for and where the other reader goes | the content note's "two readers" |

## Steps

Each step is one commit; root gates after each; a commit table with its message follows each.

### Step 1 - core: one registry for every diagnostic kind

Today the kinds are string literals in four families, each documented only by a trailing
comment on its union: `ParseErrorKind` / `ParseWarningKind` (`parser/types.ts`),
`AnalysisErrorKind` / `AnalysisWarningKind` (`analyser/types.ts`), the compose-time ports
problems (`compose.ts`, `validateDescriptor`), and `EvalErrorKind` (`evaluator/types.ts`).
`ProgramDiagnostic.kind` is a bare `string`, so nothing ties them together.

New `language/infra/diagnostics.ts`:

```ts
export interface DiagnosticDoc {
  kind: string;
  stage: "parse" | "analyse" | "ports" | "evaluate";
  severity: "error" | "warning";
  /** One line: what it means, in the reader's terms. */
  message: string;
  /** A program that triggers exactly this kind - `den` template, run by the test. */
  example?: SavedProgram;
  /** For kinds a program cannot trigger (a language registered wrong), what does. */
  triggeredBy?: string;
}
export const diagnostics: readonly DiagnosticDoc[];
```

The comments already on the unions become the `message` field. Kinds a program can trigger
get a `den` example; the descriptor-level ones (`missing_evaluator`, `orphan_evaluator`,
`incompatible_field_override`) get `triggeredBy` prose instead, since they need a broken
language rather than a broken program.

`diagnostics.test.ts`: every member of every kind union appears exactly once in the registry
(a mapped type makes a missing kind a compile error, so adding a kind without documenting it
does not build); every `example` loads and produces exactly that kind, and no other error.

Optional in the same commit, decide while writing: `ProgramDiagnostic.kind` becomes the union
of the four families instead of `string`.

| File | Change |
|---|---|
| `packages/core/src/language/infra/diagnostics.ts`, `diagnostics.test.ts` | new |
| `packages/core/src/index.ts` | export |
| `packages/core/src/language/{parser,analyser,evaluator}/types.ts` | kinds exported as arrays for the exhaustiveness check |
| `.docs/analyser-spec.md` | its hand-listed kinds point at the registry |

Est. 3 h.

### Step 2 - docs: the sections, and the two stale programs

- `astro.config.ts` sidebar: **How it works** becomes a top-level group between `stdlib` and
  Host developers (`autogenerate` over the same directory, so the four pages keep their URLs);
  inside Learn, Examples moves above Writing programs, and a new `learn/how-a-program-runs.md`
  closes it.
- Each section's first page gains the reader line; the splash's three cards gain one sentence
  pointing the two readers at their section.
- `packages/core/examples/3-(code)/grade.den`: the header comment claims operators have not
  landed while the program uses them - corrected. `4-(environment)/heights.den`: the
  `treshold` typo and the three commented-out field-access lines.

| File | Change |
|---|---|
| `apps/docs/astro.config.ts` | the sidebar |
| `apps/docs/src/content/docs/learn/how-a-program-runs.md` | new stub, filled in step 4 |
| `apps/docs/src/content/docs/{learn/getting-started,stdlib/index,host/installation}.md`, `index.mdx` | the reader lines |
| `packages/core/examples/**/*.den` | the two fixes |

Est. 1 h.

### Step 3 - docs: the fence test

`apps/docs/src/content/content.test.ts` (a vitest project for the docs workspace, which has
none yet): glob every `.md`/`.mdx` under `content/docs`, pull each ` ```den ` fence, and load
it through `createEnvironment(createStdlib())`. A fence tagged ` ```den fails ` is asserted to
produce at least one error instead, and the test prints the kinds it produced so a diagnostics
page can quote them. `remark-den.ts` treats the `fails` word as part of the language tag and
styles the block with a warning border.

| File | Change |
|---|---|
| `apps/docs/src/content/content.test.ts`, `apps/docs/vitest.config.ts`, `package.json` | new test project |
| `apps/docs/src/plugins/remark-den.ts`, `apps/docs/src/styles/dendrite.css` | the `fails` tag |

Est. 1.5 h.

### Step 4 - docs: Learn

Eight pages, in the order a reader meets them. Every page ends in one "next" line.

| Page | Contents |
|---|---|
| `getting-started` | the playground, no install: a binding, an input, an output typed in; the input changed and the output moving. One live block. Ends by splitting the two readers |
| `examples/index` | two worked programs, live and editable: the grader (`grade.den`, cleaned) and the heights roll-up. Each with a sentence on what it shows |
| `writing/bindings-and-outputs` | `let` and `output`; computed once per cycle; order does not matter; nothing mutates |
| `writing/inputs` | `$name`, who supplies it, and that a change recomputes only what depends on it |
| `writing/operators-and-ops` | every operator is sugar (`a + b` is `Add(a, b)`); precedence; when to write the op |
| `writing/lambdas-and-lists` | a lambda, then `Filter`, `Map`, `Reduce`; closures are lexical; recursion is impossible, so every program terminates |
| `writing/types` | the checker runs before anything does; the messages you actually meet (from the registry, the common handful); `any` and `null` |
| `how-a-program-runs` | the `<Chain/>` diagram, then five short paragraphs, one per stage, each saying what you can rely on. Links into How it works |

Source material: `architecture.md`'s first-class-functions and type-system sections adapt
almost verbatim once the file names come out; `CLAUDE.md`'s key-properties list is the spine
of getting-started.

Est. 1 day.

### Step 5 - docs: the stdlib conventions page

`stdlib/index.md` grows the conventions the generated pages assume: how an op is called,
variadic inputs, `any` as an input type, function-typed inputs and what that means at a call
site, output types that depend on inputs (`inferOutput`), and the segments a host will be able
to pick (pointing at the core backlog entry rather than promising a date).

Est. 1 h.

### Step 6 - docs: How it works

| Page | Contents |
|---|---|
| `the-chain` | the diagram again, then `grade.den` through every stage with the real output of the four scripts: tokens, raw program, core program, values. What each stage may decide and must leave alone |
| `types` | the structured `Type` union; named versus structural; `isCompatible`'s rules one at a time - `any` is data-only, functions are never `any` and why that keeps programs total, array covariance, function variance, `extends` chains |
| `ports-and-layers` | a language is vocabulary; layers compose in order; order is authority and there is no override; policy as data; at most one persisted layer; `shadowed_name` blamed on the later layer |
| `evaluation` | pull-based, `dependsOn`, the cache decision, the three cache layers, what a changed input actually recomputes, stale rather than hidden |
| `diagnostics` | the generated table from step 1: kind, stage, what it means, a sample that triggers it |
| `persistence` | the authoring form is canonical; the `code` / `rete` / `ast` union; re-analysis on load, so descriptor drift surfaces; the two version axes |
| `glossary` | written last, from the terms these pages used |

Source material: `decisions.md` §7 is the authority for ports and layers and is current;
`architecture.md`'s pipeline, cache and type sections carry over; `analyser-spec.md` needs
verifying line by line against the code (it predates the ports split and disclaims itself).

Est. 1 day.

### Step 7 - docs: Host developers

| Page | Contents |
|---|---|
| `installation` | install, a language, an environment, a runtime, the host's contract as a port layer; every option each takes |
| `embedding-core` | the four execution levels and what each owns; the instance as the front door, five observables and four commands; one host from bare runtime to deployed program |
| `extending-the-language` | register a type, an op and its evaluator, an operator as sugar; `inferOutput` / `inferInputTypes`; building on stdlib segments. One host-specific op end to end |
| `packages/core` | what the package exports and how the pieces fit |
| `packages/editor` | the connection kinds, the blocks, the three layout presets and `LayoutConfig`, theming |
| `packages/link` | the protocol, the trust boundary, the worked WebSocket host |

Source material: `architecture.md`'s execution-levels table and linking section; the editor and
link READMEs are already written for this reader and mostly need trimming into pages.

Est. 1 day.

Then: `@dendrite-lang/core@0.1.0`, and `todo.md`'s "Document the core language" closes.

## Verification

- Root gates after every step, plus the new docs test project in `yarn test`.
- Step 1: the exhaustiveness check fails when a kind is added without a registry entry (verify
  by adding one temporarily); every example produces exactly its kind.
- Step 3: verify the test catches a broken fence (break one, see it fail, fix it).
- Browser on the built site per content step: the page reads top to bottom, its live block
  edits and recomputes, its static fences are highlighted, the "next" link goes where it says,
  dark and light, phone width, console clean. Pagefind finds a phrase from each new page.
- The whole Learn path walked end to end once, in order, after step 5: does it teach someone
  who has not read the code.

## Patterns and smells

| Pattern / smell | Where |
|---|---|
| Single source of truth | the diagnostics registry feeds the table and the test; op text already feeds the reference |
| Shotgun Surgery - avoided | a kind is added in one place and the build tells you the docs are missing |
| Duplicate Code - watched | two chain pages; the Learn-says-what / depth-says-why rule is the guard |
| Speculative Generality - avoided | no glossary until terms accumulated, no versioning, no API reference generator |

## ADHD recap

Seven commits. First core: one registry for all 44 diagnostic kinds, with an example each and
a compile error if one is undocumented. Then the sidebar move (How it works becomes its own
section, Examples moves up in Learn) and the two stale example programs fixed. Then the test
that loads every ` ```den ` fence in the docs. Then the prose, in reader order: Learn (eight
pages, one day), the stdlib conventions page, How it works (seven pages, one day), Host
developers (six pages, one day). Roughly three and a half days of writing, each page ending in
"next", one live editable block per page, everything else static so search can see it.
