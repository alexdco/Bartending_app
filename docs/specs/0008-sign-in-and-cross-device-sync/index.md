# 0008. Sign in and cross device sync

**Date**: 2026-09-07
**Status**: In Progress

## Summary

This spec covers letting a guest turn their anonymous session into a real account with an email and password, so their pantry, favorites, and preferences follow them to a second device. It builds entirely on the identity model spec 0001 already chose (an anonymous session is upgraded in place, not replaced), so no user data ever needs to be migrated or merged. Guests keep the full app with no sign in required; signing in is something a user opts into from an account area, not a gate.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

| Entity | Primary key | Fields | Foreign keys | Cardinality |
|---|---|---|---|---|
| `user_preferences` (new) | `user_id` (uuid) | `theme` (text, one of `light`/`dark`/`system`, default `system`), `updated_at` (timestamptz) | `user_id` → `auth.users` (cascade) | 1:1 `auth.users` |
| `pantry_items` (existing, spec 0002/0005) | (`user_id`, `ingredient_id`) | unchanged | `user_id` → `auth.users` (cascade) | N:M `auth.users` ↔ `ingredients` |
| `favorites` (existing, spec 0002) | (`user_id`, `recipe_id`) | unchanged | `user_id` → `auth.users` (cascade) | N:M `auth.users` ↔ `recipes` |
| `auth.users` (Supabase built in) | `id` (uuid) | `email`, `encrypted_password`, `is_anonymous` | — | referenced by all of the above |

No change to `pantry_items` or `favorites`; both already key off `auth.uid()` (a Postgres function returning the current session's user id), so once a session is a real, non anonymous identity, both start syncing across devices with no code change to their own tables.

**State transitions**:

A user's identity moves through three states:
- `anonymous` (no email/password set) → `linked` (email/password added via `updateUser()`, same `user_id`, triggered by sign up) → `deleted` (the `auth.users` row is removed, cascading to all owned data, triggered by delete account)
- A `linked` user can also reach `anonymous` again only by signing out, which on that device starts a brand new anonymous session (a different `user_id`); it does not revert the original account.
- Sign in on a second device does not change state for the account; it authenticates an already `linked` identity into a new local session on that device.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| Sign up (link) — `supabase.auth.updateUser({ email, password })` | — | `email` (req), `password` (req, min 6 chars, Supabase default) | the same `user_id`; the identity stays `is_anonymous: true` and unconfirmed until the emailed confirmation link is followed (email confirmation is on, project default) | an active anonymous session (required) | Supabase returns a success-looking response even when the email is already registered elsewhere, to avoid leaking which emails exist (see AC-4); weak password; network error |
| Confirm sign up — the emailed confirmation link opens a callback route (web: a page route; mobile: a deep link), which exchanges the link's code for a session via `exchangeCodeForSession` (PKCE flow, both platforms) | — | the `code` query param from the emailed link | a session where `is_anonymous` is now `false`; this is the moment the identity becomes durable | none (the link itself is the credential) | expired/invalid/already used confirmation link |
| Sign in — `supabase.auth.signOut()`, `queryClient.clear()`, then `supabase.auth.signInWithPassword({ email, password })` | — | `email` (req), `password` (req) | a new session for the existing linked account's `user_id` | none (this is how a session is established) | wrong password; no account with that email; network error |
| Sign out — `supabase.auth.signOut()`, `queryClient.clear()`, then `ensureAnonymousSession()` (spec 0005) | — | none | a brand new anonymous session | an active session (required) | network error creating the replacement anonymous session |
| Request password reset — `supabase.auth.resetPasswordForEmail(email, { redirectTo })` | — | `email` (req), `redirectTo` (web URL or mobile deep link) | none (always returns success to avoid leaking which emails are registered) | none | network error |
| Complete password reset — the emailed link opens the same callback route as sign up confirmation but fires a `PASSWORD_RECOVERY` event (detected via `onAuthStateChange`); the app then calls `supabase.auth.updateUser({ password })` on that recovery session | — | new `password` (req) | session confirmed with new password | a valid recovery session (from the `PASSWORD_RECOVERY` event, established by the same `exchangeCodeForSession` call as sign up confirmation) | expired/invalid recovery link; weak password |
| Change email — `supabase.auth.updateUser({ email })` | — | new `email` (req) | pending change, confirmed via emailed link (same callback route) | an active linked session (required) | email already registered; network error |
| Update preferences — upsert `user_preferences` | UPSERT | `theme` (req) | the saved row | an active session (required, anonymous or linked) | invalid `theme` value (checked constraint) |
| Read preferences | SELECT | `auth.uid()` (implicit via RLS) | `{ theme }`, or the default (`system`) if no row exists yet | an active session (required) | none (missing row is not an error, treated as default) |
| Delete account — `supabase.auth.admin.deleteUser` via a Supabase Edge Function (the client SDK cannot delete a user; this must run server side with the service role key) | POST | the caller's JWT (already attached to the request, no password re-entry) | `auth.users` row removed, cascading to `pantry_items`/`favorites`/`user_preferences` | an active linked session (required); the Edge Function calls `auth.getUser(token)` to resolve and verify the identity from the JWT before deleting | invalid/expired JWT; network error |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Sign up | The `user_id` the new email/password identity attaches to | The current anonymous session's `auth.uid()`, never a new id (this is what preserves pantry/favorites with zero migration) |
| Sign up | Whether the account is durable yet (AC-1) | `session.user.is_anonymous`, `false` only after the confirmation link is followed; the UI shows a "check your inbox" pending state between sign up and confirmation |
| Sign in on a second device | Which data now loads (pantry, favorites, preferences) | Whatever rows in Postgres already carry the signed in account's `user_id`, read the same way any other session reads them; `queryClient.clear()` runs first so no stale previous-session data renders from cache |
| Sign up / password reset / email change confirmation | The link the user taps to return to the app | `redirectTo`: a web callback route (e.g. `/auth/callback`) on web, a configured custom URL scheme deep link (Expo `Linking.createURL()`) on mobile; both exchange the link's `code` via `exchangeCodeForSession` (PKCE flow) |
| Password reset completion | Whether the current session is a recovery session, not a normal one | The `PASSWORD_RECOVERY` event from `onAuthStateChange`, fired after the callback route's `exchangeCodeForSession` call establishes the session |
| Recipe detail / pantry screen "already in pantry" marker (spec 0005, unchanged) | Which ingredients are marked | Same set intersection logic as spec 0005; unaffected by this feature since it already reads from `auth.uid()` |
| Theme applied on load | The active theme value | `user_preferences.theme` for a linked or anonymous session that has saved one, else `system` default (falls through to the existing `Appearance`/`prefers-color-scheme` behavior, unchanged if no row exists); on conflicting writes from two devices, the later `updated_at` wins |
| Delete account | Whose account is being deleted | `auth.getUser(token)` inside the Edge Function, resolved from the caller's own JWT; never a client supplied id |
| Session expired prompt (AC-12) | When to show it | `onAuthStateChange` firing `SIGNED_OUT` immediately after a `TOKEN_REFRESHED` attempt fails; for an anonymous session this instead silently re-runs `ensureAnonymousSession()` rather than prompting sign in, since there is no account to sign back into |

**Key invariants**:
- An anonymous session's `user_id` never changes when it links an email/password identity (`updateUser`, not `signUp`); every existing `pantry_items`/`favorites` row stays valid with zero data movement.
- The identity only becomes durable (safe to sign in with on a second device) once `is_anonymous` is `false`, which happens at confirmation, not at the initial `updateUser` call; AC-1 is satisfied at confirmation, not at submission.
- Signing in on a device with an existing anonymous session always discards that device's local anonymous session and its data before establishing the linked account's session; this is a one way action with no merge step, matching the confirmed behavior. The abandoned anonymous `auth.users` row is not deleted by this feature; it is accepted debt for spec 0001's still unbuilt idle account cleanup job (Follow-up).
- `user_preferences(user_id)` is unique (primary key); an update is always an upsert, never a duplicate row.
- Delete account is only reachable for a `linked` (non anonymous) session; deleting an anonymous session's data is already covered by sign out (a fresh session replaces it) and by spec 0001's future idle account cleanup job, not by this feature's delete flow.
- A failed sign in, sign up, or password reset leaves the current session (anonymous or linked) completely unchanged; auth actions never partially apply.
- Every sign in and sign out transition clears the TanStack Query cache (`queryClient.clear()`) before the new session's data loads, so no screen can render a value scoped to the previous session's `user_id`.

**Security model**:
Row level security on `user_preferences` mirrors `pantry_items`'s intent but needs its own `UPDATE` policy, which `pantry_items` deliberately has none of (spec 0002 only ever inserts/deletes pantry rows, never updates one in place): `SELECT`/`INSERT` use `WITH CHECK (select auth.uid()) = user_id`, and `UPDATE` uses **both** `USING ((select auth.uid()) = user_id)` and `WITH CHECK ((select auth.uid()) = user_id)`, so a caller can neither read/update a row they don't own nor rewrite a row's `user_id` to someone else's during an update. `pantry_items` and `favorites` need no policy change; their existing `auth.uid()` scoped policies already become cross device correct the moment a session is a real linked identity rather than a fresh anonymous one each time.

Delete account cannot be a plain client call: `supabase-js` has no client method to delete a user, and doing it via a client held service role key would expose that key to every device. It runs through a Supabase Edge Function (already an established pattern in this project, spec 0007) that resolves and verifies the caller's identity from their own JWT via `auth.getUser(token)`, then calls `auth.admin.deleteUser` with the service role key, which never leaves the server. No password re-entry is needed server side since the JWT already proves the request is authenticated as that user; the client side confirmation dialog exists to guard against an accidental tap, not to re-authenticate.

Supabase Auth's own defaults are relied on for password strength (6 character minimum) and rate limiting (sign in attempts, email sends); no custom throttling or password policy is added by this feature.

**Configuration required**:
- No new environment variables for the client apps; both already have the Supabase URL and anon key (spec 0001).
- The delete account Edge Function needs `SUPABASE_SERVICE_ROLE_KEY`, set as an Edge Function secret (never shipped to a client), matching the pattern already used for other server side Supabase access in this project.
- Supabase Auth project settings: configure the mobile app's custom URL scheme as an allowed redirect URL (Auth → URL Configuration), alongside the web app's callback route, so `resetPasswordForEmail`'s and `updateUser({ email })`'s `redirectTo` are accepted.

**Critical test scenarios**:
- Happy path: a guest with pantry items signs up with email/password; their existing pantry items are still there immediately after sign up (same `user_id`); they open the app on a second device, sign in, and see the same pantry items and favorites, verifies **AC-1**, **AC-2**, **AC-3**, **AC-7**.
- Failure case: sign up with an email already registered to another account shows an inline "account already exists" error and leaves the current device's guest data completely untouched, verifies **AC-4**.
- Auth/permission: a signed in user's `user_preferences`/`pantry_items`/`favorites` rows are unreadable and unwritable by a request carrying a different user's session, verified the same way spec 0002's RLS tests already cover `pantry_items`, verifies **AC-9**.

## Requirements

**User stories**:
- As a guest, I want to create an account with my email and password so my pantry and favorites carry over to my other devices.
- As a signed in user, I want to sign in on a new device and see my pantry, favorites, and preferences already there.
- As a user who forgot their password, I want to reset it by email so I am not permanently locked out of my account.
- As a signed in user, I want to sign out, change my email, or delete my account entirely.
- As a guest, I want the app to work exactly as it does today if I never sign in.

**Acceptance criteria**:
- **AC-1**: A signed out guest can create an account from a visible account/profile area using email and password; the account's `user_id` is the same as their existing anonymous session's `user_id` (the anonymous identity is linked in place, not replaced). Once the user confirms the email via the emailed link, the identity is durable (`is_anonymous: false`) and any pantry or favorites data they already had stays intact and is now reachable from any device signed into that account. Between submitting the form and confirming the email, the app shows a "check your inbox to finish" pending state; the device's guest data and functionality are unaffected while pending.
- **AC-2**: A user can sign in with email and password from the same account/profile area shown to guests (one screen, a link toggles between sign in and sign up).
- **AC-3**: Signing in on a device that already has an anonymous session (with or without local data) replaces that session with the signed in account's session; the account's pantry, favorites, and preferences (as already stored in Postgres) are what the user sees afterward, not the prior local anonymous data.
- **AC-4**: Signing up with an email already registered to another account never confirms or denies whether that email exists (Supabase's own anti enumeration behavior returns a success looking response either way); the UI always shows "check your email to finish creating your account, or sign in if you already have one" rather than a definitive error, and the current device's session and any of its data are unaffected.
- **AC-5**: A signed in user can request a password reset email, follow the link (a web route on web, a deep link back into the app on mobile), and set a new password.
- **AC-6**: A signed in user can sign out, returning the device to a fresh anonymous guest session with full guest functionality.
- **AC-7**: A signed in user's pantry (spec 0005), favorites (spec 0002), and theme preference all reflect the same values across any two devices signed into the same account, with no manual sync step.
- **AC-8**: A signed in user can change their account email; the change only takes effect after they confirm it via a link sent to the new address.
- **AC-9**: A signed in user's `user_preferences`, `pantry_items`, and `favorites` rows are private: no other session, anonymous or signed in, can read or write them.
- **AC-10**: A signed in user can permanently delete their account after a confirmation dialog (typed confirmation, not a password re-check, see Security model for why); this removes their `auth.users` row and cascades to delete all of their `pantry_items`, `favorites`, and `user_preferences` rows.
- **AC-11**: A signed out (guest) user's experience is completely unchanged by this feature: no sign in prompt is forced, and every existing guest capability (search, pantry, drink ideas, AI generation) keeps working exactly as it does today.
- **AC-12**: If a signed in user's token refresh fails during use (`onAuthStateChange` fires `SIGNED_OUT` after a failed `TOKEN_REFRESHED`), the user sees an inline prompt to sign in again without losing their ability to keep browsing as a guest; a lapsed anonymous session instead silently re-bootstraps via `ensureAnonymousSession()` with no user facing prompt. Neither case ever surfaces as an unhandled error or blocks unrelated app features.

## Decision

**Chosen option**: Option 1: Supabase Auth email/password with anonymous identity linking

Sign in and cross device sync is built entirely on Supabase Auth's own anonymous-to-permanent upgrade path (`updateUser()` on the existing anonymous session), avoiding any new auth provider or a data migration step.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`)

## Build plan

1. [x] Migration: create `user_preferences` (`user_id` uuid primary key references `auth.users` cascade, `theme` text with a check constraint restricting it to `light`/`dark`/`system`, default `system`, `updated_at` timestamptz), plus row level security policies (`auth.uid() = user_id` via `WITH CHECK` on select/insert, and **both** `USING` and `WITH CHECK` on update per the Security model above; no delete policy needed since the row deletes via the `auth.users` cascade), satisfies **AC-9**. — applied to the live Supabase project `BartendingAppWeb` (ctuzjhhpnkkhooneporu) via `supabase/migrations/20260907201908_user_preferences.sql`; confirmed live via table introspection; security advisor clean (only the pre-existing `ai_generation_quota` info lint); types regenerated in `packages/shared/src/database.types.ts`.
2. [x] Shared `auth.ts` in `packages/shared`: `signUpWithPassword` (wraps `updateUser({ email, password })` on the current session), `signInWithPassword` (wraps `signOut()`, then `signInWithPassword()`), `signOutToAnonymous` (wraps `signOut()`, then `ensureAnonymousSession()` from spec 0005), `requestPasswordReset`, `completePasswordReset`, `changeEmail`, each throwing a typed `AuthError` (reason union) per this project's `GenerateDrinkIdeaError`-style convention, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-5**, **AC-6**, **AC-8**. `queryClient.clear()` is called from each app's mutation hook (`onSuccess`) rather than inside shared, since shared has no React/TanStack dependency (`packages/shared/AGENTS.md`); both apps' `use-auth-mutations.ts` do this identically.
3. [x] Shared `preferences.ts` and a `usePreferences()`/`useUpdatePreference()` TanStack Query hook pair in `packages/shared`, following the same pattern as spec 0005's pantry hooks (optimistic update, one shared cache key), satisfies **AC-7**. — `packages/shared/src/preferences.ts`, per-app hooks at `apps/{web,mobile}/src/auth/use-preferences.ts`.
4. [x] `delete-account` Supabase Edge Function: resolves and verifies the caller's identity via `auth.getUser(token)` from their own JWT, then calls `auth.admin.deleteUser` with the service role key, satisfies **AC-10**. — `supabase/functions/delete-account/index.ts`, deployed and ACTIVE on the live project.
5. [x] Shared `deleteAccount` fetch wrapper in `packages/shared` calling the Edge Function, satisfies **AC-10**. — `packages/shared/src/deleteAccount.ts`.
6. [x] Account/profile screen or page (mobile and web): a signed out guest sees one form (sign in, with a link to switch to sign up); a signed in user sees sign out, change email, change password (request reset), and delete account (a typed confirmation dialog, e.g. type "DELETE") actions, satisfies **AC-1**, **AC-2**, **AC-4**, **AC-6**, **AC-8**, **AC-10**, **AC-11**. — web: `apps/web/src/app/account/page.tsx` + `apps/web/src/auth/account-page-client.tsx` (+ nav link); mobile: `apps/mobile/src/app/account.tsx` (+ tab entry).
7. [x] Shared auth callback route: a web page at a callback route, and a configured custom URL scheme deep link on mobile (Expo `Linking`), both calling `exchangeCodeForSession` (PKCE flow) on the link's `code`; the resulting session either fires a normal sign in (email confirmation, satisfies **AC-1**), a `PASSWORD_RECOVERY` event handled by routing to the password reset completion form (satisfies **AC-5**), or an email change confirmation (satisfies **AC-8**); configure both redirect URLs in the Supabase Auth project settings. — web: `apps/web/src/app/auth/callback/page.tsx` (+ `apps/web/src/app/account/reset-password/page.tsx`); mobile: `apps/mobile/src/app/auth/callback.tsx` (+ `apps/mobile/src/app/auth/reset-password.tsx`), deep link via `Linking.createURL("auth/callback")`. **Not done**: configuring the redirect URLs in the Supabase Auth project's URL Configuration — no MCP tool exposes this setting; the engineer needs to add the web callback URL and the mobile custom scheme (`mobile://auth/callback`) as allowed redirect URLs in the dashboard before password reset/email confirmation links will work end to end.
8. [x] Session expiry handling: a shared listener on `onAuthStateChange` (already available from the Supabase client) that surfaces an inline "sign in again" prompt on a `SIGNED_OUT` event following a failed `TOKEN_REFRESHED` for a linked session, or silently re-bootstraps via `ensureAnonymousSession()` for a lapsed anonymous session, without blocking guest capable screens, satisfies **AC-12**. — wired into both apps' root providers (`apps/web/src/app/providers.tsx`, `apps/mobile/src/app/_layout.tsx`) for the silent re-bootstrap, and `use-session.ts` (both apps) for the inline prompt shown on the account screen.
9. [x] Cross platform parity check: both apps share the same `auth.ts`/`preferences.ts` functions and hooks, hit the same live Postgres data, and use the same error-to-message mapping, satisfies **AC-7**, **AC-11**. — both apps' `account`/`account-page-client` screens use an identical `authErrorMessage` mapping over the shared `AuthError` reason union (not yet factored into `packages/shared`, matching the existing duplicated pattern from spec 0007's `generateErrorMessage`).

## Consequences

**Positive**:
- Zero data migration risk: because sign up upgrades the existing anonymous session in place, every existing pantry/favorites row is valid the instant an account exists, with no merge code to write or test.
- `pantry_items` and `favorites` need no schema or policy change at all; they become cross device correct purely because the identity behind `auth.uid()` becomes durable.
- Delete account reuses the Edge Function pattern already proven in spec 0007, no new server side pattern to learn.

**Negative / tradeoffs**:
- A guest who used the app as a guest on a second device before ever signing in on that device permanently loses that device's local guest data the moment they sign in there (no merge offered), since the confirmed behavior is a full replace, not a merge; this is a real, if usually small, data loss the engineer explicitly accepted.
- Delete account and email change both depend on Supabase's transactional email deliverability (rate limits and default templates); a wider email volume down the line could need a follow up to a real SMTP provider.
- Sessions on two devices signed into the same account do not push updates to each other live (theme especially); a change is only reflected on next load, not instantly, which is an accepted tradeoff over adding a realtime subscription for a low value payoff.

**Neutral**:
- This is the first feature to make `auth.uid()`'s identity durable across app restarts on a new device; any latent assumption elsewhere in the codebase that treated a session as device local (none currently known) would surface here first.

## Follow-up

- [ ] OAuth (Google/Apple) and other sign in methods were explicitly deferred to a future spec; email+password is this feature's only method.
- [ ] "Offer to merge" guest data on a second device sign in was considered and rejected for this slice (see rationale.md); revisit if user feedback shows real data loss happening in practice.
- [ ] Spec 0001's 30 day idle anonymous account cleanup job remains unbuilt; this feature does not change that job's design, but a `linked` (non anonymous) user must never be swept by it, which that job's own spec should state explicitly when it is designed.
- [ ] Live cross device push for preferences (e.g. via Supabase Realtime) was explicitly deferred; revisit only if a real user complaint about a delayed theme change surfaces.
