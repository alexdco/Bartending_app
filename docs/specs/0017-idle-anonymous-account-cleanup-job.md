# 0017. Idle anonymous account cleanup job

**Date**: 2026-09-09
**Status**: Proposed

## Summary

This spec adds a scheduled job that deletes anonymous guest accounts that have not been used in 30 days, so guest data does not build up forever in the database. It runs automatically once a week and only ever touches guest (anonymous) accounts, never a signed in user's account. Every run logs what it is about to delete before deleting it, and only removes a bounded number of accounts at a time as a safety limit.

## Context

Every guest gets a real Supabase (the project's backend platform) anonymous session on first launch (spec 0001, spec 0005), and that identity only stops being anonymous if the guest signs in (spec 0008). A guest who never signs in, and never comes back, leaves behind a permanent `auth.users` row plus whatever pantry and favorites rows point at it. Spec 0001 already named this as a known cost of the anonymous first design and flagged a 30 day idle cleanup job as necessary future work; spec 0008 additionally flagged, when it built sign in, that a signed in (`linked`) user must never be swept by this job once it exists, since sign in reuses the same `user_id` as the prior anonymous session and losing sight of that distinction would be catastrophic.

The job has never been built. Left undone, anonymous accounts accumulate indefinitely, which both costs more on a usage based backend bill and leaves an ever growing set of rows with no real owner. The forces at play: correctness (a linked user must be structurally unreachable by this job, not just unlikely to match), safety (account deletion is irreversible, so the job needs real observability before and during every run), and operational simplicity (this is a background job with no UI, so it should reuse infrastructure the project already runs rather than add a new one).

## Requirements

**User stories**:
- As the engineer operating this app, I want idle anonymous accounts automatically cleaned up so guest data does not accumulate indefinitely or inflate the Supabase bill.
- As a signed in user, I want my account to never be affected by this job, no matter how long I have been away.

**Acceptance criteria** (the contract, each criterion is independently checkable):
- **AC-1**: An anonymous account whose most recent sign in (or, if it has never signed in again since creation, its creation time) is more than 30 days in the past is eligible for cleanup.
- **AC-2**: A linked (non anonymous, `is_anonymous = false`) account is never selected as a candidate, regardless of how long it has been idle.
- **AC-2b**: An anonymous account that has already submitted a sign up (has a non null `email` on its `auth.users` row) but has not yet confirmed it is never selected as a candidate, even though `is_anonymous` is still `true` at that point (per spec 0008); it is treated the same as a linked account for this job's purposes.
- **AC-3**: The cleanup job runs automatically on a weekly schedule with no manual trigger required.
- **AC-4**: Each run selects at most 500 eligible accounts; any remainder past that cap is left for the next scheduled run.
- **AC-5**: Before deleting anything, each run logs the count and ids of the accounts it is about to delete.
- **AC-6**: Deleting an eligible account removes its `auth.users` row and, by existing foreign key cascade, its owned `pantry_items`, `favorites`, `user_preferences`, and `ai_generation_quota` rows.
- **AC-7**: If deleting one account in a run fails, the run continues processing the remaining accounts in that batch rather than aborting; the failed account remains eligible and is retried on the next scheduled run.
- **AC-7b**: Immediately before deleting a given candidate, the job re-checks that account is still anonymous and still unconfirmed (re-applying AC-1, AC-2, AC-2b); if it has linked or confirmed since being selected, it is skipped, not deleted.
- **AC-8**: Every run's outcome (candidates found, succeeded, failed) is logged, and any individual deletion failure is reported to Sentry (the project's error monitoring tool) with that account's id as context.
- **AC-9**: The endpoint that performs deletions rejects any request that does not present the expected credential, so it cannot be triggered by an arbitrary outside request.

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

## Decision

**Chosen option**: Option 1: pg_cron calling a dedicated Edge Function

A pg_cron job runs weekly, calls a new `cleanup-anonymous-accounts` Edge Function over HTTP (authenticated with the service role key), which reads eligible candidates from a `SECURITY DEFINER` (a Postgres function that runs with elevated privileges regardless of caller) SQL function and deletes each one through `auth.admin.deleteUser()`.

## Rationale

Option 1 wins because it matches the project's own established pattern for account deletion: spec 0008's `delete-account` feature already established that removing an `auth.users` row goes through the Auth admin API, not a raw SQL statement, specifically to avoid desyncing Auth's internal state. Option 2 would introduce a second, inconsistent way of deleting an account in the same codebase. Option 3 was rejected because pg_cron already runs inside the same Supabase project the app already operates, so reaching for an external scheduler adds a dependency and a secret to manage with no compensating benefit.

## Feature design

**Data model sketch**:
No new tables. Reads `auth.users` (existing, `id`, `is_anonymous`, `last_sign_in_at`, all already present on Supabase's built in schema), deletes via the Auth admin API, which cascades (existing foreign keys, unchanged by this spec) to `pantry_items`, `favorites`, and `user_preferences` rows owned by the deleted `user_id`.

**State transitions**:
Not applicable at the entity level (this reuses spec 0008's existing `anonymous → linked → deleted` account lifecycle); this job is simply the automated trigger for the existing `anonymous → deleted` path for accounts nobody links.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `cleanup-anonymous-accounts` (Edge Function, `verify_jwt` disabled in `config.toml` since the caller authenticates with the service role key, not a user JWT) | POST | none (no request body; pg_cron triggers it on schedule) | 200 `{ candidates, deleted, failed }` (counts; `failed` can be > 0 in a 200, since AC-7 means a partial failure is still a completed run) | service role key as a `Bearer` token in `Authorization`, compared with a constant time check against `SUPABASE_SERVICE_ROLE_KEY` | 401 if the header is missing or does not match; 405 for a non POST method (matches `delete-account`'s existing convention); 500 if the candidate selection query itself fails, before any deletion is attempted |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Candidate selection | The set of eligible account ids | A new `select_idle_anonymous_accounts()` `SECURITY DEFINER` Postgres function, querying `auth.users` where `is_anonymous = true`, `email is null` (excludes a pending, unconfirmed sign up per AC-2b), and `coalesce(last_sign_in_at, created_at) < now() - interval '30 days'`, ordered oldest first, capped at 500 rows |
| Candidate selection | The idle cutoff instant | `now()` (timestamptz, so already timezone correct) evaluated at query time inside the function; no client supplied time value |
| Pre delete re-check | Whether a given candidate is still eligible right before deletion | A second, per id call to the same `select_idle_anonymous_accounts()` filter logic (a `is_candidate_still_idle(id uuid)` function reusing the same `WHERE` predicate scoped to one id), guarding the gap between selection and deletion (AC-7b) |
| Cron invocation | The retention window (30 days) | A literal in the `select_idle_anonymous_accounts()` function body (this spec's confirmed decision, not a runtime input) |
| Cron invocation | The schedule (weekly) | The `cron.schedule(...)` call in the migration that registers the job |
| Edge Function call | The credential proving the caller is the scheduled job, not an outsider | The service role key, stored via `vault.create_secret()` (Supabase Vault) and read inside the cron job body via `vault.decrypted_secrets`, passed as a `Bearer` token in the `net.http_post` call's `Authorization` header; the Edge Function compares the header's token against `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")` using a constant time comparison |
| Per run log | Candidate count, ids, succeeded count, failed count | Computed in the Edge Function from the `select_idle_anonymous_accounts()` result and the outcome of each `auth.admin.deleteUser()` call; written to `console.log`/`console.error` (captured in the Edge Function's Supabase log stream, the same sink `delete-account` and `generate-drink-idea` already rely on) plus a Sentry breadcrumb per run and `Sentry.captureException` per failed deletion |

**Key invariants**:
- A row is only ever a cleanup candidate when `is_anonymous = true` and `email is null`; a `linked` or pending-confirmation account is structurally excluded by the `WHERE` clause, not by an application level check.
- No candidate is deleted without a fresh re-check of that same predicate immediately beforehand (AC-7b); selection and deletion are never treated as one atomic moment.
- No single run deletes more than 500 accounts.
- A failed individual deletion never stops the rest of that run's batch.

**Security model**:
- The `cleanup-anonymous-accounts` Edge Function only accepts requests whose `Authorization` header presents the project's service role key as a `Bearer` token, compared with a constant time check; any other request gets a 401.
- `select_idle_anonymous_accounts()` and `is_candidate_still_idle()` are `SECURITY DEFINER` (so they can read `auth.users`, which normal client roles cannot), created with `set search_path = ''` (prevents search path hijacking, this project's existing convention per the `set_updated_at` function hardening in the data model migration), owned by the migration role (`postgres`, the same owner every other function in this project already has). `EXECUTE` on both is revoked from `anon` and `authenticated` immediately after creation, so only the service role (used exclusively by the Edge Function, never called through PostgREST) can invoke them.
- No end user (anonymous or linked) can trigger, see, or influence this job; it runs only from the scheduled pg_cron trigger.

**Configuration required**:
- No new environment variable is added beyond what already exists (`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, already present for `delete-account`); the service role key is additionally stored via `vault.create_secret()` (Supabase Vault) so the pg_cron/pg_net job can read it at schedule time without hardcoding it in migration SQL.
- The `pg_cron` and `pg_net` Postgres extensions must be enabled on the project (neither is enabled today); this is a build step, not a manual prerequisite.

**Critical test scenarios**:
- Happy path: an anonymous account idle for 31 days is deleted, and its pantry/favorites rows are gone, verifies **AC-1**, **AC-6**
- Exclusion: a linked account idle for 400 days is never selected as a candidate, verifies **AC-2**
- Batch cap: with 600 eligible accounts, exactly 500 are deleted in one run and 100 remain for the next run, verifies **AC-4**
- Partial failure: one account's deletion fails (simulated), the run still deletes the rest of the batch and logs the one failure to Sentry, verifies **AC-7**, **AC-8**
- Auth/permission: a request to the Edge Function with a missing or wrong `Authorization` header is rejected with 401 and deletes nothing, verifies **AC-9**

## Build plan

1. Migration: enable the `pg_cron` and `pg_net` extensions (not enabled on the project today), satisfies **AC-3**
2. Migration: `select_idle_anonymous_accounts()` and `is_candidate_still_idle(id uuid)` `SECURITY DEFINER` SQL functions (shared predicate: `is_anonymous = true`, `email is null`, `coalesce(last_sign_in_at, created_at)` older than 30 days; the first capped at 500 rows ordered oldest first, the second scoped to one id), both created with `set search_path = ''` and `EXECUTE` revoked from `anon`/`authenticated`, satisfies **AC-1**, **AC-2**, **AC-2b**, **AC-4**, **AC-7b**
3. Migration: `vault.create_secret()` for the service role key, then register the weekly pg_cron job (`cron.schedule`) that calls the Edge Function via `net.http_post` with that secret as a `Bearer` token, satisfies **AC-3**, **AC-9**
4. `cleanup-anonymous-accounts` Edge Function (`verify_jwt` disabled in `config.toml`): verify the `Authorization` header with a constant time comparison, call `select_idle_anonymous_accounts()`, log the candidate count and ids, then loop over candidates calling `is_candidate_still_idle()` immediately before `auth.admin.deleteUser()` for each, continuing past individual failures and reporting each to Sentry, satisfies **AC-5**, **AC-6**, **AC-7**, **AC-7b**, **AC-8**, **AC-9**
5. Deploy the Edge Function and confirm the pg_cron job is registered against the live project, satisfies **AC-3**

## Consequences

**Positive**:
- Anonymous accounts no longer accumulate indefinitely; guest data has a bounded lifetime once idle.
- Follows the same deletion mechanism (`auth.admin.deleteUser`) as the existing user initiated delete account flow, so there is only one way accounts are ever removed.

**Negative / tradeoffs**:
- A guest who returns after more than 30 days away permanently loses their pantry and favorites with no recovery path; this is the accepted tradeoff of an idle cleanup job and matches the number spec 0001 already floated.
- Weekly cadence means an eligible account can sit up to roughly a week past its 30 day window before actually being deleted.

**Neutral**:
- Introduces pg_cron and pg_net to the project for the first time; both are standard Supabase managed extensions, not new external infrastructure.

## Follow-up

- [ ] Confirm the Supabase Vault secret (service role key) and the pg_cron job registration in the live project once the migration is applied, since no MCP tool here can verify a scheduled job actually fired.
- [ ] pg_cron records every run's outcome (success or error) in `cron.job_run_details`, but nothing alerts if the job silently stops firing (a bad Vault secret, an unreachable function). Consider a periodic check (or a Sentry cron monitor) that flags zero runs in a given window; not required for the initial build, since the per run Sentry reporting already covers the more likely failure mode (individual delete failures within a run that does fire).
