# 0034. Layered limits against AI quota abuse via anonymous sessions

**Date**: 2026-10-11
**Status**: In Progress

## Summary

Today anyone can get a fresh AI drink idea quota just by starting a new anonymous (guest) session, so a script can run up the Anthropic bill with no real ceiling. This spec adds three server side limits to the `generate-drink-idea` Edge Function: a smaller daily limit for guests than for signed in users, a daily limit per network address (IP) that every guest session from that address shares, and a hard global daily cap on total generations, with part of it held back for signed in users. All three are checked and claimed together in one database step, so a blocked request never uses up a slot, and a generation that fails after its retry gives its slots back. Two dashboard settings (a lower anonymous sign in rate, an Anthropic spend limit) back it up from outside the code.

## Requirements

**User stories**:
- As the app owner, I want AI generation spend to have a hard daily ceiling, so a script minting anonymous sessions cannot run up an unbounded Anthropic bill.
- As a guest, I want to still try AI drink ideas without signing in, and be told plainly when signing in would get me more.
- As a signed in user, I want my AI ideas to keep working even when guest traffic is flooding the feature.

**Acceptance criteria**:
- **AC-1**: An anonymous caller is limited to 5 generations per UTC calendar day and a signed in (linked, `is_anonymous = false`) caller to 10, both keyed to the user id and enforced server side. The tier is read from the verified JWT user (`user.is_anonymous`), never from the request body. A guest who links their account partway through a day keeps that day's count, and their limit becomes 10.
- **AC-2**: Anonymous callers are also limited to 20 generations per UTC day per IP bucket, shared by every anonymous session from that bucket. An IPv4 bucket is the full address; an IPv6 bucket is the address's /64 prefix. Signed in callers are never counted against or blocked by the IP limit.
- **AC-3**: Total generations across all callers are capped at 2000 per UTC day. Anonymous callers are refused once that day's total (anonymous and signed in together) reaches 1600 (80% of the cap); signed in callers may continue until the total reaches 2000.
- **AC-4**: The user, IP, and global counters are checked and claimed in a single database transaction, all or nothing: a request refused by any limit claims no slot in any counter, and concurrent requests can never push any counter past its limit.
- **AC-4b**: When a generation still fails after its one automatic retry (the 502 path), every slot the request claimed (user, IP if any, global) is released, so an Anthropic outage cannot use up the day's caps. A failed release is reported to Sentry and does not change the 502 the caller receives.
- **AC-5**: A refused request returns HTTP 429 with a body of `{ error, reason, resetsAt, signInHelps }`, where `reason` is `user_limit`, `ip_limit`, or `global_limit`, `resetsAt` is the start of the next UTC day, and `signInHelps` is true only when the caller is anonymous and the total has not reached the full 2000 cap. The request never reaches Claude.
- **AC-6**: Both apps show a reason specific message on a 429, using the copy in *Client messages* below. When `signInHelps` is true, the message says signing in gets more ideas today and offers a link to the account (sign in) screen. A `global_limit` message says ideas are very busy today. Every message names when the limit resets, in the user's local time.
- **AC-7**: No raw IP address is ever stored. The bucket key is an HMAC SHA-256 hash (a keyed one way hash) of the bucket string, using the `IP_HASH_SECRET` Edge Function secret. If that secret is missing, anonymous generation fails closed (refused with 503, reported to Sentry) while signed in generation keeps working.
- **AC-8**: The client IP is read only from a value Supabase's edge itself sets (rule in *IP bucket derivation*, confirmed by the probe in Build plan task 1). A value the client sends in `X-Forwarded-For` or any other header cannot change which bucket a request lands in. An anonymous request with no determinable IP, or a header in an unexpected shape, is counted in one shared `unknown` bucket under the same 20 per day limit, and a Sentry warning is sent.
- **AC-9**: A Sentry warning is sent once per UTC day when the total reaches 1600 (guests now cut off), and once when it reaches the full 2000 cap. If the function's isolate dies between the database commit and the Sentry send, that day's warning is lost; this is accepted, since it is a signal, not a control. Each `ip_limit` refusal adds a Sentry breadcrumb and a `console.warn` with the hash prefix, so shared network blocking can be measured.
- **AC-10**: A daily pg_cron job deletes rows older than 7 days from `ai_generation_quota`, `ai_generation_ip_quota`, and `ai_generation_daily_total`.
- **AC-11**: The two new tables grant `anon` and `authenticated` no access (RLS on, no policy, privileges revoked), and the new reservation function can be executed only with the service role key.
- **AC-12**: The privacy page (English and Spanish) states, in the wording given in *Privacy page copy* below, that a one way hash of a guest's IP address is kept for up to 8 days to limit abuse of AI drink ideas.
- **AC-13**: Two settings outside the code are applied and recorded in the scope row: the Supabase anonymous sign in rate limit is lowered from 30 to 10 per hour per IP, and a monthly spend limit is set in the Anthropic console.

## Decision

**Chosen option**: Option 1: Layered server side limits (tiered per user, per IP for guests, global cap with a signed in reserve)

Keep the existing per user quota but tier it by account type, add an anonymous only per IP limit and a global daily cap to the same atomic reservation, and back it with two dashboard settings; no CAPTCHA, no new vendor.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`)

## Feature design

**Data model sketch**:

| Table | Primary key | Fields | Notes |
|---|---|---|---|
| `ai_generation_quota` (existing, unchanged) | (`user_id`, `day`) | `user_id uuid not null` → `auth.users(id) on delete cascade`; `day date not null`; `count int not null default 0` | one row per user per UTC day |
| `ai_generation_ip_quota` (new) | (`ip_hash`, `day`) | `ip_hash text not null` (hex HMAC, 64 chars); `day date not null` (always supplied by the reservation function, no default); `count int not null default 0 check (count >= 0)` | one row per IP bucket per UTC day; anonymous callers only; no foreign key (an IP is not an entity) |
| `ai_generation_daily_total` (new) | `day` | `day date not null`; `total_count int not null default 0 check (total_count >= 0)` | one row per UTC day, counting anonymous and signed in generations together |

All three have RLS enabled, no policies, and `revoke all ... from anon, authenticated`. Index needs: none beyond the primary keys; the cleanup job's `day < cutoff` delete scans small tables (the `day` column leads only on `ai_generation_daily_total`, which is fine at one row per day).

**Reservation function** (new, replaces `reserve_ai_generation_quota`):

`public.reserve_ai_generation_slot(p_user_id uuid, p_is_anonymous boolean, p_ip_hash text, p_user_limit int, p_ip_limit int, p_global_limit int, p_anon_global_limit int) returns table (reason text, day date, total_count int)`, `language plpgsql`, `security definer`, `set search_path = ''`, `set lock_timeout = '3s'`, `execute` revoked from `public, anon, authenticated`. Every table reference is schema qualified (`public.…`).

- Input guards first: `raise exception` if any limit is not positive, or if `p_is_anonymous` and `coalesce(p_ip_hash, '') = ''` (a code bug must fail closed, never skip the IP layer).
- The day is computed inside SQL as `(now() at time zone 'utc')::date`, once, into a variable used for every row and returned to the caller (this also restores spec 0007's original "day computed in SQL" intent, which the shipped function drifted from).
- Lock then check then claim, in one fixed lock order to avoid deadlocks: (1) `ai_generation_daily_total` row for the day, (2) the `ai_generation_ip_quota` row (anonymous only; `p_ip_hash` is ignored and may be null for signed in callers), (3) the `ai_generation_quota` row. Each row is created with `insert ... on conflict do nothing`, then locked with `select ... for update`. If a lock cannot be had within 3 seconds the call errors and the Edge Function returns 502 (fails closed).
- Checks run after all locks are held, on the locked current values. Refusal precedence, first match wins: `user_limit` (user count ≥ `p_user_limit`), then `ip_limit` (anonymous and IP count ≥ `p_ip_limit`), then `global_limit` (total ≥ `p_global_limit`, or anonymous and total ≥ `p_anon_global_limit`). On refusal, return the reason with the day and the current locked `total_count`, and write nothing.
- On success, increment the user row, the IP row (anonymous only), and `total_count`, and return `reason = null` with the day and the new `total_count`.

**Release function** (new): `public.release_ai_generation_slot(p_user_id uuid, p_ip_hash text, p_day date) returns void`, same `security definer`, `search_path`, `lock_timeout`, and revokes. Takes the locks in the same order and decrements `total_count`, the IP row (when `p_ip_hash` is not null), and the user row by one each, never below zero (`greatest(count - 1, 0)`). It takes `p_day` from the reservation result, so a failure that straddles UTC midnight releases the right day.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `generate-drink-idea` (existing Edge Function) | POST | body `{ locale? }` (unchanged); caller JWT; gateway set client IP header | 200 unchanged: `{ name, ingredients, steps, pantry_size }` | anonymous or signed in JWT | 401 no session; 422 pantry too small; **429** `{ error, reason, resetsAt, signInHelps }`; **503** `{ error: "temporarily unavailable" }` anonymous caller when `IP_HASH_SECRET` is unset; 502 quota check or generation failed |
| `reserve_ai_generation_slot` (new Postgres function) | RPC, service role only | see above | `reason`, `day`, `total_count` | service role key | input guard exception or lock timeout, surfaced as the function's 502 |
| `release_ai_generation_slot` (new Postgres function) | RPC, service role only | `p_user_id`, `p_ip_hash`, `p_day` | none | service role key | any error is reported to Sentry only |

Flow inside the function, in order (unchanged steps kept): method check → parse locale → verify JWT with `supabase.auth.getUser()` (401; this calls the auth server, so `is_anonymous` is current even for a JWT minted just before the user linked) → read pantry (422 if under 2) → if anonymous: check `IP_HASH_SECRET` first (503 if missing), then derive the IP bucket (Sentry warning if `unknown`) and its HMAC → `reserve_ai_generation_slot` (429 on any reason) → Sentry threshold warnings → Claude call with one retry → on final failure, `release_ai_generation_slot` with the reserved day, then 502 → 200. This replaces spec 0007's "no refund" rule: a request that ends in 502 gives back its slots (AC-4b). A 200 never does.

**Limits** (constants at the top of `supabase/functions/generate-drink-idea/index.ts`, replacing `DAILY_QUOTA`), written as plain literals: `ANON_DAILY_QUOTA = 5`, `LINKED_DAILY_QUOTA = 10`, `ANON_IP_DAILY_QUOTA = 20`, `GLOBAL_DAILY_CAP = 2000`, `ANON_GLOBAL_DAILY_CAP = 1600` (80% of the cap).

**IP bucket derivation** (pure helpers in `supabase/functions/_shared/ip-bucket.ts`, no `jsr:`/`npm:` imports, so vitest can import them):
- `clientIpFromHeaders(headers)`: the default rule, before the probe: use `cf-connecting-ip` when present (a single value header the edge sets itself); otherwise the rightmost entry of `x-forwarded-for` (the one the last trusted proxy appended, never the leftmost, which a client can forge). A header that is present but does not parse as one IP returns `null`. Build plan task 1 confirms or corrects this rule (including how many proxy hops append to `x-forwarded-for`) and the helper is written to the confirmed rule. Never reads a client controllable entry.
- `ipBucket(ip)`: first strip brackets, a port (`[::1]:443`, `1.2.3.4:80`), and an IPv6 zone ID (`%eth0`). Then IPv4 → the address as is; IPv6 → the first four hextets after expanding `::` and lowercasing, written as `<prefix>::/64`; IPv4 mapped IPv6 (`::ffff:a.b.c.d`) → treated as IPv4; `null` or unparseable → `"unknown"`.
- `hashIpBucket(bucket, secret)`: HMAC SHA-256 via Web Crypto (`crypto.subtle`, available in both Deno and Node 20), returned as lowercase hex.

**IP source** (Build plan task 1 finding, probed 2026-10-11 against the live project from one IPv4 network): `cf-connecting-ip` carries the real client address, and a request that sends its own `CF-Connecting-IP` is rejected by Cloudflare with error 1000 before it reaches the function, so it cannot be forged. `x-forwarded-for` arrives as `<client>,<client>, <AWS load balancer>`: a client sent value is replaced, not appended to, and the rightmost entry is a rotating AWS address (13.248.108.x), not the client. The default rule's `x-forwarded-for` fallback is therefore dropped: `clientIpFromHeaders` reads `cf-connecting-ip` only, and a missing or malformed value returns `null` (the `unknown` bucket, AC-8). `true-client-ip` and `forwarded` pass through from the client unchanged and are never read. Still to confirm: one call from a second network (and IPv6 if available).

**Client messages** (AC-6). Parsed fields come from `GenerateDrinkIdeaError`; `{time}` is `resetsAt` formatted in the user's local time zone with `Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" })`, where `locale` is the app's current locale (`en` or `es`). The sign in link goes to `/account` on both apps (web via the locale aware `Link`, mobile via the expo router `account` screen).

| Case | English | Spanish |
|---|---|---|
| `user_limit` or `ip_limit`, `signInHelps` true | You've used today's free drink ideas. Sign in to get more today, or try again after {time}. | Ya usaste las ideas gratis de hoy. Inicia sesión para obtener más hoy, o vuelve a intentarlo después de {time}. |
| `user_limit`, `signInHelps` false | You've reached today's drink idea limit. Try again after {time}. | Llegaste al límite de ideas de hoy. Vuelve a intentarlo después de {time}. |
| `global_limit`, `signInHelps` true | Drink ideas are very busy today. Sign in to keep going, or try again after {time}. | Las ideas de tragos están muy solicitadas hoy. Inicia sesión para seguir, o vuelve a intentarlo después de {time}. |
| `global_limit`, `signInHelps` false | Drink ideas are very busy today. Try again after {time}. | Las ideas de tragos están muy solicitadas hoy. Vuelve a intentarlo después de {time}. |
| no `reason` (older function deploy) | today's existing message, unchanged | today's existing message, unchanged |

The link text is "Sign in" / "Inicia sesión" on the matching phrase. Follow each page's current string handling: Spanish strings go wherever that page already keeps its translations, and stay in English only where the page has no translation support yet (feature 41 owns moving the drink ideas page into the catalog).

**Privacy page copy** (AC-12), added to the privacy content in `apps/web/messages/en.json` and `es.json`:
- English: "When a guest (not signed in) asks for an AI drink idea, we keep a one way hash of their IP address for up to 8 days, only to limit abuse of that feature. The hash can't be turned back into your IP address, and it's deleted automatically."
- Spanish: "Cuando un invitado (sin iniciar sesión) pide una idea de trago con IA, guardamos un hash irreversible de su dirección IP durante un máximo de 8 días, solo para limitar el abuso de esa función. El hash no se puede convertir de nuevo en tu dirección IP y se borra automáticamente."

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Reserve | caller tier (anonymous or linked) | `user.is_anonymous` from `supabase.auth.getUser()` on the caller's JWT |
| Reserve | per user limit (5 or 10) | derived from tier + the function constants |
| Reserve | IP bucket | gateway set header (task 1 finding) → `ipBucket()`; `"unknown"` when absent |
| Reserve | `ip_hash` | `hashIpBucket(bucket, IP_HASH_SECRET)` |
| Reserve | current UTC day | computed in SQL, `(now() at time zone 'utc')::date`, returned as `day` |
| Release | which day's rows to decrement | `day` returned by `reserve_ai_generation_slot` for this request |
| Release | `ip_hash` to decrement | the same hash computed for the reservation (`null` for signed in callers) |
| 429 body | `reason` | `reserve_ai_generation_slot` result |
| 429 body | `resetsAt` | existing `startOfNextUtcDay()` in the function |
| 429 body | `signInHelps` | derived: caller anonymous AND returned `total_count` < `GLOBAL_DAILY_CAP` |
| Sentry warning | "guests cut off for today" | successful reservation whose returned `total_count` equals `ANON_GLOBAL_DAILY_CAP` exactly (the one request that crosses it) |
| Sentry warning | "global cap reached" | successful reservation whose returned `total_count` equals `GLOBAL_DAILY_CAP` exactly |
| Sentry warning | "IP unknown" | `clientIpFromHeaders()` returned `null` for an anonymous caller |
| Sentry breadcrumb | `ip_limit` refusal | the reservation's `reason`, logged with the first 8 hex characters of `ip_hash` |
| Client message | reason specific text | `GenerateDrinkIdeaError.limitReason` and `.signInHelps`, parsed from the 429 body in `packages/shared/src/generateDrinkIdea.ts`, mapped by the *Client messages* table |
| Client message | reset time | `.resetsAt`, formatted with `Intl.DateTimeFormat` in the app's current locale and the device's time zone |
| Client message | sign in link target | `/account` on both apps (web `apps/web/src/app/[locale]/account`, mobile `apps/mobile/src/app/account.tsx`) |
| Privacy page | hash retention wording | "up to 8 days": the 7 day cutoff in AC-10 plus up to one day until the daily job runs (AC-10, AC-12) |

**Key invariants**:
- No counter ever exceeds its limit for its day; the reservation is a single transaction with all three rows locked before any check.
- A refused request writes nothing; a request that ends in 502 leaves every counter where it was before it started (barring a failed release, which is reported).
- No counter ever goes below zero.
- No raw IP is written to any table or log line; logs and Sentry context carry only the hash prefix (first 8 hex characters) at most.
- Signed in callers never touch `ai_generation_ip_quota`.

**Security model**: Clients cannot read or write any quota table or call the reservation function; only the Edge Function, holding the service role key server side, can. The tier comes from the verified JWT, so a client cannot claim to be signed in. The IP comes only from the gateway's own header, so a client cannot pick its bucket. `IP_HASH_SECRET` lives only as an Edge Function secret; without it the stored hashes cannot be reversed to IPs (a plain hash of the IPv4 space can be brute forced in minutes, a keyed one cannot). The hash is still pseudonymous personal data under GDPR (data that identifies someone only with extra information), which is why it is kept for 8 days at most and named on the privacy page.

**Configuration required**:
- `IP_HASH_SECRET`: new Edge Function secret, 32 or more random bytes (for example `openssl rand -hex 32`). Set before deploying the new function code. Rotating it resets every IP bucket for the rest of the day, which is acceptable.
- Supabase dashboard, Authentication → Rate Limits: anonymous sign ins per hour per IP, 30 → 10. Mirror the value in `supabase/config.toml` `[auth.rate_limit] anonymous_users = 10` for the local stack.
- Anthropic console: a monthly spend limit for the API key's workspace, set a little above 31 × the worst case daily cost of 2000 generations (each generation is at most two Haiku calls with the retry); work out the dollar figure from current Anthropic pricing when setting it.

**Critical test scenarios**:
Where they run: the pure helper and client wrapper cases run in vitest. The database cases (limits, all or nothing, concurrency, release, permissions, retention) need a live Postgres, so task 2 and task 8 run them by hand as SQL in the Supabase SQL editor against temporary users, and the results (pass/fail, date) are recorded in scope feature 40's build notes. The end to end cases (forged header, missing secret, thresholds) run against the deployed function.

- Happy path: a guest with a 3 ingredient pantry generates successfully; the user, IP, and daily total rows each go up by one, verifies **AC-1**, **AC-2**, **AC-3**.
- Tiered user limit: a guest's 6th generation of the day gets 429 `user_limit` with `signInHelps: true`; after linking the account, the same user id can make 4 more (10 total), verifies **AC-1**, **AC-5**.
- Minting: 5 fresh anonymous sessions from one IP each generate 4 times (20 total); a 6th fresh session from the same IP gets 429 `ip_limit` on its first try, while a signed in user on the same IP still succeeds, verifies **AC-2**.
- IPv6 rotation: two addresses in the same /64 share a bucket; two addresses in different /64s do not (vitest on `ipBucket`), verifies **AC-2**.
- Forged header: an anonymous request carrying a client set `X-Forwarded-For: 1.2.3.4` lands in the caller's real bucket, not `1.2.3.4`'s, verifies **AC-8**.
- Global cap and reserve: with the total at 1600 (say 1000 guest plus 600 signed in), a guest gets 429 `global_limit` with `signInHelps: true` and a signed in user succeeds; with the total at 2000, everyone gets 429 `global_limit` with `signInHelps: false`, verifies **AC-3**, **AC-5**.
- Guest on the IP limit while guests are cut off: a guest whose IP bucket is full gets `ip_limit` (precedence) with `signInHelps: true`, verifies **AC-5**.
- All or nothing: a guest at 4 of 5 whose IP bucket is at 20 gets 429 `ip_limit`, and their user row stays at 4 and the total is unchanged, verifies **AC-4**.
- Concurrency: with a user one slot from their limit, two simultaneous calls give exactly one success and one 429; with the daily total one slot from the cap, two calls from different users give exactly one success, verifies **AC-4**.
- Release on failure: with Claude forced to fail twice, the guest gets 502 and their user, IP, and total counts are back where they started; a release that itself errors still returns 502 and reports to Sentry, verifies **AC-4b**.
- Bad input: calling `reserve_ai_generation_slot` with `p_is_anonymous = true` and an empty `p_ip_hash`, or a zero limit, raises an exception, verifies **AC-4**.
- Missing secret: with `IP_HASH_SECRET` unset, a guest gets 503 and a Sentry error, and a signed in user still gets a 200, verifies **AC-7**.
- Thresholds: the request that moves the total to 1600 sends exactly one Sentry warning, and the next guest attempt (refused) sends none; an `ip_limit` refusal leaves a breadcrumb, verifies **AC-9**.
- Messages: each row of the *Client messages* table renders in both apps in both locales, with the reset time in local time, verifies **AC-6**.
- Permissions: an `authenticated` client selecting from `ai_generation_ip_quota` or calling `reserve_ai_generation_slot` via `rpc` is denied, verifies **AC-11**.
- Retention: a row dated 8 days ago is gone after the cleanup job runs and a row dated 6 days ago remains, in all three tables, verifies **AC-10**.

## Build plan

Tracer Bullet: task 1 settles the one unknown (the trusted IP source) before anything depends on it. Task 2 to 4 then push one thin thread end to end: one guest request through the new reservation and back to a reason specific message in the web app. The remaining tasks thicken that thread (mobile, cleanup, privacy, ops), then retire the old function. Per this project's practice, migrations are run by you in the Supabase SQL editor rather than through the MCP tool.

1. **Probe the trusted IP header.** Deploy a throwaway `debug-ip-headers` Edge Function to the live project (not `supabase functions serve`, whose local stack sets different headers) that echoes `x-forwarded-for`, `x-real-ip`, `cf-connecting-ip`, and `forwarded`. Call it once plainly and once with forged `X-Forwarded-For: 1.2.3.4` and `CF-Connecting-IP: 1.2.3.4` headers, from two different networks. Record in this spec, as an **IP source** note under *IP bucket derivation*, which header carries the real IP, whether a client value is replaced or appended, and how many proxy hops append to `x-forwarded-for`; correct the default rule if it was wrong. Delete the probe function. **Gate:** if no header carries the real IP in a way a client cannot forge, stop and route back to `/architect` to drop the IP layer rather than ship a forgeable one. Satisfies **AC-8**.
2. **Migration `<timestamp>_ai_quota_abuse_limits.sql`**: create `ai_generation_ip_quota` and `ai_generation_daily_total` (RLS on, no policy, revoke from `anon, authenticated`) and the `reserve_ai_generation_slot` and `release_ai_generation_slot` functions as designed (execute revoked from `public, anon, authenticated`). Leave `reserve_ai_generation_quota` in place. Run it in the SQL editor, run the security advisor, regenerate `packages/shared/src/database.types.ts`. Run the database test scenarios by hand as SQL against temporary users (limit per tier, IP limit, guest cutoff at 1600, all or nothing, release, bad input, a two session concurrency check, permissions) and record the results in scope feature 40. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-4b**, **AC-11**.
3. **IP helpers plus tests**: add `supabase/functions/_shared/ip-bucket.ts` (`clientIpFromHeaders` per the task 1 rule, `ipBucket`, `hashIpBucket`) and `ip-bucket.test.ts` beside it; extend `include` in the root `vitest.config.ts` with `"supabase/functions/**/*.test.ts"`. Cover IPv4, IPv6 compressed and expanded forms in one /64, different /64s, IPv4 mapped IPv6, brackets, ports, and zone IDs, garbage → `unknown`, the forged header cases from task 1, and HMAC determinism and secret sensitivity. Satisfies **AC-2**, **AC-7**, **AC-8**.
4. **Edge Function**: in `generate-drink-idea/index.ts` replace `DAILY_QUOTA` with the five constants; for anonymous callers check `IP_HASH_SECRET` first (503 plus Sentry error if unset), then derive bucket and hash (Sentry warning if the bucket is `unknown`); call `reserve_ai_generation_slot`; return the 429 body `{ error, reason, resetsAt, signInHelps }` (breadcrumb on `ip_limit`); send the threshold Sentry warnings (`Sentry.captureMessage(..., "warning")`, logged with `console.warn` when no DSN); on final generation failure call `release_ai_generation_slot` with the reserved day before returning 502. Set `IP_HASH_SECRET` first, then deploy, then run the end to end scenarios against the live function. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4b**, **AC-5**, **AC-7**, **AC-8**, **AC-9**.
5. **Shared client wrapper**: in `packages/shared/src/generateDrinkIdea.ts` add `limitReason?: "user_limit" | "ip_limit" | "global_limit"` and `signInHelps?: boolean` to `GenerateDrinkIdeaError`, parsed from the 429 body (missing fields leave them undefined, so an old function deploy still maps to today's message). Add `generateDrinkIdea.test.ts` cases for each reason and for a body with no `reason`. Satisfies **AC-5**, **AC-6**.
6. **Web message**: in `apps/web/src/drink-ideas/drink-ideas-page-client.tsx` map the reasons to the *Client messages* table, with a locale aware `Link` to `/account` when `signInHelps`. Satisfies **AC-6**.
7. **Mobile message**: the same mapping in `apps/mobile/src/app/drink-ideas.tsx`, with the sign in link navigating to the `account` screen. Satisfies **AC-6**.
8. **Retention**: migration `<timestamp>_register_ai_quota_cleanup_cron.sql` that schedules a daily pg_cron job (`ai-quota-cleanup`, `15 4 * * *`, runs as the `postgres` role like the existing jobs) running plain SQL `delete ... where day < (now() at time zone 'utc')::date - 7` on all three tables. No Edge Function or Vault secret needed, since it is pure SQL. Confirm the first run in `cron.job_run_details`. Satisfies **AC-10**.
9. **Privacy page**: add the *Privacy page copy* sentences to the privacy content in `apps/web/messages/en.json` and `apps/web/messages/es.json`. Satisfies **AC-12**.
10. **Outside the code**: lower the anonymous sign in rate limit to 10 per hour in the dashboard and in `supabase/config.toml`; set the Anthropic console monthly spend limit. Record both, with the date, in scope feature 40. Satisfies **AC-13**.
11. **Retire the old function**: after the new function has served traffic for at least a day with no errors, a migration running `drop function if exists public.reserve_ai_generation_quota(uuid, date, int)`. Satisfies **AC-4** (one reservation path only).

## Migration plan

**Strategy**: strangler (new tables and reservation function sit beside the old one; the Edge Function switches over in one deploy; the old function is dropped last).
**Phases**:
1. Task 2 migration adds the new tables and function. Nothing calls them yet; the live function keeps using `reserve_ai_generation_quota`.
2. Set `IP_HASH_SECRET`, then deploy the new Edge Function (task 4). Existing `ai_generation_quota` rows carry over, so today's counts stay correct across the switch. Old clients keep working: a 429 is still a 429 with `resetsAt`, and the new fields are only additions.
3. Ship the client messages (tasks 5 to 7).
4. Task 11 drops the old function.
**Rollback**: redeploy the previous Edge Function version (phases 1 to 3 leave `reserve_ai_generation_quota` in place, so the old code runs unchanged). The new tables are harmless if unused. After phase 4, rolling back also means recreating the old function from `20260907145830_reserve_ai_generation_quota_function.sql`.
**Risks**: deploying the function before setting `IP_HASH_SECRET` blocks all guests with 503 until it is set (fail closed by design; set the secret first). Choosing the wrong header in task 1 would make the IP limit forgeable, which is why task 1 tests a forged header from a real network rather than trusting docs.

## Consequences

**Positive**:
- Worst case daily AI spend is now fixed by `GLOBAL_DAILY_CAP`, whatever an attacker does, and the Anthropic spend limit backs it up even if the code has a bug.
- Minting sessions from one network gets you nothing past 20 generations a day, and lowering the sign in rate slows bulk minting that could feed other abuse (comments, photo uploads).
- Signed in users keep working through an anonymous flood, and guests are told that signing in helps, which turns a limit into a reason to sign up.
- Closes spec 0007's two open follow ups: separate limits per tier, and retention for `ai_generation_quota`.

**Negative / tradeoffs**:
- Guests sharing one IP (a campus, an office, carrier grade NAT where many phones share one address) share 20 generations a day and can block each other. Signing in is the way out.
- A distributed attacker can still push the total to 1600 each day, denying AI ideas to real guests until the UTC reset. The cap bounds cost, not availability for guests. IPv6 /64 grouping does not stop an attacker who holds a large block (a /48 is 65,536 buckets); the global cap is the real defense there.
- Releasing slots on failure is a second write on the error path; if it fails, that request's slots stay spent (reported to Sentry).
- The Sentry threshold warnings can be lost if an isolate dies right after the commit, and are skipped for the rest of the day if the constants change mid day.
- Every generation now locks one shared row (`ai_generation_daily_total`), which serializes reservations. At up to 2000 a day this is negligible, but it would need rethinking at very high volume.
- A new secret to manage, and a hashed IP that still counts as personal data, so it is now named on the privacy page.
- Guests get 5 a day instead of 10, so a real guest who liked the feature hits the wall sooner.

**Neutral**:
- The reservation function signature changes, so `database.types.ts` is regenerated.
- The 429 contract gains `reason` and `signInHelps`; spec 0007's AC-4 (a flat 10 per user) is amended by this spec's AC-1, and its "no refund on failure" rule by AC-4b.
- After a rollback to the old function, its traffic is not counted in `ai_generation_daily_total`; the global cap undercounts until the new function is back.
- A third pg_cron job joins the two existing ones.

## Follow-up

- [ ] Add a one line note to spec 0007's AC-4 pointing to spec 0034 AC-1 (per tier limits) and AC-4b (release on failure).
- [ ] If guests on shared networks complain, or if the anonymous share is being used up daily, revisit with a Cloudflare Turnstile token on the generate call (the runner up option) for guests only.
- [ ] Revisit `GLOBAL_DAILY_CAP` once there is a month of real usage data; the Sentry warnings in AC-9 are the signal.
- [ ] Update `supabase/AGENTS.md` (via `/sync`) for the new `_shared/` folder and the new cleanup cron.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
