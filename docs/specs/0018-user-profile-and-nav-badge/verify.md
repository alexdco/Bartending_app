# Verify: user profile and nav badge · spec 0018 · updated 2026-09-10

_Steps derived from spec 0018 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [ ] Sign up as a new user leaving the optional name field blank → sign up succeeds, no validation block → AC-4
- [ ] Sign up as a new user, typing a name in the optional field → account created, name lands prefilled/saved on the account page → AC-4
- [ ] As a signed in user with no `display_name` set, view the web nav and the mobile header bar → badge shows the uppercased first letter of the email → AC-2
- [ ] Set a two word name ("Ada Lovelace") on the account page → nav badge (web) and header badge (mobile) update to the two letter initials "AL" → AC-1
- [ ] Set a one word name ("Cher") on the account page → badge shows a single letter "C" → AC-1
- [ ] Set an emoji only name (e.g. "🍸") on the account page → save succeeds (passes length check) but the badge falls back to the email initial rule, not a blank/broken glyph → AC-1, AC-2
- [ ] As a guest (anonymous session), view the web nav and the mobile header bar → a neutral person icon shows, not a badge, on a non `accent` background → AC-3
- [ ] On the account page, type a name and save, then clear the field to empty and save again → stored value becomes null, badge reverts to the email initial rule → AC-6
- [ ] On the account page, enter a 51 character name and try to save → inline validation message shown, no save attempted → AC-7
- [ ] On the account page, enter a whitespace only name and try to save → inline validation message shown, no save attempted → AC-7
- [ ] Simulate a network/server failure while saving a name (e.g. offline) → entered text stays in the field, inline error message appears, retry succeeds without re-typing → AC-8
- [ ] Sign up with a name typed, where the post link name save is made to fail → sign up still succeeds; user lands on account page with the typed name prefilled in the field, retry saves without re-typing → AC-4, AC-8
- [ ] Click/tap the web nav badge → navigates to `/account` → AC-9
- [ ] Tap the mobile header badge → navigates to the account screen → AC-9
- [ ] As user A (signed in), attempt to write `display_name` directly on user B's `user_preferences` row (via a direct request using B's `user_id`) → rejected by RLS → AC-10
- [ ] Force a session with no `display_name` and no `email` (a state the app should not otherwise create) → badge renders a literal "?" placeholder, not blank or broken → AC-11

## Commands

- [ ] `pnpm --filter @bartendingapp/shared typecheck` → passes → AC-1 through AC-11 (typed access)
- [ ] `pnpm --filter web typecheck` → passes
- [ ] `pnpm --filter mobile typecheck` → passes
- [ ] `pnpm --filter web lint` / `pnpm --filter mobile lint` / `pnpm --filter @bartendingapp/shared lint` → pass
- [ ] `pnpm test` → all shared unit tests pass
- [ ] `pnpm --filter web build` → succeeds, `/account` and all other routes render
- [ ] Query the live `BartendingAppWeb` project's `user_preferences` table schema → `display_name` column and its check constraint are present → confirms the migration in Build plan step 1 is applied, not just written

## Acceptance-criteria coverage

- AC-1 (name initials shown) … covered by the two/one word name steps and the mobile/web badge steps
- AC-2 (email initial fallback) … covered by the no-name step and the emoji only name step
- AC-3 (guest neutral icon) … covered by the guest session step
- AC-4 (optional name at sign up, non blocking) … covered by both sign up steps
- AC-5 (account page name field with live preview) … covered by the account page name field steps (preview to be watched live during manual exercise, not separately listed)
- AC-6 (clearing name reverts to email fallback) … covered by the clear-name step
- AC-7 (length validation) … covered by the 51 character and whitespace only steps
- AC-8 (save failure keeps text, inline error, retry) … covered by the simulated network failure step
- AC-9 (badge tappable to account page) … covered by the web/mobile tap steps
- AC-10 (RLS: owner only read/write) … covered by the cross user write step
- AC-11 ("?" fallback with no name and no email) … covered by the forced empty session step
