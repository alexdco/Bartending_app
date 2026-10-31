# 0044. Google and Apple sign in

**Date**: 2026-10-31
**Status**: Proposed

## Summary

This adds "Continue with Google" and "Continue with Apple" to the account screen on web, iOS, and Android. A guest who taps one keeps everything they built as a guest, because the provider is linked onto their existing anonymous account (same user ID), exactly like email sign up in spec 0008. If that Google or Apple account already belongs to someone, the app switches to it, and warns first when this device has guest data that would be replaced. It needs no database change, and it ships one thin slice at a time behind a per provider flag, starting with Google on the web.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Requirements

**User stories**:
- As a guest, I want to save my pantry and favorites with one tap using my Google or Apple account, so I do not have to make up a password.
- As a returning user on a new device, I want to sign in with the same Google or Apple account and see my data.
- As an iPhone user who deletes my account, I want my Apple sign in connection revoked too, as Apple promises.

**Acceptance criteria**:
- **AC-1**: A guest who taps Continue with Google or Continue with Apple, with a provider account not yet known to the app, ends up signed in with the **same `user_id`** as their anonymous session (`linkIdentity`, not a new user). `is_anonymous` becomes `false`, and every existing pantry item, favorite, and shopping list item is still there.
- **AC-2**: If the provider identity already belongs to another user, the app falls back to signing into that user. When this device's guest has at least one pantry item, favorite, or shopping list item, the app first shows "You already have an account with this {provider}. Signing in replaces this device's guest data." with **Continue** and **Cancel**. Cancel leaves the guest session and its data untouched. Continue signs into the existing account and the guest data is left behind (same rule as spec 0008 AC-3). With no guest data, the switch happens silently.
- **AC-3**: A provider account whose verified email matches an existing email and password account lands in **that same account** (Supabase automatic identity linking). No duplicate user is created.
- **AC-4**: Both providers work on all three platforms. Google uses the native account picker on iOS and Android and the OAuth redirect on web. Apple uses the native sheet on iOS and the browser flow on Android and web.
- **AC-5**: The buttons sit on the guest account screen (the sign in form from spec 0008, shown to guests only) above the email form, separated by an "or" divider. Both buttons are disabled while an attempt is running, so a double tap cannot start two link attempts. Order: Apple then Google on iOS, Google then Apple on Android and web. Apple uses Apple's official button (black in light theme, white in dark), and Google follows Google's branding guidelines. Both are the same size. Each button is hidden when its provider flag is off.
- **AC-6**: After a successful link or sign in, if the user's `display_name` is empty, it is filled from the provider's name. A name the user already has is never overwritten. On iOS Apple, the name from the native credential is used, because Apple sends it only on the first authorization.
- **AC-7**: A signed in user with **no email identity** (signed up only with Google or Apple) does not see the change password or change email actions. Users with an email identity see the account screen exactly as today.
- **AC-8**: Cancelling the Google or Apple sheet or browser flow shows no error and changes nothing.
- **AC-9**: A network failure, Google Play Services missing on Android, or a provider error shows an inline message on the account screen. The guest session and its data stay intact.
- **AC-10**: On iOS, deleting an account that has an Apple identity first asks the user to confirm with Apple. Cancelling the Apple sheet cancels the deletion. On success, `delete-account` trades the authorization code for an Apple token, revokes it, then deletes the user. If the revoke fails, the user is still deleted and the failure goes to Sentry.
- **AC-11**: On web and Android, deleting an account with an Apple identity deletes the Supabase user and all data without an Apple revoke (accepted gap, see Consequences).
- **AC-12**: PostHog records `account_linked` when a guest becomes a real account and `signed_in` when an existing account signs in, each with `method`: `email` | `google` | `apple`. No email, name, or token is sent.
- **AC-13**: On the fallback sign in path (AC-2), the guest's local locale is written to the account only when the account has none, matching how email sign in already handles locale.
- **AC-14**: Guests who never tap a provider, and every email flow from spec 0008, behave exactly as before.
- **AC-15**: The privacy page names Google and Apple as sign in options and states what the app receives from them (name, email, a provider user ID) and that it stores nothing beyond what Supabase Auth keeps.

## Decision

**Chosen option**: Option 1, link first with Supabase Auth's native ID token and OAuth flows.

Use Supabase Auth's own Google and Apple providers. Call `linkIdentity` on the anonymous session first, and fall back to sign in (with the guest data warning) when the identity already exists. Use native SDKs where they exist (`@react-native-google-signin/google-signin`, `expo-apple-authentication`) and Supabase's browser OAuth flow everywhere else.

**Implementation skills**: `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `react-native-best-practices` (`callstackincubator/agent-skills`, `.agents/skills/react-native-best-practices/`) · `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`) · `posthog-instrumentation` (`posthog/posthog-for-claude`, `.agents/skills/posthog-instrumentation/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`)

## Feature design

**Data model sketch**: No schema change and no migration.
- Linked providers live in Supabase's `auth.identities`, read in the client through `session.user.identities` (each has a `provider`: `email` | `google` | `apple` | `anonymous`).
- The display name reuses `user_preferences.display_name` (spec 0018).
- "Guest has data" reads existing tables: `pantry_items`, `favorites`, `shopping_list_items`, all scoped to `auth.uid()` by row level security (RLS).
- Apple revocation stores nothing: the authorization code is used once, inside `delete-account`.

**Flows** (one per platform and provider):

| Platform | Provider | Link (AC-1) | Fallback sign in (AC-2) |
|---|---|---|---|
| Web | Google, Apple | `auth.linkIdentity({ provider, options: { redirectTo: <site>/auth/callback?provider=<p>&intent=link } })` redirects away. The callback exchanges the code. | The callback receives `error_code` instead of `code`, checks guest data, warns, then `auth.signInWithOAuth({ provider, options: { redirectTo: ...&intent=signin, queryParams } })` while the anonymous session is still in place. This is a second provider prompt, so tell the user honestly: Google shows its account picker (`queryParams: { prompt: "select_account" }`), and Apple asks again. |
| iOS, Android | Google | `GoogleSignin.signIn()` gives `idToken`, then `auth.linkIdentity({ provider: "google", token: idToken })`. | Same `idToken`: warn if needed, then `auth.signInWithIdToken({ provider: "google", token })`. |
| iOS | Apple | Make a raw nonce, SHA-256 it with `expo-crypto`, `AppleAuthentication.signInAsync({ requestedScopes: [FULL_NAME, EMAIL], nonce: hashed })`, then `auth.linkIdentity({ provider: "apple", token: identityToken, nonce: raw })`. | Same token and raw nonce: warn if needed, then `auth.signInWithIdToken({ provider: "apple", token, nonce })`. |
| Android | Apple | `auth.linkIdentity({ provider: "apple", options: { redirectTo: Linking.createURL("auth/callback", { queryParams: { provider: "apple" } }), skipBrowserRedirect: true } })` returns a URL. Open it with `WebBrowser.openAuthSessionAsync`, then `exchangeCodeForSession` on the returned `code`. | The returned URL carries `error_code`: warn if needed, then the same browser flow through `signInWithOAuth`. |

**No explicit sign out on the fallback.** `signInWithOAuth` (after its code exchange) and `signInWithIdToken` replace the anonymous session themselves, only once the provider has returned. So a cancel, closed tab, or failure on the second attempt leaves the guest session and its data exactly as they were. (The abandoned anonymous user after a successful switch is the same accepted debt as spec 0008, swept by spec 0017.)

**After any success, one owner per step**: each shared function calls `refreshSession()` before returning (so the JWT's `is_anonymous` claim is current for RLS, as the web callback already does). The app hook then clears the TanStack Query cache (as spec 0008 does), prefills the name (AC-6) from the refreshed `session.user`, and sends analytics (AC-12).

**Web callback states** (`auth-callback-client.tsx`): `exchanging` → `done` (`router.replace("/account")`) · `exchanging` → `conflict_warning` (the dialog renders on the callback page) → `signing_in` (redirect away) · `conflict_warning` → Cancel → `router.replace("/account")` with the guest intact · any → `error` (AC-9 message with a link back to `/account`). A ref guard makes sure the single use code exchange runs only once under React strict mode. Analytics fires only after a successful exchange, so reloading the callback URL cannot fire it twice. A callback without `provider` keeps today's email confirmation and recovery behavior unchanged.

**Android Apple browser result** (`openAuthSessionAsync`):

| Result | Outcome |
|---|---|
| `type: "success"`, URL has `code` | `exchangeCodeForSession(code)`, then the success steps |
| `type: "success"`, URL has a conflict `error_code` | Fallback (warning if guest data, then `signInWithOAuth` through the same browser flow) |
| `type: "success"`, URL has another `error_code` | AC-9 message, guest intact |
| `type: "cancel"` or `"dismiss"` | Nothing, silently (AC-8) |

The mobile `auth/callback` route ignores any deep link that carries `provider`, because `openAuthSessionAsync` already consumed it. That way the code is never exchanged twice.

**Conflict codes** (verified as the first, blocking step of slice 1):

| `error.code` from link | Meaning | Action |
|---|---|---|
| `identity_already_exists` | This Google or Apple identity belongs to another user | Fallback: warn if guest data, then sign in with the provider |
| `email_exists` / `user_already_exists` | The provider email belongs to an existing (email) account | Same fallback. Signing in with the provider lands in that account through automatic linking (AC-3) |
| `manual_linking_disabled` | Supabase setting off | AC-9 message ("sign in with Google is not available right now"), report to Sentry, guest intact |
| anything else | Provider or network failure | AC-9 message, guest intact |

**API surface** (shared functions in `packages/shared/src/auth.ts`, plus one Edge Function change):

| Function / endpoint | Inputs | Output | Auth | Key errors (`AuthError.reason`) |
|---|---|---|---|---|
| `linkWithIdToken(client, provider, token, nonce?)` | `provider`: `"google"` \| `"apple"`, `token` (req), `nonce` (Apple only) | void, session linked and refreshed | active anonymous session | `identity_already_exists`, `provider_unavailable`, `network_error` |
| `signInWithIdTokenReplacingGuest(client, provider, token, nonce?, guestLocale?)` | as above, plus `guestLocale` | void, session replaced and refreshed | any | `invalid_credentials` (including a reused token Supabase rejects, guest session left in place), `network_error` |
| `startOAuthLink(client, provider, redirectTo, { skipBrowserRedirect? })` | provider, redirect URL | `{ url }` when `skipBrowserRedirect`, else it redirects | active anonymous session | `network_error` |
| `startOAuthSignIn(client, provider, redirectTo, { skipBrowserRedirect? })` | same | same | any (caller has already signed out) | `network_error` |
| `guestHasData(client)` | none | `boolean`. If any count query fails it returns `true` (fail closed, so the warning shows) | current session | none thrown |
| `prefillDisplayName(client, candidate)` | candidate name or null | void (non blocking, like spec 0008's name save) | signed in | none surfaced |
| `hasEmailIdentity(user)` | `User` | `boolean` (pure) | n/a | n/a |
| `providerDisplayName(user)` | `User` | `string \| null` from `user_metadata.full_name ?? user_metadata.name` (pure) | n/a | n/a |
| `deleteAccount(client, { appleAuthorizationCode? })` | optional code | void | signed in | existing errors |
| `POST /functions/v1/delete-account` | body `{ appleAuthorizationCode?: string }` | `{ success: true }` (unchanged) | caller JWT (unchanged) | existing. A revoke failure is **not** an error to the caller |

New `AuthErrorReason` members: `identity_already_exists` (internal, triggers the fallback, mapped per the Conflict codes table), `oauth_cancelled` (handled silently, AC-8), `provider_unavailable` (Play Services missing, provider disabled, or `manual_linking_disabled`, AC-9).

**delete-account Apple revoke order**: verify the caller, then (only when a code is present) build the client secret, exchange the code, and revoke. Each Apple call has a 5 second timeout, and everything is inside one try/catch that reports to Sentry. Then comment photo cleanup and `deleteUser` run exactly as today. The token exchange `client_id` is the **bundle ID** (`APPLE_BUNDLE_ID`), because the code comes from the native app, not the Services ID. A user with more than one Apple identity is not possible (one Apple ID per Supabase user via `identity_already_exists`), so one revoke covers it.

**Value sourcing**:

| Action | Value | Source |
|---|---|---|
| Link / sign in (native Google) | `idToken` | `GoogleSignin.signIn()` response `data.idToken` |
| Link / sign in (native Google) | client IDs | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (`webClientId`, the audience Supabase checks), `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` |
| Link / sign in (iOS Apple) | raw nonce | `Crypto.randomUUID()` from `expo-crypto`, kept in memory for this attempt only |
| Link / sign in (iOS Apple) | hashed nonce | `Crypto.digestStringAsync(SHA256, raw)` |
| Link / sign in (iOS Apple) | `identityToken`, `authorizationCode`, `fullName` | `AppleAuthentication.signInAsync` credential |
| Web OAuth | `redirectTo` | `NEXT_PUBLIC_SITE_URL` + `/auth/callback?provider=<p>&intent=<link\|signin>` |
| Web callback | which provider to retry | the `provider` query param it set itself |
| Web callback | whether link failed because the identity exists | `error_code` query param from Supabase |
| Android Apple browser flow | `redirectTo` | `Linking.createURL("auth/callback")` (scheme `cocktailist`) |
| Warning (AC-2) | guest has data | `guestHasData`: `count` with `head: true` on `pantry_items`, `favorites`, `shopping_list_items`, true if any is above 0 or any query fails. Runs after a conflict is detected, before the fallback sign in |
| Warning (AC-2) | provider label | the provider the user tapped |
| Name prefill (AC-6) | candidate name | iOS Apple: `givenName` and `familyName` from the credential, each trimmed, joined with one space, null skipped. If both are empty, no candidate. Otherwise `providerDisplayName(session.user)` read **after** `refreshSession()`. Best effort: Apple through the browser may give no name, and then the name stays empty |
| Name prefill (AC-6) | whether a name exists | `fetchProfile(client).display_name` (spec 0018) |
| Account screen (AC-7) | show password and email actions | `hasEmailIdentity(session.user)`: `identities.some(i => i.provider === "email")` |
| Locale (AC-13) | guest locale | the app's current local locale (same source email sign in passes today) |
| Analytics (AC-12) | `method` | the button tapped, or `email` in the existing email hooks |
| Analytics (AC-12) | event name | `account_linked` when the link path succeeded, `signed_in` when the fallback or email sign in succeeded |
| Button visibility (AC-5) | enabled per provider | `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` / `NEXT_PUBLIC_AUTH_APPLE_ENABLED` (web), `EXPO_PUBLIC_AUTH_GOOGLE_ENABLED` / `EXPO_PUBLIC_AUTH_APPLE_ENABLED` (mobile), string `"true"` turns it on |
| Button order (AC-5) | platform | `Platform.OS` (mobile). Web is always Google first |
| Delete on iOS (AC-10) | whether to ask Apple | `session.user.identities` contains `provider === "apple"` and `Platform.OS === "ios"` |
| Delete on iOS (AC-10) | `appleAuthorizationCode` | a fresh `AppleAuthentication.signInAsync` at delete time |
| `delete-account` revoke | Apple client secret | an ES256 JWT signed in the function from `APPLE_PRIVATE_KEY` (`iss` = `APPLE_TEAM_ID`, `kid` = `APPLE_KEY_ID`, `sub` = `APPLE_BUNDLE_ID`, `aud` = `https://appleid.apple.com`, 5 minute expiry) |
| `delete-account` revoke | Apple refresh token | `POST https://appleid.apple.com/auth/token` with `grant_type=authorization_code` and the code |
| `delete-account` revoke | revoke call | `POST https://appleid.apple.com/auth/revoke` with `token=<refresh_token>`, `token_type_hint=refresh_token` |

**Key invariants**:
- Linking always comes first while the session is anonymous. The guest session is replaced only by a successful provider sign in after a conflict **and** the user confirmed (or had no guest data). There is no explicit `signOut()` on any provider path, so a cancel or error never costs guest data (AC-8, AC-9).
- One provider tap gives one outcome: linked, switched, or unchanged. No path leaves the device signed out with no session.
- `display_name` is written only when it is empty.
- The raw Apple nonce never leaves the device except to Supabase. Apple only ever sees the hash.
- No provider token, refresh token, or Apple key is stored in Postgres or on the device beyond the single attempt.

**Security model**:
- Unchanged RLS: every user owned row stays scoped to `auth.uid()`, and linking keeps the same `uid`, so no policy changes.
- The Supabase **Manual linking** setting must be on (it is what allows `linkIdentity` for a signed in or anonymous user).
- Google provider: list the web, iOS, and Android client IDs under Authorized Client IDs, and turn on **Skip nonce checks**. The free native Google library cannot pass a nonce on iOS. The token's audience and signature are still checked, which is the accepted tradeoff.
- Apple provider: list both the bundle ID `com.cocktailist.app` (native) and the Services ID (web and Android browser flow).
- Web OAuth uses PKCE (proof key for code exchange, which stops an intercepted code from being reused), already the client's flow from spec 0008.
- `delete-account` still resolves the caller from their own JWT. It only uses the Apple code for the revoke and never trusts a client supplied user ID. The Apple `.p8` key lives only in Edge Function secrets.
- No regulated data beyond what spec 0012 already covers. The privacy page gains provider wording (AC-15).

**Configuration required**:
- Supabase dashboard (manual): Google provider, Apple provider, Manual linking on, redirect URLs `<site>/auth/callback` and `cocktailist://auth/callback`.
- Google Cloud: OAuth consent screen. A **Web** client with redirect URI `https://ctuzjhhpnkkhooneporu.supabase.co/auth/v1/callback`, an **iOS** client for `com.cocktailist.app`, and **Android** clients for the EAS upload key SHA-1 and the debug keystore SHA-1.
- Apple Developer: Sign in with Apple on App ID `com.cocktailist.app`. A Services ID with return URL `https://ctuzjhhpnkkhooneporu.supabase.co/auth/v1/callback`. A Sign in with Apple key (`.p8`).
- `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED`, `NEXT_PUBLIC_AUTH_APPLE_ENABLED`: web button flags (Vercel env plus `.env.local.example`).
- `EXPO_PUBLIC_AUTH_GOOGLE_ENABLED`, `EXPO_PUBLIC_AUTH_APPLE_ENABLED`: mobile button flags (EAS env per profile plus `apps/mobile/.env`).
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`: native Google config (public values).
- `apps/mobile/app.json`: plugins `@react-native-google-signin/google-signin` (with `iosUrlScheme`, the reversed iOS client ID, public, committed) and `expo-apple-authentication`, plus `ios.usesAppleSignIn: true`. Needs a new dev client build.
- Edge Function secrets: `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (the `.p8` contents), `APPLE_BUNDLE_ID`.

**Critical test scenarios**:
- Happy path: a guest with 3 pantry items taps Google on web, completes Google, and lands on `/account` signed in with the same `user_id`. The 3 items are still there, and `account_linked {method: "google"}` fires. Verifies **AC-1**, **AC-12**.
- Fallback with data: a guest with a favorite taps Apple on iOS with an Apple ID already used on another device. The warning appears. Cancel leaves the guest and its favorite. Continue shows the other account's data and fires `signed_in {method: "apple"}`. Verifies **AC-2**, **AC-12**.
- Fallback without data: a fresh guest taps Google with a known account and switches with no warning. Verifies **AC-2**.
- Same email: an email and password user taps Google with the same verified address and lands in the same `user_id`. Verifies **AC-3**.
- Cancel and failure: closing the Google picker shows nothing. Airplane mode shows the inline error with the guest data intact. Cancelling the second (fallback) provider prompt, or closing the tab on web during it, leaves the original guest and its data. A double tap starts only one attempt. Reloading the web callback URL fires no second analytics event. Verifies **AC-5**, **AC-8**, **AC-9**, **AC-12**.
- OAuth only account: no change password or change email actions. An email user still sees both. Verifies **AC-7**.
- Name: a Google sign up with empty `display_name` gets the Google name. A user named "Sam" keeps "Sam". Verifies **AC-6**.
- iOS delete: an Apple user deletes, cancels the Apple sheet, and nothing is deleted. Retrying and confirming deletes the account, and the function log shows the revoke call. With a deliberately bad `APPLE_KEY_ID`, the deletion still succeeds and Sentry gets the error. Verifies **AC-10**.
- Unit (vitest, beside source): `hasEmailIdentity`, `providerDisplayName`, the error code map to `identity_already_exists`, `guestHasData` with a mocked client, and `prefillDisplayName` skipping a set name. Verifies **AC-6**, **AC-7**, **AC-2**.

## Build plan

Tracer Bullet: slice 1 proves the whole pipe (provider, Supabase link, the fallback with its warning, the callback, name, analytics, flags) on the cheapest platform. Each later slice thickens one platform or provider.

**Slice 0: setup (manual, you in the dashboards)**
1. [ ] Google Cloud consent screen plus Web client. Supabase: Google provider on, Manual linking on, web callback URL allowed. Satisfies **AC-1**, **AC-4**.

**Slice 1: web Google, end to end**
2a. [ ] Blocking spike first: against the real project, trigger each conflict (Google identity already on another user, Google email matching an email account) and record the exact `error_code` values and where they arrive (redirect query or hash, or the `linkIdentity` call itself). Lock the Conflict codes table to what you see before writing the map. Satisfies **AC-2**, **AC-3**.
2. [ ] `packages/shared/src/auth.ts`: new reasons, the error code map, `startOAuthLink`, `startOAuthSignIn`, `guestHasData`, `prefillDisplayName`, `hasEmailIdentity`, `providerDisplayName`, with unit tests beside them. Satisfies **AC-1**, **AC-2**, **AC-6**, **AC-7**, **AC-8**, **AC-9**.
3. [ ] `packages/shared/src/analytics.ts`: typed `account_linked` and `signed_in` events with `method`. Fire them from both apps' existing email hooks too. Satisfies **AC-12**.
4. [ ] Web account page: provider button component (Google branding), "or" divider, flag gating, and the hidden password and email actions for accounts without an email identity. Satisfies **AC-5**, **AC-7**, **AC-14**.
5. [ ] Web `auth-callback-client.tsx`: the callback state machine above (`provider`, `intent`, `error_code`, strict mode guard, the warning dialog on the callback page, Cancel back to `/account`), with email confirmation and recovery unchanged when there is no `provider`. On success, prefill the name, apply the locale rule when `intent=signin`, fire analytics once, clear the query cache. Satisfies **AC-1**, **AC-2**, **AC-6**, **AC-12**, **AC-13**, **AC-14**.
6. [ ] en and es strings for buttons, divider, warning, and errors. `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` in `.env.local.example` and Vercel. Satisfies **AC-5**, **AC-9**.

**Slice 2: web Apple**
8. [ ] Apple Services ID and key, Supabase Apple provider (Services ID plus generated secret), Apple button styling on web, `NEXT_PUBLIC_AUTH_APPLE_ENABLED`. Satisfies **AC-4**, **AC-5**.

**Slice 3: mobile Google (native)**
9. [ ] iOS and Android Google clients. Add the client IDs to Supabase Authorized Client IDs and turn on Skip nonce checks. Install `@react-native-google-signin/google-signin`, add the config plugin and env, rebuild the dev client. Satisfies **AC-4**.
10. [ ] Shared `linkWithIdToken` and `signInWithIdTokenReplacingGuest`, with tests. Confirm against the real project that the same Google token works for `signInWithIdToken` after a failed `linkIdentity` (and the same Apple token and nonce in slice 4). Satisfies **AC-1**, **AC-2**, **AC-13**.
11. [ ] Mobile account screen: buttons, divider, platform order, flags, the native Google flow with the warning (native `Alert`), cancel and Play Services handling, name prefill, analytics, hidden password and email actions, en and es strings. Satisfies **AC-1**, **AC-2**, **AC-5**, **AC-6**, **AC-7**, **AC-8**, **AC-9**, **AC-12**.

**Slice 4: iOS Apple (native)**
12. [ ] Install `expo-apple-authentication`, add the plugin and `usesAppleSignIn`, rebuild. Use `AppleAuthenticationButton` for the button, the nonce flow, and the credential name for the prefill. Satisfies **AC-1**, **AC-2**, **AC-4**, **AC-5**, **AC-6**.

**Slice 5: Android Apple (browser)**
13. [ ] Apple on Android through `startOAuthLink` / `startOAuthSignIn` with `skipBrowserRedirect` plus `WebBrowser.openAuthSessionAsync`, mapped per the Android Apple browser result table. Make the mobile `auth/callback` route ignore links carrying `provider`. Allow `cocktailist://auth/callback` in Supabase. Satisfies **AC-2**, **AC-4**, **AC-8**.

**Slice 6: Apple revoke at delete**
14. [ ] `delete-account`: accept an optional `appleAuthorizationCode`, then follow the revoke order above (bundle ID as `client_id`, 5 second timeouts, Sentry on failure, never blocking `deleteUser`, response stays `{ success: true }`). Set the four Apple secrets. Satisfies **AC-10**.
15. [ ] Shared `deleteAccount` passes the code. On iOS, the delete flow asks Apple first for Apple users, and a cancel aborts. Web and Android stay a plain delete. Satisfies **AC-10**, **AC-11**.

**Slice 7: wrap up**
16. [ ] Privacy page copy (web and mobile, en and es) naming Google and Apple and what they share. Satisfies **AC-15**.
17. [ ] Regression pass: guest flows and every spec 0008 email flow unchanged on both apps. Satisfies **AC-14**.

## Consequences

**Positive**:
- One tap account creation with zero data migration: the link keeps the same `user_id`, so nothing to merge, same as spec 0008.
- No new backend service, table, or stored secret beyond Apple's key. Supabase Auth does the token checks.
- The flags let every slice merge safely before its console setup is done.

**Negative / tradeoffs**:
- Two native modules need a dev client rebuild and more native config (URL schemes, SHA-1 fingerprints per keystore). A missing Android SHA-1 is the classic "Google sign in works in debug, fails in production" bug.
- Skip nonce checks on Google lowers replay protection for Google ID tokens slightly (the audience is still checked).
- The Apple web client secret Supabase uses expires after at most 6 months. When it lapses, Apple sign in on web and Android silently breaks until you renew it.
- Apple tokens are not revoked for deletions made on web or Android (AC-11). App Review only checks iOS, but it is a real gap.
- The fallback asks the user to pick their account again (Google's account picker, or Apple's sheet a second time). It is honest and safe, but it is one extra step for returning users on a new device.
- The fallback still drops guest data after the warning. Merging stays rejected, as in spec 0008.

**Neutral**:
- Apple "Hide My Email" users get a relay address as `user.email`. Nothing breaks, since password and email actions are hidden for them and the app sends them no email of its own.
- Users can still sign in with email only. Email remains the fallback for anyone without Google or Apple.
- The idle anonymous cleanup job (spec 0017) already skips non anonymous users, and linked provider users have `is_anonymous = false`.

## Migration plan

**Strategy**: feature flagged, no data migration.
**Phases**: each slice merges with its flag off, you finish that provider's console setup, then turn the flag on per environment (preview first, then production).
**Rollback**: set the flag to anything but `"true"` and redeploy or rebuild. Already linked users keep their identities and can still sign in once it is back on, or use email if they have one.
**Risks**: turning a flag on before the provider is configured shows a button that fails. Check the setup steps in Configuration required before flipping it.

## Follow-up

- [ ] Put a calendar reminder about 5 months out to regenerate the Apple client secret in the Supabase Apple provider settings.
- [ ] A "Connected accounts" section (view, link, unlink providers) was deferred. Revisit if users ask how they signed up or want to add a method.
- [ ] Apple revoke for deletions on web and Android (Apple JS for a code) was deferred. Revisit if Apple policy or user reports require it.
- [ ] "Set a password" for accounts that only use a provider was deferred.
- [ ] Google One Tap on web was deferred. It would need the GSI script, a nonce, and a cookie consent review (spec 0012).
- [ ] Spec 0008 Follow-up "OAuth deferred to a future spec" is now covered by this spec. Tick it there.
- [ ] Agent skill discovery for `@react-native-google-signin/google-signin`, `expo-apple-authentication`, and Apple token revocation found no credible skill, and you declined the weak candidates. Flag for the root `AGENTS.md` `Declined:` line so they are not offered again.
