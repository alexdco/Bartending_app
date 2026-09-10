# Verify: Sign in and cross device sync · spec 0008 · updated 2026-09-07
_Steps derived from spec 0008 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] As a guest with pantry items, open `/account` (web) or the Account tab (mobile) → see a sign in form with a "Need an account? Sign up" toggle → AC-1, AC-2, AC-11
- [ ] Switch to sign up, submit email/password → see "Check your inbox" pending state; guest data and functionality on this device are unaffected → AC-1
- [ ] Follow the confirmation link → lands back in the app signed in as a linked (non anonymous) identity, with the same pantry items still present → AC-1
- [ ] Sign up with an email already registered to another account → same "check your email…" success looking message shown (no "already exists" error), current device's session and data unaffected → AC-4
- [ ] On a second device with its own guest data, sign in with the linked account's email/password → that device's local guest data and functionality are replaced by the account's pantry, favorites, and preferences (not merged) → AC-3, AC-7
- [ ] From the account screen, request a password reset, follow the emailed link → routed to the reset password form (not a normal sign in), submit a new password → signed in with the new password afterward → AC-5
- [ ] Sign out from a linked session → device returns to a fresh anonymous guest session with full guest functionality → AC-6
- [ ] Change email from the account screen → change does not take effect until the confirmation link is followed → AC-8
- [ ] Attempt to delete account without typing "DELETE" → delete button stays disabled; type "DELETE" → account, pantry, favorites, and preferences are all gone after confirming → AC-10
- [ ] As a guest, exercise search, pantry, drink ideas, and AI generation with no sign in prompt anywhere → AC-11
- [ ] Force a token refresh failure for a linked session (e.g. revoke the session server side) → inline "sign in again" prompt appears without blocking guest capable screens; repeat for an anonymous session → silently re-bootstraps with no prompt → AC-12

## Value sourcing checks
- [ ] Sign up: confirm the new email/password identity's `user_id` equals the pre-signup anonymous session's `user_id` (e.g. via the Supabase dashboard or a query), not a newly generated id
- [ ] Sign up: confirm `session.user.is_anonymous` is `true` immediately after submitting the form and `false` only after the confirmation link is followed
- [ ] Sign in on a second device: confirm pantry/favorites/theme shown come from Postgres rows keyed to the signed in `user_id`, not any leftover local/cache data (reload after `queryClient.clear()` fires)
- [ ] Theme conflict: set different themes on two devices while offline-ish (stagger the writes), reconnect both — confirm the later `updated_at` wins
- [ ] Delete account: confirm the Edge Function resolves the identity to delete from the caller's own JWT (`auth.getUser`), not any id passed in the request body

## Commands
- [ ] `pnpm --filter @bartendingapp/shared typecheck` → passes
- [ ] `pnpm --filter web typecheck` → passes
- [ ] `pnpm --filter mobile typecheck` → passes
- [ ] `pnpm lint` (repo-wide) → passes
- [ ] `pnpm build` → web builds `/account`, `/account/reset-password`, `/auth/callback` routes successfully
- [ ] `pnpm test` → existing suite still green (26 tests)
- [ ] A request to `pantry_items`/`favorites`/`user_preferences` carrying a different user's session is rejected (RLS), same pattern as spec 0002's RLS tests → AC-9

## Acceptance-criteria coverage
- AC-1 … covered by the sign up + confirmation manual steps and the user_id value sourcing check
- AC-2 … covered by the one-screen sign in/up toggle manual step
- AC-3 … covered by the second device sign in manual step
- AC-4 … covered by the duplicate email sign up manual step
- AC-5 … covered by the password reset manual step
- AC-6 … covered by the sign out manual step
- AC-7 … covered by the second device sign in step, the theme conflict value sourcing check, and the cross platform parity build (shared `auth.ts`/`preferences.ts`)
- AC-8 … covered by the change email manual step
- AC-9 … covered by the RLS command check
- AC-10 … covered by the delete account manual step and its value sourcing check
- AC-11 … covered by the guest functionality manual step
- AC-12 … covered by the token refresh failure manual step

## Known gaps (not blocking `done`, flagged for the engineer)
- Supabase Auth project URL Configuration (the web callback route and the mobile `mobile://auth/callback` custom scheme as allowed redirect URLs) has not been configured — no MCP tool exposes this setting. Password reset and email confirmation links will not complete end to end until this is set in the dashboard.
