# The first release — plan

> **Status: proposed 2026-09-15.** Publishes `@dendrite-lang/core`, `@dendrite-lang/editor` and
> `@dendrite-lang/link` at 0.1.0 to npm, from CI, and records it.

## Context

The language is documented (`language-docs-plan.md`, done) and nothing is on npm. The docs'
Installation page carries a "not on npm yet" callout, and the drafted release text assumes the
packages exist. This plan makes the three packages publishable, publishes them from a workflow,
and removes the callout once they are live.

Checked before planning: `@dendrite-lang/core` returns 404 on npm; editor and link are `private`
at `0.0.0`; no package sets `publishConfig.access`, so a scoped package would publish as
restricted; no package folder has a LICENSE, and core has no README, so its npm page would be
blank and the MPL-2.0 text would not ship; no package README has an install line; this machine
is not logged in to npm; there are no tags, releases, changelogs or publish workflow. Yarn is
4.15, whose `yarn npm publish` has `--access`, `--provenance` (GitHub Actions only),
`--tolerate-republish` and `--dry-run`, and rewrites `workspace:` ranges on the way out.

## Decisions

Settled with the user (2026-09-15):

| Point | Decision | Why |
|---|---|---|
| Scope | core, editor and link, all at 0.1.0 | they are developed together and the docs and playground run on all three |
| npm scope | the `dendrite-lang` org exists | nothing to create |
| Publishing | from CI, on a published GitHub release | quick with Yarn 4.15, so the first release goes through it too; manual stays the fallback |
| Records | release notes on GitHub, and a changelog | both |
| Versioning | **independent-ready**: all start at 0.1.0, but tags and changelogs are per package | they will move together at first and apart later; setting per-package conventions now makes that switch free instead of a cleanup |

Following from those:

| Point | Decision | Why |
|---|---|---|
| Tags | `@dendrite-lang/core@0.1.0`, one per package | a single `v0.1.0` only suits locked versions |
| Changelogs | `CHANGELOG.md` in each package folder, listed in `files` | npm does not include a changelog unless told to; a root changelog would have to be split later |
| What CI publishes | every non-private workspace, in dependency order, skipping versions npm already has | one workflow serves every future release: bump one package, release it, and only that one actually publishes |
| Auth | a granular npm access token as the `NPM_TOKEN` repo secret | verified route with Yarn; `--provenance` needs `id-token: write` on top. Token-free trusted publishing is not verified to work with Yarn and is not relied on |
| Provenance | on in the workflow, not in `publishConfig` | Yarn refuses `--provenance` outside CI, so a `publishConfig` flag would break the manual fallback |
| Launch release | one GitHub release covering all three, on the core tag | the workflow publishes all three regardless of which tag triggered it |
| LICENSE | a copy in each package folder | npm ships `LICENSE` from the package folder automatically; the license text has to travel with the code |

**The coupling to remember:** before 1.0 a minor bump is breaking, and editor and link peer on
core `^0.1.0` (below 0.2.0). Core 0.2.0 therefore forces an editor and a link release, whatever
their own code did. Recorded in each changelog's header.

## Steps

Each step is one commit, root gates after each, a commit table follows each. Steps 4 and 5
include actions only the user can take, marked **you**.

### Step 1 - the three packages, publishable

- **editor, link**: `version` to `0.1.0`, `private` removed; `keywords`, `homepage` (the docs
  site), `bugs` added to match core.
- **all three**: `publishConfig: { "access": "public" }`; `LICENSE` copied from the root into
  the package folder.
- **core**: a `README.md`, short - what it is, install, the ten-line setup from the docs'
  Installation page, links to the docs and the playground. It is the npm page.
- **editor, link**: an install line added to each README, and a link to the matching docs page.
  Their "Develop" sections stay; they are useful on GitHub too.
- Verify with `npm pack --dry-run` in each folder: README, LICENSE, package.json and `dist` (plus
  `style.css` for the editor) - and no `src`, `examples` or tests.

| File | Change |
|---|---|
| `packages/{core,editor,link}/package.json` | publish metadata; editor and link to 0.1.0 |
| `packages/{core,editor,link}/LICENSE` | new, copied from the root |
| `packages/core/README.md` | new |
| `packages/{editor,link}/README.md` | install line, docs link |

Est. 1.5 h.

### Step 2 - install the packed packages somewhere else, before any publish

The one check that catches a broken `exports` map, missing types or a stray `workspace:` range:
consume the real tarballs from outside the monorepo.

- `yarn pack` each package into the scratchpad.
- A throwaway project there: `npm install` the three tarballs plus `react` and `react-dom`.
- A script that loads core with `require` **and** `import`, runs a program through an instance,
  loads link's `serveInstance`/`connectInstance` and the editor's headless entry; and a
  `tsc --noEmit` over a file importing all public entry points, including
  `@dendrite-lang/editor/react`, so the shipped types resolve.
- Fix what it finds in the packages; nothing from this step is committed except those fixes.

No commit of its own unless it finds something. Est. 1 h.

### Step 3 - changelogs

- `packages/{core,editor,link}/CHANGELOG.md`, each starting with a short header (the format, and
  the pre-1.0 coupling above) and a `0.1.0` section: what the package does at its first release,
  in the terms of the drafted release text.
- `CHANGELOG.md` added to each package's `files`.

| File | Change |
|---|---|
| `packages/{core,editor,link}/CHANGELOG.md` | new |
| `packages/{core,editor,link}/package.json` | `files` |

Est. 45 min.

### Step 4 - the publish workflow

`.github/workflows/publish.yml`:

- on `release: types: [published]`, plus `workflow_dispatch` for a re-run;
- `permissions: { contents: read, id-token: write }`; its own concurrency group, never
  cancelled mid-publish;
- the shared setup action, then `yarn build` and `yarn test` - a release does not publish a
  build that fails its own tests;
- `yarn workspaces foreach --all --no-private --topological npm publish --access public
  --provenance --tolerate-republish`, with `YARN_NPM_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`.
  `--no-private` leaves out the root, the docs and the playground; `--topological` publishes
  core before the packages that peer on it; `--tolerate-republish` makes a partial failure safe
  to re-run and makes the workflow correct for a release that bumped only one package.
- Verified locally with the same command and `--dry-run` in place of the publish flags.

**You:** create a granular npm access token with read and write on the `@dendrite-lang` packages,
and add it to the repository as the secret `NPM_TOKEN`.

| File | Change |
|---|---|
| `.github/workflows/publish.yml` | new |

Est. 1 h.

### Step 5 - release, then make the docs true

1. **You:** merge `dev` into `main` (the docs PR, then this work, or both in one).
2. **You:** push the three tags on `main` -
   `@dendrite-lang/core@0.1.0`, `@dendrite-lang/editor@0.1.0`, `@dendrite-lang/link@0.1.0` (the
   commands will be in the commit table).
3. **You:** publish one GitHub release on the core tag, with the release text - which I rewrite
   for all three packages, since the draft said editor and link were not published.
4. The workflow publishes; I confirm all three with `npm view` and install them fresh.
5. A commit on `dev`: the Installation page loses its callout; the root README's npm badge is
   switched on; `.docs/todo.md` and `CLAUDE.md` record the release.

| File | Change |
|---|---|
| `apps/docs/src/content/docs/host/installation.md` | callout removed |
| `README.md` | npm badge |
| `.docs/todo.md`, `.docs/CLAUDE.md` | released |

Est. 30 min plus the workflow run.

Total ≈ 5 h of work, four commits, and five actions of yours.

## Verification

- Root gates after every step.
- Step 1: `npm pack --dry-run` lists exactly the intended files for each package.
- Step 2: the packed tarballs install and import from a project outside the monorepo, by
  `require`, by `import` and by `tsc`.
- Step 4: the publish command passes as a dry run locally, covering exactly the three packages
  in topological order.
- Step 5: `npm view @dendrite-lang/{core,editor,link} version` all answer `0.1.0`; the npm pages
  show the READMEs and a provenance badge; a clean install in a new folder works; the docs
  Installation page's commands are now true.

## If CI publishing fails

The fallback is manual and uses the same command: log in with `npm login`, then
`yarn workspaces foreach --all --no-private --topological npm publish --access public
--tolerate-republish --otp <code>` from `main`, without `--provenance`. `--tolerate-republish`
means whatever CI already published is skipped.

## Patterns and smells

| Pattern / smell | Where |
|---|---|
| Single command, many releases | one publish invocation serves a launch of three and a patch of one |
| Speculative Generality - avoided | no changesets and no release tooling until independent releases actually happen; per-package tags and changelogs cost nothing now |
| Test the artefact, not the source | step 2 installs the tarballs rather than trusting the workspace |

## ADHD recap

Four commits and five things for you. (1) Make the packages publishable: public access, LICENSE,
a core README, editor and link to 0.1.0. (2) Install the packed tarballs in an outside project to
prove they work. (3) A changelog per package. (4) A workflow that publishes on a GitHub release,
skipping anything npm already has. Then you add an npm token secret, merge, push three tags and
publish one release; I confirm it landed and remove the "not on npm yet" callout.
