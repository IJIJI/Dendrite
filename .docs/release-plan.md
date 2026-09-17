# The first release — plan

> **Status: DONE 2026-09-15.** `@dendrite-lang/core`, `@dendrite-lang/editor` and
> `@dendrite-lang/link` are on npm at 0.1.0, staged from CI through trusted publishing and
> approved by hand, with provenance. The plan below is kept as the record; **"Every later
> release" is the runbook** for the next one, and "What the first release taught" holds what only
> doing it showed.

## Context

The language is documented and nothing is on npm. The first plan published from CI with an npm
access token. Checking npm's current rules overturned that: write-enabled granular tokens are
capped at 90 days, and from **January 2027 bypass-2FA tokens lose direct publishing** entirely
([GitHub changelog, 2026-07-31](https://github.blog/changelog/2026-07-31-restricting-npm-bypass-2fa-granular-access-tokens/)).
A token workflow built now would stop working in four months.

The durable route is **trusted publishing (OIDC)** from GitHub Actions: no secret, provenance
added automatically ([npm docs](https://docs.npmjs.com/trusted-publishers/)). Combined with
**staged publishing**, CI builds and stages a version and nothing goes live until the maintainer
approves it with 2FA ([npm docs](https://docs.npmjs.com/staged-publishing/)). Both have a
bootstrap constraint: **a package must already exist on npm** before a trusted publisher can be
configured, and staging cannot be used for a brand-new package.

Settled with the user (2026-09-15):

| Point | Decision |
|---|---|
| Packages | core, editor and link, all at 0.1.0 |
| npm org | `dendrite-lang` exists |
| Later releases | **CI stages, the user approves** with 2FA |
| First release | a **manual release-candidate publish** by the user, to create the packages and to have done a manual publish once; then **0.1.0 itself goes through CI staging** |
| Candidate cleanup | the candidates are **unpublished** once 0.1.0 is live, so npm shows only 0.1.0 |
| Records | GitHub release notes, plus a changelog |
| Versioning | independent-ready: per-package tags and changelogs, all starting at 0.1.0 |

Why a candidate rather than 0.0.1: both can be unpublished under the same rules, but 0.0.1 would
claim `latest` and read like a real earlier release, while `0.1.0-rc.0` under the `next` tag is
marked as what it is. After cleanup both leave the same thing: 0.1.0 alone.

## Facts checked

| Fact | Consequence |
|---|---|
| Local npm is 10.9.3, Node 22.20 | enough for a manual `npm publish` and `npm unpublish`; staging needs npm 11.15.0+ and trusted publishing 11.5.1+, so **approve in the browser** on npmjs.com rather than upgrading npm locally |
| CI setup action pins Node 22, which ships npm 10 | the publish job installs npm 11.15+ itself |
| Trusted publishing is documented for the npm CLI only | CI publishes with npm; Yarn only packs |
| Yarn 4.15 `yarn pack` rewrites `workspace:` ranges | pack with Yarn, publish the tarball with npm |
| [Unpublish policy](https://docs.npmjs.com/policies/unpublish): within 72 h of that version's publish if nothing depends on it; afterwards only with <300 weekly downloads and a single maintainer; unpublishing the **only** version deletes the package and blocks it for 24 h; a used `name@version` can never be reused | delete the candidates **after** 0.1.0 is live, **in the same sitting** as the candidate publish, **link and editor before core** |
| No package sets `publishConfig.access`; scoped packages default to restricted | `access: public` on all three |
| No LICENSE in any package folder; core has no README; no README has an install line | fixed in step 1 |
| editor and link are `private` at `0.0.0` | fixed in step 1 |

## Steps

Commits of mine are gated at the root and followed by a commit table. Actions only the user can
take are marked **You**.

### Step 1 - the three packages, publishable

- **editor, link**: `version` 0.1.0, `private` removed; `keywords`, `homepage` (the docs site),
  `bugs` added to match core.
- **all three**: `publishConfig: { "access": "public" }`; `LICENSE` copied from the root into the
  package folder.
- **core**: a short `README.md` - what it is, install, the setup from the docs' Installation page,
  links to the docs and playground. It is the npm page.
- **editor, link**: an install line and a docs link in each README.
- Verify with `npm pack --dry-run` in each folder: README, LICENSE, package.json, `dist` (plus
  `style.css` for the editor), and nothing else.

| File | Change |
|---|---|
| `packages/{core,editor,link}/package.json` | publish metadata; editor and link to 0.1.0 |
| `packages/{core,editor,link}/LICENSE` | new, copied from the root |
| `packages/core/README.md` | new |
| `packages/{editor,link}/README.md` | install line, docs link |

Est. 1.5 h.

### Step 2 - install the packed packages from outside the repo

The workspace resolves imports to source, so a broken `exports` map or missing types would only
surface for the first person who installs. Test the artefact instead:

- `yarn pack` each package into the scratchpad.
- A throwaway project there: `npm install` the three tarballs with `react` and `react-dom`.
- A script that loads core with `require` **and** `import` and runs a program through an
  instance, loads link's `serveInstance` / `connectInstance` and the editor's headless entry; and a
  `tsc --noEmit` over a file importing every public entry point including
  `@dendrite-lang/editor/react`.
- `npm publish <tarball> --dry-run` on each, which also shows what npm would upload.

No commit unless it finds something to fix. Est. 1 h.

### Step 3 - changelogs

- `packages/{core,editor,link}/CHANGELOG.md`: a header naming the format and the pre-1.0 coupling
  (editor and link peer on core `^0.1.0`, so core 0.2.0 forces a release of both), and a `0.1.0`
  section.
- `CHANGELOG.md` added to each package's `files`.

| File | Change |
|---|---|
| `packages/{core,editor,link}/CHANGELOG.md` | new |
| `packages/{core,editor,link}/package.json` | `files` |

Est. 45 min.

### Step 4 - the staging workflow

`.github/workflows/publish.yml`:

- on `release: types: [published]`, plus `workflow_dispatch`;
- `permissions: { contents: read, id-token: write }`; its own concurrency group, never cancelled
  mid-run; a GitHub-hosted runner (trusted publishing does not support self-hosted ones);
- the shared setup action, then `yarn build` and `yarn test`;
- `npm install -g npm@^11.15.0`;
- for each public package in dependency order (core, editor, link): `yarn pack` into `packs/`;
  if `npm view <name>@<version>` already answers, skip it; otherwise `npm stage publish
  <tarball>`. The skip makes a re-run safe and makes the same workflow right for a release that
  bumped only one package.
- No token, no secret: authentication is the OIDC exchange; provenance is automatic.

**Confirmed while building (2026-09-15):** `npm stage publish` accepts a Yarn-packed tarball -
npm 11.19's dry run reports `+ @dendrite-lang/core@0.1.0 (staged)` - so no fallback is needed.
The staging step was run from the workflow's own text with `npm stage` swapped for its dry run:
it found exactly the three public packages, packed each outside the repo, and staged all three;
the skip check was tested both ways, and an empty package list fails the job.

| File | Change |
|---|---|
| `.github/workflows/publish.yml` | new |

Est. 1 h.

### Step 5 - the release

In one sitting, from **c** to **i**, so the candidates are removed well inside 72 hours.

a. **You:** merge `dev` into `main`.
b. **Me:** from `main`, pack the three packages with their version set to `0.1.0-rc.0` (not
   committed) into the scratchpad, and dry-run each publish. I give you the exact commands.
c. **You:** `npm login`, then publish the three candidates by hand, core first:
   `npm publish <tarball> --tag next --access public`, with your 2FA. **This is the manual
   publish.** It creates the three packages.
d. **Me:** `npm view @dendrite-lang/<name> dist-tags` for each. If `latest` points at the
   candidate, that is harmless: 0.1.0 takes it over in step g.
e. **You:** on npmjs.com, for each of the three packages, Settings → Trusted publishing → GitHub
   Actions: user `IJIJI`, repository `Dendrite`, workflow `publish.yml`, environment empty,
   allowed action **stage publish only**. (Needs your 2FA.) Stage-only means even a compromised
   workflow cannot publish.
f. **You:** push the tags `@dendrite-lang/core@0.1.0`, `@dendrite-lang/editor@0.1.0`,
   `@dendrite-lang/link@0.1.0`, and publish one GitHub release on the core tag, with release text
   I rewrite for all three packages (the draft still says editor and link are unpublished).
g. **CI** stages the three. **You:** review and approve each on npmjs.com, core first. Before you
   approve, I can download a staged tarball and compare it with step 2's.
h. **Me:** `npm view` shows 0.1.0 as `latest` for all three, with a provenance badge; a clean
   install in a new folder works.
i. **You:** unpublish the candidates, **link and editor first, then core**:
   `npm unpublish @dendrite-lang/link@0.1.0-rc.0` and the same for editor and core. If npm refuses
   core's because editor depends on core, deprecate it instead with `npm deprecate`.
j. **Me, a commit:** the Installation page loses its "not on npm yet" callout, the root README's
   npm badge is switched on, and `.docs/todo.md`, `.docs/CLAUDE.md` and `.docs/release-plan.md`
   record the release.

| File | Change |
|---|---|
| `apps/docs/src/content/docs/host/installation.md` | callout removed |
| `README.md` | npm badge |
| `.docs/todo.md`, `.docs/CLAUDE.md`, `.docs/release-plan.md` | released |

## Every later release

The runbook. Only the packages whose version changed are part of a release.

1. On `dev`: bump each changed package's `version`, and add its changelog section. Editor and link
   peer on core `^0.1.0`, so a **minor** bump of core means a release of all three.
2. Merge `dev` into `main`.
3. On `main`, one tag per changed package: `git tag -a "@dendrite-lang/<name>@<version>" -m "…"`,
   then push the tags. Tags trigger nothing by themselves.
4. **One GitHub release per batch**, on core's tag if core is in it, otherwise on the tag of one
   changed package. The title and body name every package and version in the batch. Publishing the
   release starts `Stage release`.
   - **One release per batch is a hard rule, not a preference.** Two releases in one batch would
     start two workflow runs; the second would try to stage versions the first had already staged,
     which npm refuses, so it fails.
5. The workflow builds, tests, and stages every public package version npm does not have yet.
   Versions already on npm are skipped, so a re-run after a partial failure is safe.
6. Approve each staged version on npmjs.com with 2FA, **core first**, so a dependent is never live
   against a core version that is not.
7. Check: `npm view "@dendrite-lang/<name>" versions dist-tags`, `… dist.attestations.url` for
   provenance, and one clean install from npm outside the repo.

Nothing reaches npm without 2FA. There is no token anywhere: CI authenticates with the OIDC token
GitHub gives the run, and each package lists this repo and `publish.yml` as its trusted publisher,
allowed to **stage only**.

## What the first release taught

Kept because none of it is obvious from the plan.

- **A tarball can lag its metadata.** After approval, core's `0.1.0` metadata was complete while
  the tarball 404'd for about five minutes, so `npm install` failed. It resolved on its own. Wait
  and re-check before suspecting the release; a version number can never be reused, so never
  re-publish to "fix" it.
- **npm points `latest` at a package's first version**, whatever `--tag` was used. The
  `0.1.0-rc.0` bootstrap therefore held `latest` until 0.1.0 was approved.
- **Remove a dist-tag before unpublishing the version it points at**, or the tag dangles.
- **Editor and link cannot be `require`d.** Their `exports` offer only `import`. Node 22 can
  `require()` an ES module, but needs a matching condition; a `default` entry would do it (in
  `.docs/todo.md`).
- **npm only updates a package's README when that package is published**, so README work ships
  with the next release of each package, never on its own.
- **Commands for the user are PowerShell.** A bash `~` in a walkthrough made Yarn write the
  tarballs into `packages/*/~/`.

## If something fails

- **Staging from CI fails** (tarball not accepted, OIDC misconfigured): fix and re-run the
  workflow; nothing was published, so nothing needs undoing.
- **Worst case**, publish 0.1.0 by hand exactly like the candidates in step c, without
  `--tag next`. It loses provenance for that one version and changes nothing else.

## Verification

- Root gates after every commit.
- Step 1: `npm pack --dry-run` lists exactly the intended files.
- Step 2: the tarballs install and import from outside the repo by `require`, `import` and `tsc`.
- Step 4: the pack-and-skip logic run locally against the registry (skip correctly detects a
  version that exists, and reports a missing one as E404 on npm 10 and 11). actionlint was
  considered and left out for now.
- Step 5: `npm view` dist-tags after c and after h; provenance present on 0.1.0; a clean install
  works; the candidates are gone after i; the docs' install commands are true.

**All of it passed on 2026-09-15**: three packages at 0.1.0, `latest` on each, attestations on
all three, registry tarballs matching their published checksums, and `npm audit signatures`
verifying every signature. The candidates were unpublished the same evening, well inside npm's
72-hour window.

## ADHD recap

Four commits of mine, then one sitting of yours. (1) Make the packages publishable. (2) Prove the
tarballs work from outside the repo. (3) A changelog per package. (4) A workflow that **stages**
releases through trusted publishing, with no token. Then: you publish `0.1.0-rc.0` of all three by
hand (your manual publish, which creates the packages), set up trusted publishing as stage-only,
publish the GitHub release, approve the three staged 0.1.0s in the browser, and unpublish the
candidates - link and editor before core. Every later release: tag it, CI stages, you approve.
