# 0039. Repo hygiene: one skills home, no debug captures, and a CI workflow

**Date**: 2026-10-12
**Status**: Proposed

## Summary

The project skills live in exactly one tracked place, `.claude/skills/`. The duplicate `.agents/skills/` folder is deleted and ignored, so it can't drift or come back. Debug captures leave the repo root and get an ignored `.debug/` folder. A GitHub Actions CI workflow (an automatic check that runs on GitHub on every push) runs lint, typecheck, and test on Node 24. A real `main` branch is created first so CI and pull requests have a base.

## Context

- **Duplicated skills.** The first commit added the 8 third party skills twice, in `.agents/skills/` and `.claude/skills/` (byte identical today). The 9 workflow skills exist only in `.claude/skills/`. `skills-lock.json` pins all 17 by source. On Windows, `core.symlinks` is `false`, so a git symlink checks out as a plain text file and can't keep two folders in step. Any update to one copy silently leaves the other stale, and the three `AGENTS.md` files link to `.agents/skills/`, the copy Claude Code does not load.
- **Workflow skills also exist per user.** The workflow skills are also installed in the engineer's `~/.claude/skills/`. Today the project copy of `develop` matches it, but the two can drift.
- **Root clutter.** Eight tracked debug captures (`.home.html`, `.search.html`, `.negroni.html`, `.noimg.html`, `.noimg2.html`, `.popular.html`, `.404.html`, `.sitemap.xml`) and an empty stray `--version/` folder (from a mistyped command) sit at the root. Nothing stops new captures from being committed.
- **No CI, no base branch.** `AGENTS.md` promises CI running lint, typecheck, and test on every push, but no `.github/` exists. No `main` branch exists locally or on GitHub (a dormant local only `master` sits at an early tooling commit, `4767c19`); the GitHub default branch is `feat/user-profile-and-nav-badge`. History is one straight line, and `7200f44` (tip of `feat/recipe-page-performance`) contains every commit. No test reads env vars, so CI needs no secrets. Node 20 (the current `engines` floor) reached end of life in April 2026.

## Requirements

**User stories**:
- As a developer, I want each skill to exist once so that updating it never leaves a stale twin.
- As a developer, I want debug captures kept out of git automatically so that the root stays clean.
- As a developer, I want every push checked by CI so that a broken lint, type, or test is caught before merge.

**Acceptance criteria**:
- **AC-1**: The 8 root captures are deleted from git and disk, and the empty `--version/` folder is gone.
- **AC-2**: A new file at `.debug/anything.html`, `/.anything.html`, or `/.anything.xml` does not show in `git status`.
- **AC-3**: `git ls-files .agents` returns nothing, and `.claude/skills/` holds a folder for every one of the 17 skills in `skills-lock.json`.
- **AC-4**: Creating `.agents/skills/x/SKILL.md` does not show in `git status`.
- **AC-5**: Every skill link in root `AGENTS.md`, `apps/web/AGENTS.md`, `apps/mobile/AGENTS.md`, and `supabase/AGENTS.md` points to an existing `.claude/skills/<name>/` folder (relative to that file), and root `AGENTS.md` names `.claude/skills/` as the single skills home. Existing specs under `docs/specs/` are out of scope for this check.
- **AC-6**: `main` exists on GitHub, starts at `7200f44` (or a descendant), and is the GitHub default branch; the dormant local `master` is deleted.
- **AC-7**: `.github/workflows/ci.yml` runs on every push to any branch and on every pull request into `main`; it installs with the frozen lockfile and runs `pnpm lint`, `pnpm typecheck`, and `pnpm test` on the Node version in `.nvmrc`, using no secrets; its first run on the build branch passes.
- **AC-8**: A failing lint, typecheck, or test makes the CI run fail (the run goes red; blocking merges on it is a follow up, see branch protection).
- **AC-9**: `.nvmrc` contains `24`, and root `package.json` `engines.node` is `>=22`.

## Options considered

### Option 1: `.claude/skills/` as the only home
Delete `.agents/skills/`, ignore `.agents/`, repoint the `AGENTS.md` links.
**Pros**: Claude Code loads it with no setup; it already holds all 17 skills; one copy to update.
**Cons**: Agents that only scan `.agents/skills/` (some non Claude tools) won't auto discover skills; they must follow the `AGENTS.md` links.

### Option 2: `.agents/skills/` as the only home
Move everything there, ignore `.claude/skills/`.
**Pros**: Tool neutral location.
**Cons**: Claude Code (the tool this project actually uses) sees nothing until each person copies the skills locally, which brings the duplication back on every machine.

### Option 3: Keep both, add a CI drift check
A script compares the shared 8 and fails CI on any difference.
**Pros**: Least disruptive; both tool conventions keep working.
**Cons**: Still two copies to edit on every update; the check only catches drift after someone already caused it.

## Decision

**Chosen option**: Option 1: `.claude/skills/` as the only home.

All 17 skills (workflow and third party) are tracked once, in `.claude/skills/`, pinned by `skills-lock.json`. `.agents/` is gitignored. Debug captures go to an ignored `.debug/` folder. CI is one GitHub Actions workflow running lint, typecheck, and test on Node 24, with `main` as the base branch.

## Rationale

Symlinks are off on Windows, so any two folder setup means two real copies; drift is guaranteed, and a check only reports it after the fact. Claude Code is the agent this project runs, and `.claude/skills/` is the only folder it loads without extra setup, and it already holds the full set. Keeping the workflow skills in the repo (not only per user) means teammates and cloud sessions get the exact workflow the project was built with. Ignoring `.agents/` makes the rule self enforcing: if a skills installer writes there again, git never sees it.

CI runs exactly what `AGENTS.md` promises and the pre commit hook already runs (lint, typecheck, test), so local and CI agree and no secrets are needed. Format check and build were left out by choice: the pre commit hook already formats staged files, and a web build would need public env vars at build time. Node 24 is the current Active LTS (as of this writing, verify) and Node 20 is end of life; `.nvmrc` keeps local and CI on one version. `main` is created at the tip because history is linear and unfinished features are already tracked as `in-progress` in the scope.

## Standard definition

**Canonical pattern**:
```text
.claude/skills/<skill-name>/SKILL.md   the one tracked copy of every project skill
skills-lock.json                       pins each skill's source and hash
.agents/                               gitignored, never committed
.debug/                                gitignored, where debug captures go
```
Installing or updating a skill: run the skills installer targeted at Claude Code, confirm the result landed in `.claude/skills/<name>/`, then commit that folder plus `skills-lock.json`. If the installer also writes `.agents/skills/`, leave it; git ignores it.

`.gitignore` additions:
```gitignore
# Agent skills: .claude/skills is the single tracked home (spec 0039)
.agents/

# Debug captures (spec 0039)
.debug/
/.*.html
/.*.xml
```

CI workflow shape (`.github/workflows/ci.yml`):
```yaml
name: CI
on:
  push:
  pull_request:
    branches: [main]
permissions:
  contents: read
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4        # version comes from package.json packageManager
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
```
Use the current major versions of these actions at build time; the shape above is the contract, the version tags are not. Leave pnpm's `version:` unset so it comes from `packageManager`; pin it explicitly only if `pnpm/action-setup` fails to read `pnpm@12.3.4` from there.

Verified assumptions (checked on 2026-10-12, so the build need not chase them): `turbo.json` makes `lint` and `typecheck` depend on `^build`, but no workspace package has a `build` script, so that is a no op; `packages/shared` exports raw `./src/*.ts`, so nothing needs building first; `next-env.d.ts` and `expo-env.d.ts` are tracked; `theme.generated.css` is tracked and only regenerated by `predev`/`prebuild`; `supabase/functions` is covered by vitest only, not `tsc`; root `pnpm test` is plain `vitest run` (not through turbo) and needs no env vars.

**Replaces**:
- Duplicate skill folders under `.agents/skills/`.
- `AGENTS.md` skill links pointing at `.agents/skills/`.
- Debug captures committed at the repo root.
- `engines.node >=20`.

**Enforcement**:
- `.gitignore` (`.agents/`, `.debug/`, root dot html and xml) makes duplicates and captures impossible to commit by accident.
- CI fails the push or PR on lint, type, or test errors.

**Rollout**: one build branch off the new `main`, landing every change at once.

**Exceptions**: existing specs in `docs/specs/` keep their `.agents/skills/` mentions; they are historical records and are not rewritten. A legit root file that matches `/.*.html` or `/.*.xml` would need a `!` negation line in `.gitignore`; none exists today.

**Value sourcing**:
| Action | Value | Source |
|---|---|---|
| CI Node setup | Node version | `.nvmrc` (`24`) |
| CI pnpm setup | pnpm version | root `package.json` `packageManager` (`pnpm@12.3.4`) |
| CI checks | commands | root `package.json` scripts `lint`, `typecheck`, `test` |
| CI PR trigger | base branch | `main`, created in build task 1 |
| Skills consolidation | expected skill list | `skills-lock.json` (17 entries) |
| Link repointing | link targets | `.claude/skills/<name>/` for each name already linked |

**Critical test scenarios**:
- Happy path: push the build branch; CI runs install, lint, typecheck, test and passes, verifies **AC-7**.
- Failure case: on a throwaway branch, add an unused variable or a failing assertion and push; CI fails, verifies **AC-8**.
- Guard: create `.agents/skills/x/SKILL.md`, `.debug/a.html`, and `/.b.html`; `git status` shows none of them, verifies **AC-2**, **AC-4**.

## Build plan

Tracer Bullet: prove the base branch and the CI pipe end to end first, then thicken with the cleanup.

1. **Manual, by you, before the build.** First land or set aside the uncommitted work on `feat/recipe-page-performance` (the `page.tsx` edit, `theme.generated.css`, the untracked specs and migration, `.gitattributes`) so it isn't tangled with this feature. Then create `main` at `7200f44` and push it: `git branch main 7200f44` then `git push -u origin main` (safe from any checked out branch, dirty or not). In GitHub, Settings, General, Default branch, switch to `main`, and retarget any open PRs from the old default to `main`. Delete the dormant local `master` (`git branch -D master`). Satisfies **AC-6**.
2. **Clean checkout dry run.** In a clean checkout of `main` (for example `git worktree add ../bartendingapp-ci main`), run `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm test`. This is what CI will see, unlike your working tree. Watch `apps/web/src/app/theme.generated.test.ts` in particular: the committed `theme.generated.css` differs from the working copy. Any failure here is fixed on its owning feature branch (or a small fix branch off `main`) before CI goes in, never by weakening a check. Remove the worktree afterwards. Satisfies **AC-7**.
3. Branch `feat/repo-hygiene` from `main`. Add `.nvmrc` (`24`), set `engines.node` to `>=22`, add `.github/workflows/ci.yml` per the shape above. Push and confirm the first run is green; if something fails on CI only, fix the cause, don't weaken the checks. Satisfies **AC-7**, **AC-9**.
4. Prove failure: push a deliberately failing commit to a throwaway branch (every branch triggers CI), confirm the run goes red, delete the branch. Satisfies **AC-8**.
5. Delete the 8 captures (`git rm`) and remove the empty `--version/` folder from disk (git never tracked it); add the `.debug/` and root dot html and xml lines to `.gitignore`. Satisfies **AC-1**, **AC-2**.
6. Before deleting, confirm every skill in `skills-lock.json` has a `.claude/skills/<name>/` folder, the shared 8 match their twins (`diff -r .agents/skills/<name> .claude/skills/<name>`), and `skills-lock.json`, `.mcp.json`, and `.claude/settings*.json` hold no per agent path that points into `.agents/`. Then `git rm -r .agents/skills`, add `.agents/` to `.gitignore`, and drop the now redundant `.agents` line from `.prettierignore`. Satisfies **AC-3**, **AC-4**.
7. Repoint the skill links in root `AGENTS.md`, `apps/web/AGENTS.md`, `apps/mobile/AGENTS.md`, and `supabase/AGENTS.md` (as `../.claude/skills/...`) to `.claude/skills/`, add the one line skills home rule, and update the Node line to `>= 22`. Leave existing specs untouched. These files are owned by `/sync`, so run `/sync` right after the build lands. Satisfies **AC-5**.

## Consequences

**Positive**:
- One copy per skill; updates can't drift.
- Root stays clean, and captures have an obvious home.
- Every push is checked; `main` gives PRs and `/develop`'s git flow a real base.

**Negative / tradeoffs**:
- Agents that only scan `.agents/skills/` lose auto discovery; they rely on the `AGENTS.md` links.
- The workflow skills now exist in the repo and in `~/.claude/skills/`. Which copy Claude Code picks when names collide is up to Claude Code, not this spec; keep them in step, or remove the user level copies if they cause confusion.
- CI does not check formatting or the web build; those rely on the pre commit hook and Vercel.
- CI runs `pnpm test` but the pre commit hook does not, so a commit can pass locally and still go red on CI.
- Node floor rises to 22, so anyone on Node 20 must upgrade.

**Neutral**:
- `main` starts with features still `in-progress` in the scope; the scope, not the branch, tracks what is verified.
- New feature branches come off `main` from now on, not off the previous feature branch.

## Follow-up

- [ ] Feature 2 has no CI line, but feature 48's Done when says "feature 2's CI workflow exists". Recommend `/sync` (or `/scope`) adds a ticked CI line to feature 2 once the workflow is green.
- [ ] Consider adding `format:check` and a web `build` job to CI later, if formatting drift or build only failures show up.
- [ ] Consider branch protection on `main` (require the CI check to pass) once CI is stable.
