# 0013. Basic product analytics

**Date**: 2026-09-07
**Status**: In Progress

## Summary

This decision adds PostHog (a product analytics tool) to both the web and mobile apps so the team can see whether users complete the app's core actions: searching for a recipe, adding a pantry item, and generating a drink idea. Events fire from the same per app hooks and page clients that already perform these actions, tagged with the guest or signed in identity that already exists. No dashboard building is required; seeing the events land in PostHog is enough to call this done.

## Requirements

**User stories**:
- As a product owner, I want to see when a user searches, adds a pantry item, or generates a drink idea, so I can tell whether the core loop is working, for guests and signed in users alike.
- As a web visitor, I want tracking to only start after I have accepted the existing cookie notice, so the notice's wording stays true.
- As an engineer, I want the same three events and property shapes fired from both apps, so a report built from PostHog data means the same thing on either platform.

**Acceptance criteria** (the contract):
- **AC-1**: A `search_performed` event fires once for each distinct, non empty search query the user settles on (the debounced query value changes and its first page of results loads), carrying the query string and the first page's result count, attributed to the current guest or signed in identity. It does not fire for the empty default query, for pagination/infinite scroll fetches, or for a window refocus refetch of the same query.
- **AC-2**: A `pantry_item_added` event fires exactly once per successful pantry add mutation on both apps (from the mutation's success path, not its settle path, so a failed or rolled back mutation never fires it), carrying the ingredient id, attributed to the current identity.
- **AC-3**: A `drink_idea_generated` event fires once per successful, non empty first page load of the pantry matched drink ideas list (tagged `source: "matched"`, with a `match_count` property), and once per successful AI generation (tagged `source: "ai"`). A failed or quota rejected AI generation attempt, or a matched list that loads with zero results, does not fire this event.
- **AC-4**: On web, no event of any kind is sent to PostHog until the visitor has accepted the existing cookie notice (spec 0012); PostHog is not initialized before that acceptance is recorded, and initializing it is not the responsibility of the notice bar component itself (see Feature design, consent store).
- **AC-5**: On both web and mobile, the client safely no ops instead of sending real events when no PostHog project key is configured, or when PostHog's own initialization fails for any reason (so local development, CI, and a misconfigured deploy never send test events to a real project and never break the app).
- **AC-6**: The analytics identity is established via `posthog.identify(session.user.id)` once per app root at initial session resolution (and again if the id changes), so the same guest or signed in id already used for pantry and favorites row ownership consistently identifies that user's events. This spec does not attempt to merge a guest's pre sign in history into a different id on a second device sign in (spec 0008 itself does not merge that device's guest data; analytics does not invent a merge the product does not do). A `person_profiles: "identified_only"` PostHog configuration still creates a real person for a guest once `identify` is called, so guest activity remains visible without requiring the merge.
- **AC-7**: PostHog's automatic capture of page views, clicks, and session data is disabled; only the three explicit events in this spec, plus the `identify` call, are ever sent.
- **AC-8**: A network failure sending an event, or a failure during PostHog client initialization, never surfaces to the user or blocks the action it describes (a failed search, pantry add, or drink idea generation event is dropped silently; the underlying user facing action already succeeded before the track call fires).
- **AC-9**: The event names, property shapes (as typed, non optional input objects), and the guest identity strategy are defined once in `packages/shared` as pure, SDK free builder functions plus a shared unit test asserting each event's exact property key set, imported by both apps' own hook and page client files, so the two apps cannot drift on what an event means or what data it carries.

## Decision

**Chosen option**: Option 1: PostHog

Add PostHog as the analytics provider for both apps, using `posthog-js` on web and `posthog-react-native` on mobile, with autocapture disabled and only the three explicit events in this spec ever sent.

**Implementation skills**: `posthog-instrumentation` (`posthog/posthog-for-claude`, `.agents/skills/posthog-instrumentation/`)

## Feature design

**Data model sketch**:
No new database table. All state lives in the PostHog project itself (events, persons, the identify/alias graph) and in existing client side storage:
- Web: reuses the existing `cookieConsent` `localStorage` key from spec 0012 as the gate; adds no new key.
- Mobile: no consent storage in this revision (AC-5 covers gating via config absence only, not a user choice); see Follow-up.
- Both apps: the analytics distinct id is the existing Supabase `session.user.id` (anonymous or real), already produced by the auth flow (spec 0008); no new identifier is stored anywhere.

**State transitions**:
No merge state machine (the alias approach was dropped per Rationale). Just one transition per app instance: `no identity established` → `posthog.identify(session.user.id)` called once when the session first resolves (from a loading state to a real session, guest or signed in) at the app root, and again only if `session.user.id` changes value from what was last identified. Sign in via spec 0008's in place account link keeps the same id, so this fires at most once in the common case.

**API surface**:
No new backend endpoints. All calls are client SDK calls to the PostHog service.

| Action | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| Initialize PostHog client | SDK call (`posthog.init`) | project API key, host, `autocapture: false`, `person_profiles: "identified_only"` | initialized client or no op stub | none (public write key) | missing key, or `init` throwing for any reason → no op stub, not an error, per AC-5, AC-8 |
| Establish identity | SDK call (`posthog.identify`) | `session.user.id` | fire and forget | none | failure → the id simply is not stitched yet; retried on the next session change; not user visible |
| Track an event | SDK call (`posthog.capture`) | event name, properties, distinct id | fire and forget | none (public write key) | network failure → dropped silently, per AC-8 |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| `search_performed` event | `query` property | The debounced query string already held by each app's existing search page client, the same value it passes into `use-recipe-search.ts` |
| `search_performed` event | `result_count` property | The first page's result array length from the existing search query's first page (not the flattened total across pages) |
| `search_performed` event | "distinct, non empty query settled" trigger | A `useRef` in the search page client holding the last query the event fired for; the event fires when the debounced query differs from that ref, is non empty, and the query's first page has settled successfully; the ref updates immediately so pagination fetches and refocus refetches of the same query do not re-fire it |
| `search_performed` / `pantry_item_added` / `drink_idea_generated` event | distinct id | `session.user.id`, already established via the one time `posthog.identify` call described in State transitions; the track call itself passes no distinct id, PostHog attaches the currently identified one |
| `pantry_item_added` event | `ingredient_id` property | The `ingredientId` mutation variable already passed into `useAddPantryItem`'s `mutationFn` (`use-pantry-mutations.ts`), read in a new `onSuccess` callback added to that mutation (not `onSettled`, which also fires on failure) |
| `drink_idea_generated` event, matched path | `source: "matched"` and `match_count` | A `useEffect` in the drink ideas page client keyed on the first page's identity from `useDrinkIdeas` (a `useInfiniteQuery`, which has no query level success callback in this project's TanStack Query version); fires only when that first page has loaded and contains at least one match, using its length as `match_count` |
| `drink_idea_generated` event, AI path | `source: "ai"` | The existing `use-generate-drink-idea.ts` hook's mutation `onSuccess` callback, which only runs when the Edge Function returns a generated recipe |
| `drink_idea_generated` event | `pantry_size` property | The pantry item count the `generate-drink-idea` Edge Function actually used server side (spec 0007), returned as a new field on its response payload, rather than a client side pantry read that could be stale relative to what the server saw; for the matched path, the client's own current pantry count from `use-pantry.ts` is accurate since matching already reads the client's live pantry state |
| PostHog init (web) | Whether to initialize now | A new shared consent store in `apps/web/src/consent/consent-storage.ts` (see Key invariants) that both the notice bar and the analytics module read and subscribe to, backed by the existing `cookieConsent` `localStorage` key |
| PostHog init (both apps) | Project API key and host | `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` (web), `EXPO_PUBLIC_POSTHOG_KEY` / `EXPO_PUBLIC_POSTHOG_HOST` (mobile); both apps point at the same single PostHog project so events from both platforms are directly comparable, not two separate projects |
| Identity establishment | The user id to identify | `session.user.id` from each app's existing `use-session.ts` (web) / mobile session hook, read once from the app's root `Providers` (web) / `_layout` (mobile) component, not from every component that calls `useSession()`, so it fires once per app instance regardless of how many components use the hook |

**Key invariants**:
- No event of any kind reaches PostHog on web before `cookieConsent` is accepted. This is enforced by a small consent store (`apps/web/src/consent/consent-storage.ts` grows a subscriber list; `acceptCookieConsent()` notifies subscribers instead of only setting local state), which the analytics module subscribes to instead of the notice bar component reaching into the analytics module directly, so a leaf UI component stays decoupled from the SDK.
- `posthog.identify(session.user.id)` fires at most once per resolved id per app instance; re-renders and re-mounted components that also call `useSession()` do not re-identify, because identification happens once from the app root, not from every `useSession()` call site.
- A tracking call, and PostHog client initialization itself, never throw into the caller; every call site wraps the shared builder + SDK call, and `posthog.init` is wrapped the same way, so an SDK error at either point cannot fail the underlying user action or crash app startup.
- The three event names and their property keys are defined exactly once, in `packages/shared`, as strict (non optional field) input types with a unit test asserting each event's exact property key set; both apps import the same builder functions and types, so a property cannot be silently added on one platform and not the other.

**Security model**:
The distinct id is the same opaque Supabase user id already used for pantry/favorites row ownership, not an email or name. The `query` property on `search_performed` is free text the user typed and is sent to PostHog as is; while it is not expected to routinely contain PII, a search box accepts arbitrary input, so the updated `/privacy` page (Build plan step 9) must name search query text as a collected value, not just "search activity" in the abstract. The PostHog client key is a public, write only, rate limited key, matching the trust model already applied to the Supabase anon key; it is not a secret and needs no secrets manager. Autocapture (AC-7) is explicitly disabled so no click coordinates, page content, or session recording data is ever collected, keeping the actual data collected inside what the updated `/privacy` page will disclose.

**Configuration required**:
- `NEXT_PUBLIC_POSTHOG_KEY`: the PostHog project API key (public, write only), same PostHog project as mobile's. Next.js inlines `NEXT_PUBLIC_*` variables at build time, so this must be set in Vercel's build environment before deploying, not only at runtime, or the built app ships permanently keyless
- `NEXT_PUBLIC_POSTHOG_HOST`: the PostHog ingestion host for the web app (region dependent, e.g. US or EU cloud)
- `EXPO_PUBLIC_POSTHOG_KEY`: the PostHog project API key (public, write only), the same project as web's, so events from both platforms are directly comparable
- `EXPO_PUBLIC_POSTHOG_HOST`: the PostHog ingestion host for the mobile app

**Critical test scenarios**:
- Happy path: a guest searches for "margarita" (settling after typing), adds a pantry item, then loads a non empty matched drink ideas list; three events land in PostHog (`search_performed`, `pantry_item_added`, `drink_idea_generated{source: "matched"}`) all tagged to the same identified distinct id, verifies **AC-1**, **AC-2**, **AC-3**, **AC-6**, **AC-9**
- Failure case: the pantry add mutation fails and rolls back (existing optimistic update behavior in `use-pantry-mutations.ts`); no `pantry_item_added` event fires, verifies **AC-2**, **AC-8**
- No re-fire: a user scrolls to load a second page of search results or drink ideas for the same query/pantry state; no additional `search_performed` or `drink_idea_generated` event fires beyond the first page's, verifies **AC-1**, **AC-3**
- Consent: a first time web visitor loads any page before accepting the cookie notice; no events fire and the PostHog client is not yet initialized; after clicking Accept, the next search fires `search_performed`, verifies **AC-4**
- Dev safety: both apps started with no PostHog key set complete a search without error and without any network call to PostHog, verifies **AC-5**, **AC-8**

## Build plan

1. Add `packages/shared/src/analytics.ts` exporting strict, non optional input types and pure, SDK free event builder functions (`buildSearchPerformedEvent`, `buildPantryItemAddedEvent`, `buildDrinkIdeaGeneratedEvent`) returning `{ name, properties }`, the shared event name constants, and a unit test asserting each event's exact property key set, satisfies **AC-9**
2. Add each app's own analytics client module (`apps/web/src/analytics/posthog-client.ts`, `apps/mobile/src/analytics/posthog-client.ts`) that wraps `posthog.init` in a try/catch (`autocapture: false`, `person_profiles: "identified_only"`), no ops when its env var key is unset or `init` throws, and exposes a `track(name, properties)` wrapper that never throws, satisfies **AC-5**, **AC-7**, **AC-8**
3. Add a small consent store to `apps/web/src/consent/consent-storage.ts` (a subscriber list; `acceptCookieConsent()` notifies subscribers, not just local `useState`) and wire web's analytics module to subscribe to it, initializing PostHog only once consent is accepted, satisfies **AC-4**
4. Add a `posthog.identify(session.user.id)` call, fired once per resolved id from each app's root (`apps/web/src/app/providers.tsx`, `apps/mobile/src/app/_layout.tsx`), not from `use-session.ts` itself (which is called from multiple components and would re-fire per instance), satisfies **AC-6**
5. Add an `onSuccess` callback to `useAddPantryItem` in both apps' `use-pantry-mutations.ts` (not `onSettled`, which also fires on failure) that calls the shared builder + `track()`, satisfies **AC-2**
6. Add the `search_performed` trigger to each app's search page client: a ref tracking the last query fired for, comparing against the debounced query on each settled, non empty, non paginated first page fetch from `use-recipe-search.ts`, satisfies **AC-1**
7. Add the `drink_idea_generated{source: "matched"}` trigger to each app's drink ideas page client: a `useEffect` keyed on `useDrinkIdeas`'s first page identity, firing only when that page is non empty, using its length as `match_count`, satisfies **AC-3**
8. Add the `pantry_size` field to the `generate-drink-idea` Edge Function's response payload (the pantry count it already reads server side) and wire `drink_idea_generated{source: "ai"}` into `use-generate-drink-idea.ts`'s existing `onSuccess`, reading `pantry_size` from that response, satisfies **AC-3**
9. Update spec 0012's web consent notice copy and the `/privacy` page to name PostHog analytics as an actual, present tense data category, including that search query text is collected (per Security model above), replacing 0012's forward looking placeholder; satisfies the cross spec Follow-up item 0012 already recorded
10. Cross platform check: confirm both apps fire the same three event names and property shapes (verified by the shared unit test from step 1) for the same user action, and that `identify` fires once per app instance on both

## Consequences

**Positive**:
- The team can finally see, per guest or signed in user, whether the core loop (search, pantry, drink idea) is actually used, closing the "we ship features blind" gap that motivated this feature.
- The identity model already built for auth (spec 0008) is reused rather than duplicated, so there is no second, competing notion of "who is this user" to keep in sync.
- Spec 0012's Follow-up item about wiring the consent notice to something real is resolved as part of this build.

**Negative / tradeoffs**:
- A fourth external vendor's SDK now runs in both apps, plus two more environment variables to configure and keep set in every environment (local, staging, prod), including at Vercel build time for web.
- Mobile ships with no gating consent mechanism (AC-5 covers dev safety only, not a user facing choice); this is a known gap the team is accepting for this revision, not an oversight.
- The `drink_idea_generated` event only captures successful generations; a user who repeatedly hits the AI quota limit or a failed generation leaves no analytics trace of that friction in this revision.
- Web event counts are undercounted by an unknown amount from ad blockers and tracking prevention that block direct calls to PostHog's domain; this spec does not add a reverse proxy to work around it (see Follow-up).
- A second device sign in does not merge that device's guest history into the signed in identity, matching spec 0008's own no merge stance for that path, so a user's total activity across devices before their first sign in on each device is not fully unified in PostHog either.

**Neutral**:
- No new database table or migration; all new state is either in the PostHog service or in existing client storage, so this feature ships without a `supabase/migrations` change.

## Follow-up

- [ ] Add a mobile facing consent notice or first launch disclosure equivalent to web's cookie notice, so mobile tracking is gated by an explicit user choice rather than by config presence alone; revisit whether this changes AC-5's gating rule.
- [ ] Consider a `drink_idea_generation_failed` event (quota exceeded, AI error) in a later revision, once there is a concrete question that needs that friction data; deliberately excluded from this "basic" pass per the Stage (a) conversation.
- [ ] When recipe favoriting (deferred by spec 0009) is designed and built, add its own `recipe_favorited` event using the same shared builder pattern this spec establishes; do not bolt it onto this spec after the fact.
- [ ] The official PostHog MCP server (`github.com/posthog/mcp`) was found during discovery and declined for now; connecting it later would let the agent query real PostHog dashboards, events, and feature flags directly when debugging or extending this feature.
- [ ] If web event volume looks suspiciously low after launch, investigate a Next.js reverse proxy for PostHog ingestion (routing through the app's own domain) to counter ad blocker and tracking prevention undercounting; deliberately deferred in this revision as added infrastructure for a "basic" pass.
