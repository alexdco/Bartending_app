# 0044. Google and Apple sign in: rationale

## Context

Spec 0008 gave guests a way to keep their data: they turn their anonymous session into a real account with an email and password. It deliberately offered only that one method, and listed Google and Apple sign in as a future spec. Typing an email and password and then confirming an email is the heaviest possible way to save a pantry. On phones especially, most people expect a one tap option.

The identity model is fixed by spec 0001 and spec 0008. Every guest has a real anonymous Supabase user from the first launch, every user owned row is scoped to `auth.uid()` by row level security, and becoming a real account means keeping that same user ID so nothing ever has to be copied or merged. Any new sign in method has to fit that model, or it brings back the merge problems spec 0001 avoided.

The app ships on three platforms from one Supabase project (`BartendingAppWeb`): a Next.js web app, and an Expo app on iOS and Android. Each platform has a different best way to sign in with each provider, and Apple adds rules of its own. An iOS app that offers Google sign in must also offer Sign in with Apple. Apple's button has required styling. Apps must revoke Apple tokens when a user deletes their account. The Expo app already uses a custom dev client and EAS builds (spec 0040), so adding native modules is possible but costs a rebuild.

Without this, every guest who wants to keep their data faces the full email form, and the iOS app could not later add Google without also doing Apple.

## Options considered

### Option 1: Link first with Supabase Auth, native ID token flows where possible

Use Supabase Auth's built in Google and Apple providers. A provider tap calls `linkIdentity` on the anonymous session, so the user keeps their ID and data. If the identity already belongs to someone, fall back to signing in, warning first when guest data would be lost. Native SDKs give ID tokens on mobile. Supabase's OAuth redirect covers web and Apple on Android.

**Pros**:
- Fits the existing identity model exactly. The same user ID means no merge code, like spec 0008's email sign up.
- No new service. Supabase verifies the tokens, stores the identities, and links accounts that share a verified email.
- Native sheets on mobile give the best conversion and meet App Review's expectations.

**Cons**:
- Two native modules, more console setup, and a dev client rebuild.
- The link then fallback path is more code than a plain sign in, and the web fallback takes a second redirect.

### Option 2: Sign in only (no linking), Supabase Auth

Every provider tap signs out the guest and calls `signInWithOAuth` or `signInWithIdToken`, the same way email sign in works today.

**Pros**:
- The simplest code, one path per provider.
- Behaves the same as email sign in.

**Cons**:
- A brand new user loses all guest data the moment they sign up with Google or Apple. That is the core thing this feature exists to save, and it breaks spec 0001's principle.

### Option 3: Browser OAuth everywhere, no native modules

Use Supabase's OAuth redirect on every platform. Mobile opens it in `expo-web-browser` and returns through `cocktailist://auth/callback`.

**Pros**:
- One flow for both providers on all platforms, and no native rebuild.
- Reuses the existing mobile callback route.

**Cons**:
- A browser sheet instead of the system account picker converts worse. On iOS, Apple sign in in a browser looks out of place and risks App Review pushback.
- No Apple authorization code reaches the app, so Apple revocation on delete would be impossible on iOS too.

### Option 4: A hosted auth provider for social sign in

Add a separate auth service that handles social logins, and bridge its users into Supabase.

**Pros**:
- Polished prebuilt UI and many providers out of the box.

**Cons**:
- A second identity system next to Supabase Auth. Bridging it to `auth.uid()` row level security and the anonymous guest model is a big, ongoing cost. Spec 0008 already rejected this direction for the same reason.

## Rationale

Option 1 is the only one that adds one tap sign in without breaking the identity rule everything else rests on. Every pantry, favorite, and shopping list row is keyed to the anonymous user's ID, and spec 0001 chose linking specifically so that becoming an account never needs a data merge. `linkIdentity` is the provider equivalent of the `updateUser({ email, password })` call spec 0008 uses for email, and the installed supabase-js (2.117.2) supports it with both OAuth redirects and native ID tokens. Option 2 gives up the very thing the feature is for. Option 4 duplicates the auth system the project already runs and pays for.

The choice between native and browser (Option 1 vs Option 3) comes down to the mobile experience and Apple's rules. Native sheets are what users expect and what converts. The native Apple credential also includes the authorization code, which is the only practical way to meet Apple's revoke on delete rule without storing tokens. The cost is a dev client rebuild, which the project already does routinely through EAS (spec 0040). Apple on Android has no native SDK, so it uses the browser flow there. That keeps cross device sync working for someone who switches from an iPhone to Android.

The smaller calls follow the same logic. Warning only when guest data exists keeps silent switching for the common case (a fresh guest on a second device) while preventing a surprise loss, because, unlike email, a provider button never makes the user choose "sign in" over "sign up". Revoking only on iOS covers the platform Apple actually reviews without adding Apple's JS SDK for a rare path. Deleting even when the revoke fails respects the user's deletion request over a third party outage. The fallback never calls `signOut()` first. The provider sign in replaces the anonymous session only once it succeeds, so a cancelled or abandoned second prompt can never orphan guest data the user did not agree to give up.

A cross check suggested skipping the link when a guest has no data and going straight to sign in, which saves returning users the second prompt. It was considered and declined: it adds a second code path at the button, the link first path already handles that case correctly, and the saving is one account picker tap. Revisit it if analytics show many returning users dropping off at the second prompt.

Per provider build flags let each tracer slice merge before its console setup is finished, without making sign in depend on loading analytics flags.
