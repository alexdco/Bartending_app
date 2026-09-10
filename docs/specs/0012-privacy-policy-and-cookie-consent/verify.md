# Verify: Privacy policy and cookie consent · spec 0012 · updated 2026-09-07

_Steps derived from spec 0012 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [ ] Visit `/privacy` on web → page renders with no auth/session, showing account/auth, pantry/favorites, guest session, and Anthropic AI data categories, plus a forward looking note on error/diagnostic logging not yet collected → AC-1
- [ ] On `/privacy`, check the page shows a placeholder contact email and a reference to the in app account deletion flow → AC-2
- [ ] On `/privacy`, check an "Effective date" appears near the top → AC-3
- [ ] Load any web page (e.g. `/`, `/pantry`) → the footer shows a "Privacy Policy" link that navigates to `/privacy` → AC-4
- [ ] On mobile, open the Account screen → a "Privacy Policy" row is visible for both a guest and a signed in user, and tapping it opens the web `/privacy` URL (in app browser on native, new tab on web) → AC-5
- [ ] Load a web page with no `cookieConsent` value in `localStorage` → the consent bar appears at the bottom with the exact copy and an Accept button linking to `/privacy` → AC-6
- [ ] Click Accept → the bar disappears; reload the page or open a new tab in the same browser → the bar does not reappear, and `localStorage.cookieConsent` holds `{ accepted: true, acceptedAt: <ISO string> }` → AC-7
- [ ] With `localStorage` blocked or throwing (e.g. private browsing with storage disabled) → the banner still renders without crashing the page, and simply reappears on the next load → AC-7
- [ ] Inspect page source / view source for any page → server rendered HTML has no consent banner markup baked in (it only appears client side post hydration), and root layout/page metadata are unchanged from before this feature → AC-8
- [ ] Confirm no existing feature (search, pantry, drink ideas) is blocked or altered by the presence of the unaccepted banner → AC-9

## Commands

- [ ] `pnpm --filter @bartendingapp/shared typecheck` → passes → AC-5
- [ ] `pnpm --filter web typecheck` → passes → AC-1 through AC-9
- [ ] `pnpm --filter web lint` → passes → AC-6, AC-7, AC-8
- [ ] `pnpm --filter web build` → `/privacy` prerenders as static content, other routes unchanged → AC-1, AC-8
- [ ] `pnpm --filter mobile typecheck` → passes → AC-5
- [ ] `pnpm --filter mobile lint` → passes → AC-5
- [ ] `pnpm test` → repo test suite passes → no regressions

## Acceptance-criteria coverage

- AC-1 … covered by the `/privacy` manual load step and the web build/typecheck steps
- AC-2 … covered by the contact/deletion reference manual step
- AC-3 … covered by the effective date manual step
- AC-4 … covered by the footer link manual step
- AC-5 … covered by the mobile Account screen manual step and the shared/mobile typecheck steps
- AC-6 … covered by the consent bar appearance manual step
- AC-7 … covered by the Accept-persists and storage-unavailable manual steps
- AC-8 … covered by the server rendered HTML inspection step and the web build step
- AC-9 … covered by the no-blocking-of-existing-features manual step
