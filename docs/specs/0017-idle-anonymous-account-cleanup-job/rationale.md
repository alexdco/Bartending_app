# 0017. Idle anonymous account cleanup job — rationale

## Context

Every guest gets a real Supabase (the project's backend platform) anonymous session on first launch (spec 0001, spec 0005), and that identity only stops being anonymous if the guest signs in (spec 0008). A guest who never signs in, and never comes back, leaves behind a permanent `auth.users` row plus whatever pantry and favorites rows point at it. Spec 0001 already named this as a known cost of the anonymous first design and flagged a 30 day idle cleanup job as necessary future work; spec 0008 additionally flagged, when it built sign in, that a signed in (`linked`) user must never be swept by this job once it exists, since sign in reuses the same `user_id` as the prior anonymous session and losing sight of that distinction would be catastrophic.

The job has never been built. Left undone, anonymous accounts accumulate indefinitely, which both costs more on a usage based backend bill and leaves an ever growing set of rows with no real owner. The forces at play: correctness (a linked user must be structurally unreachable by this job, not just unlikely to match), safety (account deletion is irreversible, so the job needs real observability before and during every run), and operational simplicity (this is a background job with no UI, so it should reuse infrastructure the project already runs rather than add a new one).

## Options considered

### Option 1: pg_cron calling a dedicated Edge Function

A Postgres extension called pg_cron (scheduling built into the same Supabase project, no external service) fires on a schedule and calls a new Supabase Edge Function (the same serverless function mechanism `delete-account` and `generate-drink-idea` already use) over HTTP via pg_net (Postgres's built in HTTP client extension). The Edge Function calls Supabase Auth's admin API to delete each eligible user by id.

**Pros**:
- Reuses infrastructure the project already runs (Supabase, Edge Functions, pg_cron/pg_net are both standard Supabase extensions); no new service to operate.
- Deleting through the Auth admin API (`auth.admin.deleteUser`) keeps Auth's internal state consistent, the same approach `delete-account` (spec 0008) already uses instead of a raw SQL delete.

**Cons**:
- Two hops (Postgres schedule to HTTP call to Edge Function to Auth admin API) instead of one, slightly more moving parts than pure SQL.

### Option 2: pg_cron running pure SQL against auth.users

pg_cron runs a SQL function directly against `auth.users` on a schedule, deleting rows with a plain `DELETE` statement.

**Pros**:
- Fewest moving parts: no Edge Function, no HTTP hop, everything happens inside Postgres.

**Cons**:
- A raw `DELETE` on `auth.users` bypasses Supabase Auth's own admin API and can desync Auth's internal bookkeeping; this is exactly what spec 0008's `delete-account` feature deliberately avoided by calling `auth.admin.deleteUser()` instead of deleting the row directly. Using a different, riskier method here for the same kind of operation would be inconsistent and worse.

### Option 3: External scheduler calling an Edge Function

A third party cron service (for example a scheduled GitHub Actions workflow) calls the Edge Function over HTTP on a timer.

**Pros**:
- Decouples scheduling from the Supabase project; visible in a separate system if that is ever wanted.

**Cons**:
- Adds an external dependency and a webhook secret to manage for a capability (pg_cron) the project's own backend already provides for free; no stated need justifies the extra moving part.

## Rationale

Option 1 wins because it matches the project's own established pattern for account deletion: spec 0008's `delete-account` feature already established that removing an `auth.users` row goes through the Auth admin API, not a raw SQL statement, specifically to avoid desyncing Auth's internal state. Option 2 would introduce a second, inconsistent way of deleting an account in the same codebase. Option 3 was rejected because pg_cron already runs inside the same Supabase project the app already operates, so reaching for an external scheduler adds a dependency and a secret to manage with no compensating benefit.
