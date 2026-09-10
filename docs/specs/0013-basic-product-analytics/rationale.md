# 0013. Basic product analytics — rationale

## Context

The app has no analytics today. The team cannot see whether a guest or signed in user ever searches, builds a pantry, or generates a drink idea, so there is no way to know if the core loop (spec 0004, spec 0005, spec 0006, spec 0007) is actually being used. Scope feature 14 names four candidate events, but "recipe favorited" has no underlying feature yet (spec 0009 explicitly dropped favoriting from its own signal set since it isn't built), so this spec's forces are narrower than the scope row implies.

The stack spans two runtimes that cannot share React hooks (`packages/shared` has no React dependency, per `AGENTS.md`'s rule that shared holds only non UI logic), so any event tracking code that lives in a hook is necessarily duplicated per app; the real risk is the two apps drifting on event names or properties, not on where the code lives.

Both apps already have a working identity model: an anonymous Supabase session for guests, upgraded to a real account on sign in (spec 0008). Analytics needs to reuse that identity rather than invent a second one, and needs to keep a guest's pre sign in activity attached to the same person after they sign in, or the funnel data undercounts everyone who ever signs in.

Spec 0012 (privacy policy and cookie consent) shipped a non blocking cookie notice on web that stores an accept choice in `localStorage`, but does not yet gate anything, since no non essential tracking existed at the time. Its own Follow-up section names this feature as the one that must wire the notice to something real and update the `/privacy` page's data categories.

## Options considered

### Option 1: PostHog (product analytics platform, hosted)

A managed analytics service with one JavaScript SDK family (`posthog-js` for web, `posthog-react-native` for mobile), a real dashboard, and built in `identify`/`alias` support for merging a guest identity into a signed in one.

**Pros**:
- One vendor covers both platforms with mature, actively maintained SDKs.
- `identify`, and `person_profiles: "identified_only"`, are first class documented features that give a real, attributable person for both guest and signed in identities without custom engineering, satisfying this spec's AC-6.
- Free tier comfortably covers an early stage product's volume; self hostable later if that ever becomes a requirement.

**Cons**:
- A new third party vendor and a new environment variable per app, plus a network call on every core action (mitigated by AC-8's fire and forget rule).
- Autocapture defaults must be explicitly turned off (AC-7) or the tool collects more than this spec intends to disclose in the privacy policy.

### Option 2: Supabase native (a Postgres table plus a small Edge Function or direct insert)

Log each event as a row in a new Postgres table, using the backend already in place; view the data via SQL or a tool like Grafana pointed at the same database.

**Pros**:
- No new vendor; reuses the existing Supabase project, RLS model, and Sentry observability already wired into Edge Functions.
- Full control over retention and schema; the data never leaves the project's own infrastructure.

**Cons**:
- No dashboard, funnel view, or identify/alias merge out of the box; the team would need to build and maintain that tooling itself, which the scope explicitly frames as "basic" analytics, not a data platform project.
- Every insert competes with the app's real read/write traffic on the same database rather than a purpose built ingestion pipeline.

### Option 3: Plausible or Simple Analytics (privacy first, web only page view analytics)

A lightweight, cookieless page view analytics tool aimed at simple traffic counting.

**Pros**:
- Minimal data collection, no cookie banner legally required in some jurisdictions, simple to add to a Next.js site.

**Cons**:
- No mobile SDK, so mobile would need an entirely separate solution, defeating this spec's goal of one consistent approach across both apps.
- No custom event properties in the tier this app would use, so it cannot carry the query string, ingredient id, or drink idea source this spec's acceptance criteria require.

## Rationale

PostHog is the only option of the three that satisfies AC-6 (a real, attributable person for both guest and signed in identities) without custom engineering: `identify` plus `person_profiles: "identified_only"` is a documented, first party feature of its SDKs, while the Supabase native option (Option 2) would require building person/identity resolution from scratch on top of a plain events table. Option 3 is ruled out outright by the platform requirement: this app is web and mobile, and Plausible/Simple Analytics only covers web.

The Supabase native option is the most boring and lowest vendor count choice, and would be the right call if this were purely an internal audit log. But the scope's own done when condition asks for events "visible in an analytics dashboard," which Option 2 does not provide without extra build work; PostHog provides it as the product's core purpose. The operational cost of a fourth party service is small: PostHog's client key is designed to be public (write only, rate limited), the same trust model the project already applies to the Supabase anon key, so it introduces no new secret handling burden.

An initial draft of this spec planned to merge a guest's pre sign in history into their signed in identity using PostHog's `alias` call, triggered on Supabase's `SIGNED_IN` auth event. Closer reading of spec 0008 showed this does not fit: signing in on the same device links the account in place (`updateUser`), so the Supabase user id never changes and there is nothing to merge; the only path where the id does change is signing in on a second device, and spec 0008 deliberately does not merge that device's guest pantry into the account. An `alias` call on that path would quietly re-join, in analytics, data the product itself keeps separate, and `use-session.ts` (a hook called from multiple components) has no safe single-fire home for it besides. Identify-only, fired once per app root, gives the common case full continuity with none of that risk.

## References

**Project sources**:
- `AGENTS.md`, the rule that non UI logic lives once in `packages/shared`, imported by both apps, never duplicated per app (basis for the shared builder function split in this spec)
- Spec 0008 (sign in and cross device sync), the anonymous to real session upgrade this spec's identity merge hooks into
- Spec 0012 (privacy policy and cookie consent), the existing consent storage this spec gates PostHog initialization on
- The installed `posthog-instrumentation` community skill (`.agents/skills/posthog-instrumentation/`), confirming the `posthog.capture`/`identify`/`isFeatureEnabled` call conventions used in this spec's design

**Practices & standards**:
- Fire and forget client side analytics (never block or fail the user facing action on a tracking failure)
- Identify once at session establishment, with `person_profiles: "identified_only"`, so an anonymous user still resolves to a real, attributable person without inventing an identity merge the product itself does not perform
