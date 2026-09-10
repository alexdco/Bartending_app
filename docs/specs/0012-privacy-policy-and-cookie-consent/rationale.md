# 0012. Privacy policy and cookie consent — rationale

## Context

The app collects several categories of user data across web and mobile: Supabase account and auth data, pantry and favorites data, an anonymous guest session for users who never sign in, and prompts and pantry contents sent to Anthropic (AI, a large language model provider) for the AI generated drink idea feature. `AGENTS.md` names Sentry (error tracking) as the intended observability tool, but it is not yet installed anywhere in the codebase (no `@sentry/*` dependency in any workspace), so it collects nothing today. None of this is currently disclosed to users anywhere in the product, and there is no cookie or tracking notice on the web app.

The web app also plans a basic product analytics feature (scope feature 14, still planned) that will need a lawful basis to run non essential tracking. Building that feature first without a consent mechanism in place would mean retrofitting consent later, which is harder to get right than building the notice up front. App stores (Apple and Google) also require a reachable privacy policy link for apps that create accounts or collect data, and the mobile app already has account creation and deletion (spec 0008).

The chosen audience for now is US visitors, which allows a simpler notice style banner rather than the stricter EU/UK style opt in gate that blocks all non essential activity until accepted.

## Options considered

### Option 1: Static policy page + simple notice bar, US scoped, UI only (recommended)

A `/privacy` route in the web app rendering policy content from a local content file, a footer link, a mobile account screen link out, and a bottom notice bar that records acceptance in `localStorage`. No gating logic, no new database table, no cookie banner library.

**Pros**:
- Matches the current single region (US) audience and the current absence of non essential tracking; nothing is over built for a compliance regime that doesn't yet apply.
- No new infrastructure: reuses existing patterns already in the codebase (a static Next.js route, `localStorage` for guest style state, as already used for recently viewed recipes).
- Cheap to extend later: feature 14 (analytics) reads the same stored choice instead of building its own consent mechanism from scratch.

**Cons**:
- Not GDPR/EU compliant as built; if the app later serves EU/UK visitors, the notice must be redone as a blocking opt in gate before any non essential tracking runs.
- The policy is edited in place with no changelog, so a future reader can't see exactly what changed between two effective dates without checking git history.

### Option 2: Full opt in/opt out consent management, GDPR ready from day one

Build a granular consent system (per category: essential, analytics, marketing), block all non essential scripts until explicit acceptance, and store consent server side so it is available across devices for signed in users.

**Pros**:
- Ready for EU/UK traffic without a rebuild later.
- Server side storage means a signed in user's consent choice follows them across devices.

**Cons**:
- Solves a compliance problem the product doesn't have yet (US only audience, confirmed); this is speculative scope for a regulatory regime not yet in play.
- Requires new schema (a consent table, RLS policies) and a gating mechanism with nothing yet to gate, adding real build cost for zero current benefit.

### Option 3: Skip the consent banner, ship only the policy page

Publish the privacy policy and its links, but skip the cookie notice bar entirely, deferring it until analytics actually ships.

**Pros**:
- Least work; the policy page alone satisfies the app store and basic disclosure need.

**Cons**:
- Leaves nothing for feature 14 to build on, so that feature would need to design and build its own consent mechanism from scratch later, which is exactly the rework this feature is meant to prevent.
- A cookie/consent notice, even a non blocking one, is a reasonable baseline expectation for a modern web app and costs little to add now.

## Rationale

The product currently serves a US audience with no non essential third party tracking live (Sentry error tracking is treated as strictly necessary infrastructure, not a marketing or analytics cookie needing consent). Building the EU style blocking consent gate now (Option 2) would add real schema and gating work for a compliance scope the product doesn't have; it can be layered on later if the audience expands, without redoing the policy page itself. Skipping the banner entirely (Option 3) saves a small amount of work now but pushes the exact same design decision onto feature 14, at a point where it would compete with actual analytics implementation work instead of being simple scaffolding. Option 1 matches today's actual data flows, reuses existing patterns in the codebase (`localStorage` for guest state, a static Next.js route), and leaves an explicit seam (the stored consent choice) for feature 14 to build on.
