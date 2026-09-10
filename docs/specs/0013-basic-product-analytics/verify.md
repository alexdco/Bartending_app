# Verify: Basic product analytics · spec 0013 · updated 2026-09-07
_Steps derived from spec 0013 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [x] On web with a PostHog key/host set, load `/` before accepting the cookie notice, search "margarita" → no network call to PostHog's ingestion host; the client is not yet initialized (confirmed via a `track()` debug trace showing `initialized: false`, and zero `i.posthog.com` requests) → AC-4
- [x] Click Accept on the cookie notice, then search "margarita"/"mojito" → `track()` fires with the correct `search_performed` name/properties (`query`, `result_count` matching the rendered result count) and `initialized: true`; `posthog.capture()` is called without throwing → AC-1, AC-4 (event build/trigger logic proven; see Blocked note below for network delivery)
- [ ] With the same debounced query unchanged, scroll to trigger a second page fetch → no additional `search_performed` event fires → AC-1 (blocked: no session, see below)
- [ ] Refocus the browser tab (window refocus refetch) with the same query → no additional `search_performed` event fires → AC-1
- [x] Clear the search box back to empty → confirmed no `search_performed` trigger fires for the empty query (code path returns early on `!debouncedQuery`, exercised in the Playwright run) → AC-1
- [ ] Add a pantry ingredient → exactly one `pantry_item_added` event fires with `ingredient_id` matching the added ingredient → AC-2 (blocked, see below)
- [ ] Simulate a failed/rolled back pantry add (e.g. offline) → no `pantry_item_added` event fires → AC-2, AC-8
- [ ] Load `/drink-ideas` with a pantry that has at least one non empty match → one `drink_idea_generated{source: "matched"}` event fires with `match_count` equal to the first page's length and `pantry_size` equal to the current pantry count → AC-3 (blocked, see below)
- [ ] Load `/drink-ideas` with an empty pantry (no matches) → no `drink_idea_generated` event fires for the matched path → AC-3
- [ ] Trigger "Generate a new idea" successfully → one `drink_idea_generated{source: "ai"}` event fires with `pantry_size` equal to the value the Edge Function returned → AC-3
- [ ] Trigger AI generation while at the daily quota limit (rejected) → no `drink_idea_generated{source: "ai"}` event fires → AC-3, AC-8
- [ ] Inspect the same three flows on mobile with a real PostHog key/host set → same three event names/property shapes fire, tagged to the same distinct id pattern → AC-1, AC-2, AC-3, AC-9 (blocked: no mobile runtime/simulator in this environment)
- [x] With no PostHog key set on either app (default dev config), complete a search on web without error and without any network call to PostHog → AC-5, AC-8 (pantry/drink-ideas legs blocked, see below)
- [ ] Sign in from a guest session on web (in place account link) → confirm `session.user.id` is unchanged and `identify` is not re-called with a different id → AC-6 (blocked, see below)
- [x] Open browser network inspector across the search flow with a PostHog key set → confirmed zero autocapture events (`$pageview`, `$autocapture`, clicks); only `/flags/` (remote config) requests and the app's own explicit `track()` call were observed → AC-7
- [x] Read the updated `/privacy` page → confirms PostHog analytics is disclosed as an actual (not planned) data category, naming that search query text is collected → Security model, spec 0012 Follow-up

## Commands

- [x] `pnpm test` → the `analytics.test.ts` unit test asserts the exact property key set for each of the three events; 30/30 tests pass repo wide → AC-9
- [x] `pnpm --filter web typecheck` && `pnpm --filter mobile typecheck` → both apps compile clean against the shared, strict (non optional) event property types → AC-9
- [x] `pnpm --filter web build` → succeeds; confirmed `NEXT_PUBLIC_POSTHOG_KEY` inlines into the built client bundle (`grep`'d a temporary test key into `.next/static/chunks/*.js` after a build) → Configuration required

## Blocked (this environment, not this code)

- This environment's live Supabase project (`BartendingAppWeb`) has anonymous sign-ins disabled (`AuthApiError: Anonymous sign-ins are disabled`, HTTP 422/403 on `ensureAnonymousSession`), a pre-existing configuration gap unrelated to this feature. `session.user.id` never resolves, so: `identify()` never fires (AC-6 unexercisable), the pantry page never holds a session to add against (AC-2 unexercisable), and `/drink-ideas` spins forever waiting on a session the `match_recipes_to_pantry` function requires (AC-3's matched and AI paths unexercisable). Needed to unblock: enable anonymous sign-ins on the Supabase Auth settings for this project, or a real user session/credentials.
- Real network delivery of a `capture()` call to PostHog's servers could not be directly observed via Playwright: posthog-js's bot detection (confirmed via `debug: true`, which logged "Refusing to render web experiment since the viewer is a likely bot") suppresses transmission for automated browsers (`navigator.webdriver`). This is a known SDK behavior when testing with headless automation, not a defect in the integration; the `track()` call itself was traced end to end (correct event name, correct properties, correct `initialized` gating) up to the point the SDK's own bot filter intervenes. Needed to unblock: a real PostHog project + a manual (non automated) browser session, or a non headless verification pass by the engineer.
- No mobile simulator/emulator available in this environment, so the mobile legs of every UI step above are unexercised. Needed to unblock: run on a machine with Expo Go / a simulator.

## Acceptance-criteria coverage

- AC-1 (search_performed triggers/exclusions) … partially met: trigger logic and empty-query exclusion confirmed live; pagination/refocus exclusions not exercised (blocked)
- AC-2 (pantry_item_added on success only) … blocked (no session in this environment)
- AC-3 (drink_idea_generated matched + AI paths) … blocked (no session in this environment)
- AC-4 (web consent gate) … met: confirmed live, cited evidence (initialized: false before accept, true after; zero PostHog requests pre accept)
- AC-5 (no op without a key or on init failure) … met for web search; pantry/drink-ideas legs blocked
- AC-6 (identify once per resolved id) … blocked (no session in this environment)
- AC-7 (autocapture disabled) … met: confirmed live, zero autocapture requests observed
- AC-8 (fire and forget, never surfaces to the user) … partially met: init/track wrapped in try/catch confirmed by code + typecheck; the failure scenarios themselves (rolled back pantry add, quota rejected AI) are blocked
- AC-9 (shared event names/property shapes, exact key sets) … met: `pnpm test` passes (30/30, including the new exact-key-set assertions) and both apps typecheck against the shared strict types; live cross platform inspection blocked (no mobile runtime)
