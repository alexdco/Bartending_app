# 0012. Privacy policy and cookie consent

**Date**: 2026-09-07
**Status**: In Progress

## Summary

This decision adds a real privacy policy page to the web app plus a simple cookie notice banner, and a link to that policy from the mobile app's account screen. It covers what the app actually collects today (account data, pantry data, guest session data, and AI generation data sent to Anthropic), plus a forward looking note about error logging once Sentry is installed. The banner does not block anything yet, since there is no third party analytics running; it exists so the upcoming analytics feature (scope feature 14) has a consent choice to read.

## Requirements

**User stories**:
- As a visitor to the web app, I want to read a clear privacy policy so I understand what data is collected and how to request it be deleted.
- As a first time web visitor, I want to see a short notice about cookies/local storage use so I'm informed before continuing to use the site.
- As a mobile app user, I want to find the privacy policy from my account screen, consistent with what app stores expect.

**Acceptance criteria** (the contract):
- **AC-1**: A `/privacy` page exists on the web app and accurately names the real data categories collected today: account/auth data (Supabase), pantry and favorites data, anonymous guest session data, and data sent to Anthropic for AI generated drink ideas. It also names error and diagnostic logging (which may include IP address and device/browser information) as a category the app intends to collect once its observability tooling (Sentry) is installed, worded so it does not claim collection that isn't happening yet.
- **AC-2**: The privacy policy page states a contact point for privacy questions (a placeholder email) and points users to the existing in app account deletion flow (spec 0008) for data deletion requests.
- **AC-3**: The privacy policy page shows an "Effective date" near the top.
- **AC-4**: The privacy policy page is linked from a site wide footer, newly added to the web app's root layout, appearing on every page.
- **AC-5**: The mobile app's account screen has a "Privacy Policy" row that opens the web `/privacy` URL via the app's existing `ExternalLink` component (`apps/mobile/src/components/external-link.tsx`), which already opens links in an in app browser on native and a new tab on web.
- **AC-6**: A cookie/consent notice bar appears at the bottom of the web app for a visitor who has not yet made a choice, reading "We use local storage to remember your pantry and preferences. See our Privacy Policy." with an "Accept" button and a link to `/privacy`.
- **AC-7**: Once a visitor accepts the notice, their choice persists (via `localStorage`, key `cookieConsent`, matching the existing camelCase key convention used by `recently-viewed-storage.ts`) and the notice does not reappear on later visits in the same browser. The banner renders nothing until a `useEffect` reads the stored choice on mount, avoiding a server/client hydration mismatch.
- **AC-8**: The consent notice is a leaf client component (`"use client"`) rendered from within the existing client side `Providers` tree, not the root layout itself; the root layout and every page's server rendering, metadata, and crawlability (search, recipe detail, popular, sitemap) stay untouched.
- **AC-9**: The notice does not gate or block any current functionality, since no non essential third party tracking exists yet; it only records the visitor's choice for a future feature to read.

## Decision

**Chosen option**: Option 1: Static policy page + simple notice bar, US scoped, UI only

Build a static `/privacy` page disclosing the real data flows, linked from the web footer and the mobile account screen, plus a non blocking cookie notice bar on web that stores the visitor's acceptance in `localStorage` for a later feature to read.

## Feature design

**Data model sketch**:
No new database table. Consent state is a single client side value in `localStorage` under the key `cookieConsent`, shaped as `{ accepted: true, acceptedAt: <ISO timestamp> }`. No entity, no server persistence, no relation to the `user_preferences` table from spec 0008 (that table is signed in only; this must also work for guests).

**State transitions**:
Consent has two states: `undecided` (no value in `localStorage`, banner shows) → `accepted` (value present, banner hidden). There is no reject/decline state in this revision, matching the "Accept + link, no gating" decision; declining is out of scope since nothing needs to be blocked yet.

**API surface**:
No new API endpoints or server actions. This is a static content page plus a client side component; no data crosses the network beyond loading the page itself.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Render `/privacy` | Effective date shown at top of page | A constant in `apps/web/src/app/privacy/page.tsx`, hardcoded to `2026-09-07` at build time, updated by hand when the policy text changes |
| Render `/privacy` | Contact email for privacy questions | A placeholder constant (`privacy@<production-domain>`) in `apps/web/src/app/privacy/page.tsx`, to be replaced with the real address before shipping (flagged in Follow-up) |
| Render `/privacy` | Reference to account deletion | A static link/instruction pointing to the existing account screen's delete account action (spec 0008), no dynamic value needed |
| Render notice bar | Whether to show the bar | Presence/absence of the `cookieConsent` key in `localStorage`, read via `useEffect` on mount (never during initial render, to avoid a hydration mismatch) |
| Mobile account screen | Privacy policy URL | A new exported constant (e.g. `PRIVACY_POLICY_URL`) in `packages/shared/src`, built from the same production site origin already used by `apps/web/src/lib/site-url.ts`'s `absoluteUrl` helper, so both apps import one source instead of mobile depending on a web only file |

**Key invariants**:
- The notice bar never reappears in the same browser once `cookieConsent` is set, until the visitor clears site data.
- The `/privacy` page never requires authentication or an anonymous session; it must render for a visitor with no session at all.
- The policy's stated data categories must stay accurate to what the app actually does; when a new data flow is added (e.g. feature 14's analytics), the page's content is expected to be revised as part of that feature, not silently left stale.

**Security model**:
Fully public content, no auth, no PII collected by this feature itself (the notice only stores a boolean and a timestamp, both non identifying, client side only). No compliance regime is triggered by this feature; it exists to disclose compliance relevant behavior belonging to other features (Supabase auth, Anthropic calls, Sentry).

**Configuration required**:
None. No new environment variables or credentials; this reuses the existing `NEXT_PUBLIC_SITE_URL` config from spec 0011.

**Critical test scenarios**:
- Happy path: a first time visitor loads any web page, sees the notice bar, clicks Accept, the bar disappears and does not return on a later visit, verifies **AC-6**, **AC-7**.
- Failure case: `localStorage` is unavailable or throws (private browsing, blocked storage) — the banner still renders correctly and simply shows again on next load rather than crashing the page, verifies **AC-7**.
- Auth/permission: a signed out guest with no session at all can load `/privacy` and see full content with no redirect or error, verifies **AC-1**.

## Build plan

1. Add a shared `PRIVACY_POLICY_URL` (or equivalent) constant to `packages/shared/src`, built from the same production site origin `apps/web/src/lib/site-url.ts` already uses, so both apps import one source, satisfies **AC-5**
2. Build the `/privacy` page (`apps/web/src/app/privacy/page.tsx`, a Server Component with `export const metadata`) with the real data categories, effective date, placeholder contact email, and account deletion reference, satisfies **AC-1**, **AC-2**, **AC-3**
3. Build a site wide footer component (`apps/web/src/components/site-footer.tsx`) linking to `/privacy`, and render it in the root layout after `{children}`, satisfies **AC-4**
4. Build the consent notice bar as a leaf client component (`apps/web/src/consent/`, `"use client"`) plus its `localStorage` storage helper (`consent-storage.ts`, key `cookieConsent`, mirroring the try/catch + `typeof window === "undefined"` guard pattern in `recently-viewed-storage.ts`), and mount it from within the existing client `Providers` tree, satisfies **AC-6**, **AC-7**, **AC-8**, **AC-9**
5. Add a "Privacy Policy" row to the mobile account screen using the existing `ExternalLink` component and the shared `PRIVACY_POLICY_URL` constant, satisfies **AC-5**
6. Cross platform check: confirm the web footer link, banner behavior, and mobile account row all point at the same live `/privacy` content, satisfies **AC-1** through **AC-9**

## Consequences

**Positive**:
- The app now meets the basic app store and legal disclosure expectations for an app with account creation.
- Feature 14 (analytics) has a stored consent signal to read instead of needing to design its own mechanism from a blank page.

**Negative / tradeoffs**:
- The current design is not sufficient if the audience expands to the EU/UK; it will need a real rebuild to a blocking opt in model at that point, not just a content edit.
- The policy text is hand maintained; if a future feature changes what data is collected and nobody remembers to update `/privacy`, the disclosure becomes inaccurate. There is no automated check for this.

**Neutral**:
- Mobile carries no in app privacy screen of its own, only a link out to the web page; anyone reading the policy while offline on mobile cannot do so.

## Follow-up

- [ ] Replace the placeholder contact email in the policy content with a real address before shipping to production.
- [ ] When Sentry is actually installed (per `AGENTS.md`'s intended stack, not yet done), revisit the `/privacy` page's error/diagnostic logging category and firm up its forward looking wording into a definite disclosure, and confirm whether Sentry's PII scrubbing config needs to be set before that data is disclosed as collected.
- [ ] When scope feature 14 (basic product analytics) is designed, revisit this spec: the notice bar likely needs a real gating mechanism at that point (reading the stored consent choice before initializing analytics), and the policy content needs a new data category describing what analytics collects.
- [ ] If the app ever expects EU/UK traffic, redesign the consent mechanism as a blocking opt in gate before shipping any non essential tracking to that audience; this spec's Option 2 sketches the shape that work would take.
