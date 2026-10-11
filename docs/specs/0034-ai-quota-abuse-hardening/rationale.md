# 0034. Rationale: layered limits against AI quota abuse

Decision record for [index.md](index.md). `/develop` builds from the index; this file explains why.

## Context

The `generate-drink-idea` Edge Function (spec 0007) calls Claude Haiku on the app owner's Anthropic key. Its only limit is 10 generations per user per UTC day, stored in `ai_generation_quota` and keyed by `user_id`. Both apps create an anonymous Supabase session silently at startup (`ensureAnonymousSession` in `packages/shared/src/supabaseClient.ts`), so a user id costs nothing to make: clear storage, or call `signInAnonymously()` directly with the public anon key, and you get a fresh quota.

The only brake on minting sessions today is Supabase's anonymous sign in rate limit, 30 per hour per IP by default. That makes one IP worth about 300 generations an hour, and an attacker with many IPs (a cheap proxy pool) faces no ceiling at all. Spec 0007 accepted this risk on purpose for a free creative feature and noted it was "cheap to tighten later". Scope feature 40 (tier GA) is that later: the feature is now public and indexed, and an unbounded bill is the failure.

Forces at play: guests must keep the full experience without signing in (the product promise in the scope header); both web and mobile call the function directly from the device, so the function sees the real client IP, but mobile has no easy browser for a challenge widget; the team is small, so a new vendor or always on infrastructure is a real cost; and any stored IP data is personal data under GDPR, which the privacy page (spec 0012) must disclose.

Not deciding leaves cost bounded only by the attacker's patience, with Sentry the only (late) signal.

## Options considered

### Option 1: Layered server side limits (chosen)

Tier the per user limit (guests 5, signed in 10), add a per IP limit that only guests count against (20 per day, IPv6 grouped by /64, hashed with a secret), and add a global daily cap (2000) with 20% held back for signed in users, all claimed in one atomic Postgres function. Back it with a lower anonymous sign in rate and an Anthropic console spend limit.

**Pros**:
- Hard cost ceiling no matter how many IPs an attacker has.
- No user friction and no new vendor; works the same on web and mobile.
- Builds on the existing quota table, Edge Function, pg_cron, and Sentry.

**Cons**:
- Guests behind a shared IP share one bucket.
- A distributed attacker can still use up the guests' share for the day.
- IP derivation is only as trustworthy as the gateway header, which must be verified.

### Option 2: Cloudflare Turnstile token on the generate call

The client solves an invisible Turnstile challenge and sends the token with each generate request; the Edge Function verifies it with Cloudflare before reserving a slot.

**Pros**:
- Strong against scripted abuse; gates only the expensive action, not app startup.
- No shared IP false positives.

**Cons**:
- Mobile needs a WebView based widget, which adds a dependency and real friction.
- A new vendor and secret; solving services can still beat it for a price.
- Does not bound cost by itself; it still needs a global cap.

### Option 3: Supabase native CAPTCHA on anonymous sign in

Turn on Supabase Auth's CAPTCHA (Turnstile or hCaptcha) so every `signInAnonymously()` needs a solved challenge.

**Pros**:
- Built into the platform, so very little server code.
- Slows minting for every abuse vector at once, not just AI.

**Cons**:
- Gates app startup for every visitor on both apps; the silent guest bootstrap becomes a visible challenge.
- Mobile needs a WebView; an expired or failed challenge leaves the app sessionless.
- Still no cost ceiling.

### Option 4: AI ideas for signed in users only

Refuse generation for anonymous callers entirely.

**Pros**:
- Closes the hole completely with the least code.

**Cons**:
- Guests lose a headline feature, breaking the "full experience without signing in" promise.
- Sign up becomes a hard barrier before anyone has seen the feature's value.

## Rationale

The threat is cost, not data exposure, so the defense that matters most is one that caps cost against any attacker. Only a global cap does that; per user and per IP limits only raise the price of abuse. That makes the cap non negotiable, and the remaining choice is how to keep real users working under it. Holding 20% back for signed in users means a flood of anonymous traffic can deny guests for a day but never the users who signed up. That is the right way round, since signed in identities are expensive to mint.

For raising the price of abuse, a per IP limit was chosen over a CAPTCHA because it keeps the guest experience silent on both platforms and adds no vendor, which suits a small team. CAPTCHA (Options 2 and 3) is stronger per request, but it costs friction on every guest and a WebView on mobile, and it still needs the global cap anyway. It is kept as the runner up: the Follow-up names Turnstile on the generate call as the next step if shared IP complaints or daily exhaustion of the guest share show the IP layer is not enough. Why add an IP layer at all, when the lowered sign in rate limit (10 sessions an hour per IP) already caps minting? Because sessions times quota still adds up: one IP could make 10 sessions an hour × 5 ideas, about 1200 a day, enough on its own to cut off every real guest by draining most of the 1600 guest share. The IP layer holds one IP to 20 a day, so draining the guest share takes about 80 IPs instead of 2. It is only worth that if the IP can't be forged, which is why Build plan task 1 is a gate: if no trustworthy header exists, the layer is dropped rather than shipped. Limiting the IP layer to anonymous callers keeps its main weakness (shared networks) away from signed in users, and grouping IPv6 by /64 closes the easy rotation that full address keys allow.

Cutting guests to 5 halves what each minted session is worth and gives guests a reason to sign in, which closes spec 0007's tiering follow up. The single atomic reservation keeps the pattern spec 0007 already proved (claim before calling Claude), and widens it to three counters with a fixed lock order. That way a refusal on one limit never spends a slot on another, and concurrency cannot overshoot any limit. Spec 0007's "no refund on failure" rule is dropped: with a global cap in place, an Anthropic outage plus users retrying would burn the whole day's cap for nothing, so a request that ends in 502 releases its slots. The IP is stored only as a keyed hash because a plain hash of IPv4 can be reversed by brute force, and a 7 day retention keeps even the hash short lived. The two dashboard settings cost minutes and protect against a bug in this very code.
