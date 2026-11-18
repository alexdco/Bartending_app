# 0058. Automated accessibility checks with Playwright and axe in CI

**Date**: 2026-11-15
**Status**: Proposed

## Summary

Every push now gets an automatic accessibility check on the key web pages. A second CI job (an automatic check GitHub runs on every push) builds the web app against the live Supabase project, opens six public pages plus the pantry, favorites, and shopping list pages as an anonymous visitor sees them (empty) in a real Chromium browser with Playwright (a browser test runner), and scans each one with axe (an engine that finds WCAG accessibility problems). It checks desktop and phone, light and dark, plus Japanese and Hindi on the home and recipe pages. The job goes red on any serious or critical problem, and every existing one gets fixed before the job turns on. Mobile gets no accessibility lint for now, because no maintained React Native plugin works with ESLint 9. The reason and a revisit trigger are recorded here.

## Requirements

**User stories**:
- As a developer, I want every push scanned for serious accessibility problems so that a regression (a missing label, a contrast drop) is caught before merge, not by a user with a screen reader.
- As a developer, I want a failure to name the rule, the element, and the page so that I can fix it without rerunning anything.
- As a developer, I want a judged false positive excluded narrowly, with a written reason, so that one exception never hides real problems.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: `pnpm --filter web test:a11y` runs Playwright Test with `@axe-core/playwright` in Chromium against `next start` and scans every page in the fixture list: in `en`, the home page, search for `gin`, the Negroni recipe, the `/popular` index, the learn article "What Is a Jigger?", the quiz "Bar Tools Quiz", and the pantry, favorites, and shopping list pages in their empty state (as the run's fresh anonymous user, who owns no rows); in `ja` and `hi`, the home page and the Negroni recipe. That is 14 fixture entries, counting AC-3's overlay entry.
- **AC-2**: Every fixture page is scanned in four variants: desktop light, desktop dark, phone light, phone dark. Desktop is Playwright's `Desktop Chrome` device, phone is `Pixel 7`, and the theme comes from emulated `prefers-color-scheme`.
- **AC-3**: The `en` home page is also scanned with the age gate and the consent banner showing, in all four variants. Every other scan runs with both dismissed (their storage keys seeded before load) and first asserts that neither overlay is visible.
- **AC-4**: Scans run only the WCAG 2.0, 2.1, and 2.2 level A and AA rules (axe tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`). A scan fails when any violation with impact `serious` or `critical` remains after exceptions. `moderate` and `minor` violations never fail a scan, but they are listed in the test output and attached to the report.
- **AC-5**: A failing scan's message lists, per blocking violation: the rule id, the impact, axe's help text, the CSS selector of every failing element, the help URL, and the page path and variant.
- **AC-6**: A page that does not render fails as "page did not render", never as a clean scan. That covers a navigation error, a missing response, a final HTTP status other than 200, a final path different from the fixture path (a redirect to another page), or the page's ready locator not visible within the timeout. For pantry, favorites, and shopping list the ready locator is the empty state title, so a page still on its loading spinner, or showing its load error state, fails as "page did not render". The message names the path, the final path, and the status.
- **AC-7**: Exceptions live in one typed list, `apps/web/e2e/a11y-exceptions.ts`. Each entry names a rule id, a CSS selector, a fixture page id, and a reason. An entry excludes only the violation nodes that match all three, so no rule is ever turned off for every page or every element. A vitest test fails if any reason is blank or two entries are identical.
- **AC-8**: A full local or CI run creates exactly one anonymous Supabase user. A setup step signs in once and saves the browser state, and every scan, variant, and retry reuses that state.
- **AC-9**: `.github/workflows/ci.yml` (from spec 0039) gains a second job, `a11y`, with the same triggers as the existing job (every push, and every pull request into `main`), running in parallel to it. It installs Chromium only, builds web with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from GitHub Actions repository variables, runs `test:a11y` with 1 retry, and uploads the Playwright HTML report and test results as artifacts when the job fails.
- **AC-10**: If either Supabase variable is missing, the `a11y` job fails in its first step, with a message naming the missing variable, before installing anything.
- **AC-11**: The first `a11y` run on the build branch passes with the exceptions list empty: every serious and critical violation on the fixture pages has been fixed, not excepted.
- **AC-12**: A deliberately introduced serious violation (for example, removing the accessible name from an icon button on the home page) turns the `a11y` job red.
- **AC-13**: Retries are 1 in CI and 0 locally, and a trace is recorded on the first retry.
- **AC-14**: `pnpm test` (vitest) does not pick up any Playwright file. `test-preferences.json` names `playwright` as the `e2eTool`. Playwright's output folders and saved browser state are gitignored, and `pnpm lint` and `pnpm typecheck` pass with the new files (the `e2e/` sources are linted and typechecked; the generated report folders are in ESLint's `globalIgnores`).
- **AC-15**: The mobile decision is recorded: no React Native accessibility lint is adopted, with the evidence and the revisit trigger in this spec's `## Decision`, and a one line note in `apps/mobile/AGENTS.md` (written by `/sync`). `apps/mobile/eslint.config.js` is unchanged.

## Decision

**Chosen option**: Option 1: Playwright Test plus axe, built and served inside CI against the live project

The web app gets a Playwright Test suite in `apps/web/e2e/` that scans a pinned set of public pages, plus the anonymous empty states of pantry, favorites, and shopping list, with `@axe-core/playwright`, run locally with one command and in CI as its own parallel job that fails on serious or critical WCAG A and AA violations. Mobile adopts no accessibility lint for now.

**Mobile decision (no lint, with a revisit trigger)**: checked 2026-11-15. `eslint-plugin-react-native-a11y` 3.5.1 (released November 2024) declares ESLint 3 to 8 as peers and documents only the legacy config format. `apps/mobile` runs ESLint 9 with `eslint-config-expo/flat`. The other React Native accessibility plugins (`eslint-plugin-react-native-accessibility`, `eslint-plugin-rn-a11y`) are older still or also stop at ESLint 8. `eslint-config-expo` and `@react-native/eslint-plugin` ship no accessibility rules. Loading an unmaintained plugin by hand behind a peer override would put a component nobody upstream fixes into every mobile lint run. Mobile stays guarded by the manual pass from spec 0038, plus the 44 by 44 hit targets and labeled components in the shared component set. **Revisit when** any React Native accessibility ESLint plugin publishes a release that declares ESLint 9 (or later) support or ships a flat config.

**Implementation skills**: `playwright-best-practices` (`currents-dev/playwright-best-practices-skill`, `.agents/skills/playwright-best-practices/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`) · `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

No database change. The feature adds three typed, immutable TypeScript modules in `apps/web/e2e/`:

| Module | Shape | Notes |
|---|---|---|
| `a11y-pages.ts` | `readonly A11yPage[]`, each `{ id: string; locale: Locale; path: string; overlays: "shown" \| "dismissed"; ready?: A11yReady }`, where `A11yReady` is `{ readonly kind: "css"; readonly value: string } \| { readonly kind: "text"; readonly value: string }` and proves the real content rendered. Default `{ kind: "css", value: "h1" }`; set it per page only where `h1` is not enough: the first result link on search (`css`), and the empty state title on pantry, favorites, and shopping list (`text`, matched with `page.locator("main").getByText(value, { exact: true })`, scoped to `main` so a hidden live region or a future duplicate outside the page body can never match; a `text` value is only used on `en` entries (a future entry in another locale imports its own locale's messages file); values imported from `apps/web/messages/en.json`: `pantry.emptyTitle` "Your pantry is empty", `favorites.emptyTitle` "No favorites yet", `shoppingList.emptyTitle` "Your shopping list is empty") | `id` is unique (e.g. `home-en`, `recipe-ja`, `home-en-overlays`, `pantry-en`, `favorites-en`, `shopping-list-en`). The three empty state pages use `localizedPath("en", "/pantry")`, `"/favorites"`, and `"/shopping-list"`. Their `h1` renders before the data loads, which is why they need the `text` signal. None of the three redirects an anonymous visitor (each `page.tsx` renders its client component directly), so AC-6's path check holds. Paths for the recipe, learn article, and quiz are built with the shared `buildRecipeSlugPath`, `buildLearnArticleSlugPath`, `buildQuizSlugPath`, and `localizedPath` from pinned ids and names (below), so they always match what the app links to. |
| `a11y-exceptions.ts` | `readonly A11yException[]`, each `{ ruleId: string; selector: string; pageId: A11yPage["id"]; reason: string }` | Starts empty (AC-11). `pageId` is typed to the fixture ids, so a typo fails typecheck. |
| `a11y-policy.ts` | pure functions: `nodeSelector(target)` flattens axe's `node.target` (which can nest arrays for shadow DOM and iframes) and joins it with a space; `partitionViolations(violations, exceptions, pageId)` returns `{ blocking, nonBlocking, excepted }`, matching an exception only on exact string equality of rule id, `nodeSelector`, and page id; `formatViolations(blocking, path, variant)` returns the failure message string | No I/O and no runtime import from `@playwright/test` (axe types via `import type` only), so it gets a vitest test beside it (`a11y-policy.test.ts`). The vitest tests import `a11y-pages.ts`, which uses `@bartendingapp/shared`; that already resolves under vitest. |

Pinned fixture values (read from the live catalog on 2026-11-15):

| Fixture | Id | Name used for the slug |
|---|---|---|
| Negroni recipe | `b7e87815-6316-4b9e-988c-6b3d4dfb44fe` | en `Negroni`, ja `ネグローニ`, hi `नेग्रोनी` (base name `Negroni`) |
| Learn article, category `tools` | `d7389446-31f0-48fd-bc9d-e2c7501bed50` | `What Is a Jigger?` |
| Quiz | `1e13ad7b-3338-4989-aaf6-8723bba798d0` | `Bar Tools Quiz` |
| Search | none | query `gin` (`/en/search?q=gin`) |

`/popular` is scanned in place of a `/popular/<region>` page, because no recipe has a region tagged on the live project yet (the region list is empty). See `## Follow-up`.

**State transitions**: none.

**API surface** (commands, config, and the CI job; this feature adds no HTTP endpoints):

| Surface | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `pnpm --filter web test:a11y` (`playwright test`) | script in `apps/web/package.json` | env `CI` (sets retries 1 and the server command), Supabase env from `.env.local` locally | pass or fail per scan, `playwright-report/`, `test-results/` | none | blocking violation (AC-4, AC-5), page did not render (AC-6) |
| `pnpm test:a11y` | root `package.json` script, `pnpm --filter web test:a11y` | same | same | none | same |
| `apps/web/playwright.config.ts` | config | `testDir: "e2e"`; `webServer` always runs `pnpm exec next start -p 3100` (it never builds; locally you run `pnpm --filter web build` first, and a missing build fails with Next's own message), `timeout: 120_000`, `reuseExistingServer: !process.env.CI`, `baseURL: http://localhost:3100`; projects `setup` (`testMatch: "**/*.setup.ts"`, `retries: 0` so a retry can never mint a second user) and `desktop-light`, `desktop-dark`, `phone-light`, `phone-dark` (`testMatch: "**/*.spec.ts"`, each spreading its device and setting `colorScheme`, `reducedMotion: "reduce"` so fade ins don't skew contrast, and `storageState` from setup, all depending on `setup`); `retries: process.env.CI ? 1 : 0`; `trace: "on-first-retry"`; workers left at Playwright's default; reporters `list` and `html` (`open: "never"`) | n/a | n/a | server not up within 120 s fails the run |
| `e2e/auth.setup.ts` | setup project | none | `e2e/.auth/state.json` (the anonymous session, which `@supabase/ssr` keeps in `sb-<ref>-auth-token` cookies, possibly split into `.0`/`.1`; no overlay keys) | creates one anonymous user by loading `/en` (Providers calls `ensureAnonymousSession`; it seeds nothing) | no cookie whose name starts with `sb-` and contains `auth-token` within 30 s: fails "anonymous session not created" (check that anonymous sign ins are on). A saved session that stops working mid run (so the app would mint a second user) shows up in the scans as "page did not render" on the three empty state pages, because their session gated queries never settle into the empty state title |
| `e2e/a11y.spec.ts` | one test per fixture page, run in each of the four variant projects | `A11yPage`, `a11y-exceptions` | axe results attached as JSON per scan, a console summary of non blocking findings | reuses the saved state | AC-4, AC-5, AC-6 |
| `ci.yml` job `a11y` | GitHub Actions job | repository variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | job status; artifacts `playwright-report` and `test-results` (14 day retention) on failure | Actions variables, no secrets | missing variable (AC-10), test failure |

Per scan flow in `a11y.spec.ts`:
1. Unless the page is `overlays: "shown"`, add an init script that sets `localStorage[AGE_CONFIRMED_KEY] = AGE_GATE_VERSION` (both from `@bartendingapp/shared`) and `localStorage[COOKIE_CONSENT_KEY]` to `{ "accepted": true, "acceptedAt": <fixed ISO string> }`. Export `COOKIE_CONSENT_KEY` from `apps/web/src/consent/consent-storage.ts` (today a private `STORAGE_KEY`) so the test never copies the string.
2. `page.goto(path)`. A thrown navigation error, a `null` response, a final status other than 200, or a final `URL.pathname` (from `page.url()`, decoded) different from the fixture path fails with "page did not render" (AC-6). The query string is ignored in the path check.
3. Wait for the page's `ready` locator (default `h1`; a `text` signal uses `getByText` with `exact: true` inside `main`) to be visible (15 s, the same for every page; a transient Supabase error that outlasts TanStack Query's own retries is caught by the job's 1 CI retry, not by a longer timeout); a timeout fails as "page did not render". Then wait for `networkidle` for up to 5 s as a best effort: catch its timeout and carry on, never fail on it.
4. For a dismissed page, assert the age gate (`getByRole("dialog")`) and the consent banner (`getByRole("button", { name: <en.json consent.accept> })`, imported from `apps/web/messages/en.json`) are not visible. For the overlay page, assert both are visible. The overlay entry is `en` only, so the English text is enough, and no source change is needed for the banner.
5. `new AxeBuilder({ page }).withTags([...AC-4 tags]).analyze()`.
6. `partitionViolations`, attach the full results JSON, log non blocking findings, and fail with `formatViolations` if `blocking` is non empty.

CI job shape (added to the `ci.yml` that spec 0039 creates, which also creates `.nvmrc`; use the same current action majors that file uses). Build with `pnpm --filter web build` directly, never `turbo run build`: turbo's strict env mode would strip the `NEXT_PUBLIC_*` variables unless they were declared in `turbo.json`.

```yaml
  a11y:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    env:
      NEXT_PUBLIC_SUPABASE_URL: ${{ vars.NEXT_PUBLIC_SUPABASE_URL }}
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ vars.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
    steps:
      - name: Require Supabase variables
        run: |
          for v in NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY; do
            if [ -z "${!v}" ]; then echo "::error::Missing repository variable $v (Settings, Secrets and variables, Actions, Variables)"; exit 1; fi
          done
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter web exec playwright install --with-deps chromium
      - run: pnpm --filter web build
      - run: pnpm --filter web test:a11y
      - if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: |
            apps/web/playwright-report
            apps/web/test-results
          retention-days: 14
```

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Build web in CI | Supabase URL and publishable key | Actions repository variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the same public values as `apps/web/.env.local`, project `ctuzjhhpnkkhooneporu`) |
| Build web in CI | PostHog key and host | unset on purpose; `posthog-client.ts` skips init without them, so no analytics events from CI |
| Build web in CI | site URL for canonicals | unset; `resolveSiteUrl` falls back to the local URL, which axe never checks |
| Run locally | Supabase env | `apps/web/.env.local` (loaded by Next) |
| Scan list | page paths | `a11y-pages.ts`, built from the pinned ids and names above via the shared slug builders |
| Scan variants | viewport, user agent, color scheme | Playwright `devices["Desktop Chrome"]`, `devices["Pixel 7"]`, and `colorScheme: "light" \| "dark"` per project |
| Overlay dismissal | age gate key and value | `AGE_CONFIRMED_KEY`, `AGE_GATE_VERSION` from `@bartendingapp/shared` |
| Overlay dismissal | consent key | `COOKIE_CONSENT_KEY`, newly exported from `apps/web/src/consent/consent-storage.ts` |
| Anonymous session | cookie and localStorage | created once by `auth.setup.ts` through the app's own `ensureAnonymousSession`, saved to `e2e/.auth/state.json` |
| Pass or fail | rule set | the AC-4 tag list, a constant in `a11y-policy.ts` |
| Pass or fail | which impacts block | `serious`, `critical`, a constant in `a11y-policy.ts` |
| Pass or fail | excluded nodes | `a11y-exceptions.ts`, matched on rule id, `node.target` joined with a space as the selector, and page id |
| Failure message | rule, impact, help, selectors, help URL | axe result fields `id`, `impact`, `help`, `nodes[].target` (through `nodeSelector`), `helpUrl` |
| Failure message | variant | `testInfo.project.name` (`desktop-light` and so on); the test title is the page `id` |
| Render check | ready signal | `A11yPage.ready`, default `{ kind: "css", value: "h1" }` |
| Render check | empty state title (pantry, favorites, shopping list) | `pantry.emptyTitle`, `favorites.emptyTitle`, `shoppingList.emptyTitle` in `apps/web/messages/en.json` |
| Empty state pages | empty lists | the run's fresh anonymous user from `auth.setup.ts`, who owns no pantry, favorite, or shopping list rows. Pantry and shopping list already wait for the session (`enabled: session !== null` in `use-pantry.ts`, `use-shopping-list.ts`); `useFavoriteRecipes` in `use-favorites.ts` gains the same wait in this feature, so the favorites empty state is rendered for that user, never from a query sent before the session exists |
| Overlay check | banner locator name | `consent.accept` in `apps/web/messages/en.json` |
| Retries | count | `process.env.CI` (GitHub Actions sets `CI=true`) |

**Key invariants**:
- No axe rule is disabled globally. The only way to skip a finding is an `a11y-exceptions.ts` entry naming one rule, one selector, and one page, with a reason.
- A page that fails to render can never count as a pass.
- One run creates one anonymous user. Nothing in the suite signs in again or clears the saved session. This relies on a run finishing well inside the 1 hour access token life, so no test triggers a token refresh, and parallel refreshes of one shared refresh token can't make the app mint a new user. The 20 minute job timeout keeps CI inside that. A local run left paused for an hour may create a second user, which is accepted.
- Contrast fixes change the token values in `packages/shared/src/tokens.ts` (then regenerate `theme.generated.css`), never an inline color or a one off class, so web and mobile stay on one palette (`docs/design/design.md`).
- Fixture paths are built with the same shared slug functions the app uses, never typed out by hand.
- The suite only reads public pages and the anonymous user's own empty pantry, favorites, and shopping list. It never adds, removes, or types anything, and writes nothing to the database beyond the one anonymous sign in. That keeps the three lists empty for every scan and retry in the run.

**Security model**:
- The job uses only the public Supabase URL and publishable (anon) key, which already ship to every browser. They're stored as Actions variables, not secrets, and no service role key or test account is involved.
- The anonymous user gets the same row level security as any visitor. The suite visits no admin, service, or account page.
- `e2e/.auth/state.json` holds a short lived anonymous session token and is gitignored.
- Workflows from pull requests opened by forks may not receive repository variables. The job then fails at AC-10's guard rather than leaking anything. This is a solo repo today, so that's accepted.

**Configuration required**:
- `NEXT_PUBLIC_SUPABASE_URL` (GitHub Actions repository variable): the BartendingAppWeb project URL, for the CI build.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (GitHub Actions repository variable): the BartendingAppWeb publishable key, for the CI build.
- New dev dependencies in `apps/web`: `@playwright/test`, `@axe-core/playwright` (latest stable at build time).
- `.gitignore`: `apps/web/playwright-report/`, `apps/web/test-results/`, `apps/web/e2e/.auth/`.
- `apps/web/eslint.config.mjs`: add `playwright-report/**` and `test-results/**` to `globalIgnores` (generated JavaScript would otherwise be linted).
- Prerequisite: anonymous sign ins stay enabled on BartendingAppWeb (the web app needs them anyway).

**Critical test scenarios** (each maps to an acceptance criterion in ## Requirements):
- Happy path: a local `pnpm test:a11y` scans all 14 fixture entries in all four variants (56 scans) and passes with an empty exceptions list, verifies **AC-1**, **AC-2**, **AC-3**, **AC-11**.
- Regression: remove the accessible name from a home page icon button; the run fails and the message names `button-name` (or the matching rule), `critical` or `serious`, the selector, `/en`, and the variant, verifies **AC-4**, **AC-5**, **AC-12**.
- Non blocking: a `moderate` finding (if any exists, or a temporary one such as a missing landmark) is logged and attached but the scan passes, verifies **AC-4**.
- Render failure: temporarily change the Negroni fixture id to a random uuid; the recipe scans fail as "page did not render", status 404, verifies **AC-6**.
- Exceptions: `a11y-policy.test.ts` shows a violation is excluded only when rule id, selector, and page id all match, and that blocking impacts are exactly serious and critical; `a11y-exceptions.test.ts` fails on a blank reason or a duplicate, verifies **AC-4**, **AC-7**.
- Empty state not loaded: temporarily point the pantry fixture's ready text at a string that never appears (or block the pantry request with `page.route`); the scan fails as "page did not render" instead of scanning the spinner, verifies **AC-1**, **AC-6**.
- Redirect: a fixture path whose final URL differs (for example a hidden duplicate redirecting) fails as "page did not render", naming both paths, verifies **AC-6**.
- One user: note the time, run locally, then count `auth.users where is_anonymous and created_at >= <run start>` (read only SQL or the dashboard); the count is 1, give or take any real visitor in that window, verifies **AC-8**.
- CI: push the build branch, see `a11y` run in parallel to the existing job and pass; on a throwaway branch with the regression above, see it go red with the report artifact uploaded; with a variable temporarily renamed, see it fail at the first step, verifies **AC-9**, **AC-10**, **AC-12**, **AC-13**.

## Build plan

Tracer Bullet: first prove the whole pipe (Playwright, the shared session, one scan, the CI job) on one page, then thicken page by page. Each page joins the list only together with the fixes that make it pass, so every push stays green.

1. **Gate.** Spec 0039's build is done: `main` exists, and `.github/workflows/ci.yml` runs green. If it isn't, stop and build feature 48 first. Satisfies **AC-9**.
2. **Thin thread, local.** Add `@playwright/test` and `@axe-core/playwright` to `apps/web`, `playwright.config.ts` with the `setup` project and one `desktop-light` project, `auth.setup.ts`, `a11y-policy.ts` (with `a11y-policy.test.ts`), an empty `a11y-exceptions.ts`, `a11y-pages.ts` holding only `home-en`, and `a11y.spec.ts`. Export `COOKIE_CONSENT_KEY`. Add the `test:a11y` scripts, the `.gitignore` lines and ESLint `globalIgnores`, and set `e2eTool: "playwright"` in `test-preferences.json`. Run `pnpm --filter web build`, then `test:a11y`, fix whatever serious or critical findings the home page has, and get it green. Satisfies **AC-1** (home only), **AC-4**, **AC-5**, **AC-8**, **AC-14**.
3. **Thin thread, CI.** In GitHub, add the two repository variables (manual, by you). Add the `a11y` job to `ci.yml` per the shape above, with the variable guard. Push, confirm it runs in parallel and passes. Prove red: on a throwaway branch, break the home page's accessible name, confirm the job fails and uploads the report, then delete the branch. Satisfies **AC-9**, **AC-10**, **AC-12**, **AC-13**.
4. **Variants.** Add `desktop-dark`, `phone-light`, and `phone-dark`, plus the `home-en-overlays` entry with the overlay visibility assertions. Fix the findings, most likely dark mode contrast in `tokens.ts` and the phone nav. Satisfies **AC-2**, **AC-3**.
5. **Thicken, page by page.** Add search, recipe, popular, learn article, and quiz in `en`, then pantry, favorites, and shopping list with their `text` ready signals (first add `enabled: session !== null` to `useFavoriteRecipes`, using `useSession` the same way `usePantry` does, with a one line comment pointing at it), then home and recipe in `ja` and `hi`, each with its fixes in the same commit. Add the render guard checks and confirm the bad id scenario. Satisfies **AC-1**, **AC-6**, **AC-11**.
6. **Exceptions guard.** Add `a11y-exceptions.test.ts` (no blank reason, no duplicates). Leave the list empty. Satisfies **AC-7**, **AC-11**.
7. **Record and hand off.** Confirm `apps/mobile/eslint.config.js` is untouched, then run `/sync` so `apps/web/AGENTS.md` gets the `test:a11y` command and the exceptions rule, root `AGENTS.md` gets the Playwright line and the new skill, and `apps/mobile/AGENTS.md` gets the no lint note with its revisit trigger. Satisfies **AC-15**.

## Consequences

**Positive**:
- Serious accessibility regressions on the most visited pages fail CI instead of shipping.
- Dark mode, phone layout, and two non Latin locales are covered, where contrast and lang problems actually hide.
- Each failure names the rule, element, page, and variant, so most fixes don't need a rerun.
- The project gains a working browser test stack, which later end to end tests can reuse.

**Negative / tradeoffs**:
- CI now depends on the live BartendingAppWeb project. If Supabase is down or slow, the `a11y` job goes red for reasons unrelated to accessibility (1 retry softens this, it doesn't remove it).
- Each run adds one anonymous user to `auth.users`, a few a day. The existing idle anonymous account cleanup job (spec 0017) removes them like any idle visitor, so they only linger until its next pass.
- A catalog edit that hides or removes the Negroni, the jigger article, or the bar tools quiz breaks the suite until the fixture is updated.
- The CI build downloads script fonts from Google Fonts (`fetch-script-fonts.mjs`, `next/font`). A fonts outage fails the job for reasons unrelated to accessibility, but skipping the fonts would make the ja and hi scans unrealistic.
- The job adds several minutes per push (Chromium install, a full `next build`, 56 scans), though it runs in parallel to the fast job.
- axe finds roughly the machine checkable part of WCAG. Keyboard flow, focus order, and screen reader wording still need the manual pass.
- Exceptions have no staleness check, so an entry whose element has gone away just sits there until someone removes it.
- Mobile still has no automated accessibility guard.

**Neutral**:
- Favorites now waits for the session before it queries, like pantry and shopping list. Real visitors no longer send one favorites call before their anonymous session exists.
- The fix pass may change shared color tokens, which also changes the mobile app's look slightly.
- `test-preferences.json` now names an e2e tool. `/test` will consider Playwright for browser level tests.
- Merges are not blocked on the job until branch protection is turned on (spec 0039's follow up).

## Follow-up

- [ ] Once regions are tagged on the live project, add one `/popular/<region>` page to the fixture list.
- [ ] When branch protection lands (spec 0039 follow up), require the `a11y` check as well.
- [ ] Revisit a mobile accessibility lint when a React Native plugin declares ESLint 9 or flat config support (see `## Decision`).
- [ ] `playwright-best-practices` was installed into `.agents/skills/`. Spec 0039 makes `.claude/skills/` the only skills home, so move it there when that lands, add it to `skills-lock.json`, and list it in root `AGENTS.md` `## Agent skills` (via `/sync`).
- [ ] `apps/mobile` pins `eslint-config-expo` ~57 while 58 is current; worth a bump on its own (outside this feature).
- [ ] Consider extending the scan to filled states (pantry, favorites, shopping list with rows, which needs seeded data) and the account page for a signed in user, once the current set is stable.
