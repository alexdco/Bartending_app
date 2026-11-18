# 0058. Automated accessibility checks: rationale

## Context

Spec 0038 fixed a round of accessibility problems by hand (labels, a skip link, focus styles, mobile row labels) and added `eslint-plugin-jsx-a11y` on web. Lint only sees JSX source. It cannot see computed color contrast, the final rendered markup of server components, dark mode, or what a page looks like on a phone. Spec 0038 deferred a browser based check because the project had no browser test stack and no CI. Spec 0039 (feature 48) now designs that CI, though it isn't built yet.

The web app is a Next.js App Router app whose public pages render on the server from live Supabase data. The browser cannot intercept those calls, so any realistic scan needs a real data source. Every page also sits under an age gate and a consent banner the first time it loads, and every fresh browser creates an anonymous Supabase user. The app ships nine locales, including scripts (Japanese, Hindi) whose fonts and longer strings change layout and contrast, and it has light and dark themes driven by `prefers-color-scheme`.

Spec 0039 chose a CI with no secrets and no web build, to stay fast and simple. Any accessibility job has to live beside that, not undo it. On mobile, the project runs ESLint 9 with Expo's flat config, and whether a maintained React Native accessibility lint fits there was an open question from spec 0038.

Without an automated check, accessibility regresses quietly. A token change that drops contrast, or a new icon button with no name, ships unnoticed until a user hits it.

## Options considered

### Option 1: Playwright plus axe, built and served in CI against the live project (chosen)

A second CI job builds web with the public Supabase values as repository variables, starts it, and scans pinned pages with `@axe-core/playwright`.

**Pros**:
- Scans the real production markup with real data, so contrast, landmarks, and SSR output are what users get.
- Self contained in one workflow, with no waiting on another system.
- The public URL and key are already public, so no real secret enters CI.

**Cons**:
- CI depends on the live project's uptime.
- Each run creates an anonymous user.
- Adds a full `next build` and a browser install to every push.

### Option 2: Playwright plus axe against the Vercel preview deployment

Trigger on GitHub's deployment status event and scan the preview URL Vercel already builds.

**Pros**:
- No build in CI. It scans exactly what is deployed.
- No Supabase values needed in GitHub at all.

**Cons**:
- The check waits on Vercel and only runs when a deployment succeeds, so a failed deploy silently skips it.
- Vercel Deployment Protection needs a bypass secret, which reintroduces a real secret.
- Ties the check to the hosting provider's event model, which is harder to run locally the same way.

### Option 3: Playwright plus axe against a local Supabase stack in CI

`supabase start`, apply migrations, load a seed fixture, then build and scan.

**Pros**:
- Fully isolated: no live project dependency and no anonymous users on production.
- Deterministic data.

**Cons**:
- Much slower (Docker images, every migration on each run).
- Needs a seed fixture that must track the catalog and every schema change, which is a new maintenance burden the project doesn't have today.
- Seed data can hide problems that real content (long names, missing images) would show.

### Option 4: Lint only, no browser scan

Rely on `eslint-plugin-jsx-a11y` (already on) and add nothing.

**Pros**:
- Zero new tooling or CI time.

**Cons**:
- Cannot catch contrast, dark mode, rendered landmarks, or locale specific problems, which are the classes of bug left after spec 0038.
- Doesn't meet feature 61's done when.

## Rationale

The problems left after spec 0038 are the ones only a rendered page shows: computed contrast in both themes, the mobile nav, and markup from server components fed real data. That rules out Option 4. Among the browser options, the deciding force is that the public pages need real Supabase data and the project has no seed fixture. Option 3 would invent a second catalog to maintain. Option 2 depends on Vercel's deploy events and brings back a real secret. Option 1 keeps everything in the one workflow spec 0039 creates, uses only values that already ship to every browser, and runs the same way on a laptop. Spec 0039's "no secrets" principle holds, because the variables are public and are not GitHub secrets. Its "no web build" choice holds for the fast job, which is untouched, while the slower build lives only in the parallel `a11y` job.

Playwright Test over Vitest browser mode, because the target is real server rendered pages, not components in isolation, and `@axe-core/playwright` is built for it. Playwright also gives webServer startup, projects for each viewport and theme, retries, and trace artifacts out of the box. Failing on serious and critical only matches feature 61's done when and keeps axe's noisier rules from blocking merges. Limiting to WCAG A and AA tags matches the design system's WCAG AA target and leaves out axe's best practice rules, which aren't WCAG failures. Pinned fixture pages built with the shared slug functions make failures comparable across runs, and a missing page fails loudly. Scanning the overlays once and dismissing them elsewhere checks the first thing every visitor sees without letting the modal hide every page. One saved anonymous session per run keeps the live project footprint to one user. Fixing every existing finding before the job turns on (instead of a baseline) means the check starts from a clean, honest state and no known issue gets parked indefinitely.

For mobile, the 2026-11-15 check found no React Native accessibility plugin that supports ESLint 9 or flat config. The best known one stopped at ESLint 8 two years ago. Loading it by hand behind a peer override would trade a modest set of rules for a fragile dependency in every mobile lint run with no upstream maintainer. Recording the decision with a concrete revisit trigger meets the done when without that risk. The runner up was loading it by hand with a smoke test, which is reasonable if mobile accessibility regressions start to show up before a maintained plugin appears.

**Update 2026-11-15 (anonymous empty states).** Pantry, favorites, and shopping list joined the fixture list in their empty state. The run's anonymous session already opens them, so they add no secret, no test account, and no extra user, and empty states are a common place for a missing label or a low contrast muted line. They are client rendered, so their `h1` shows before the data loads; the ready signal is the empty state title instead, which also makes a load error fail as "page did not render" rather than pass as a scan of the error card. Filled states and the account page stay a follow up, because they need seeded rows and a signed in user. The rest of the decision (variants, fail rule, live project backend, triggers, mobile no lint) was reviewed in the same pass and kept.
