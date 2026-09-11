# Verify: idle anonymous account cleanup job · spec 0017 · updated 2026-09-11

_Steps derived from spec 0017 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

_No UI surface; this is a background job with no client visible behavior._

## Commands

- [ ] `select * from cron.job where jobname = 'idle-anonymous-account-cleanup';` → one row, `active = true`, `schedule = '0 6 * * 1'` → AC-3
- [ ] Set the real service role key in Vault (`vault.update_secret`, per the note in `20260911133702_register_idle_anonymous_account_cleanup_cron.sql`), still a manual step as of this build → AC-9
- [ ] `select cron.schedule(...)` manual trigger, or wait for the next Monday run, then check `select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'idle-anonymous-account-cleanup') order by start_time desc limit 1;` → `status = 'succeeded'` → AC-3
- [ ] Create a test anonymous user with `last_sign_in_at` (or `created_at`, if never re-signed-in) more than 30 days ago, no `email` set → run the job → row is gone from `auth.users`, and any `pantry_items`/`favorites`/`user_preferences`/`ai_generation_quota` rows owned by that `user_id` are gone too (cascade) → AC-1, AC-6
- [ ] Create a linked (non anonymous) test user idle 400+ days → run the job → row still present in `auth.users` → AC-2
- [ ] Create an anonymous test user with a non null `email` (started sign up, unconfirmed), idle 400+ days → run the job → row still present → AC-2b
- [ ] Create 600 eligible test accounts → run the job once → exactly 500 deleted, 100 remain eligible for the next run (`select count(*) from (select * from public.select_idle_anonymous_accounts()) t;` before and after) → AC-4
- [ ] Check Edge Function logs for a run → a log line lists the candidate count and ids before any deletion happens → AC-5
- [ ] Simulate one candidate's deletion failing (e.g. temporarily revoke `auth.admin.deleteUser` access, or pick an id that errors) → the run still processes and deletes the rest of the batch; the failed id remains selectable by `select_idle_anonymous_accounts()` afterward → AC-7
- [ ] Immediately before a candidate is deleted, have it link (sign in) or confirm its email in another session mid run → that candidate is skipped, not deleted → AC-7b
- [ ] Check the run's log output and Sentry → a summary log (`candidates`, `deleted`, `failed` counts) per run, and a `captureException` entry with the account id as context for the simulated AC-7 failure → AC-8
- [ ] `curl -X POST <function-url>/cleanup-anonymous-accounts` with no `Authorization` header → 401, nothing deleted → AC-9
- [ ] `curl -X POST <function-url>/cleanup-anonymous-accounts -H "Authorization: Bearer wrong-token"` → 401, nothing deleted → AC-9
- [ ] `curl -X POST <function-url>/cleanup-anonymous-accounts -H "Authorization: Bearer <real service role key>"` → 200 `{ candidates, deleted, failed }` → AC-9

## Value sourcing coverage

- [ ] Candidate set: verify `select_idle_anonymous_accounts()` returns only rows matching `is_anonymous = true`, `email is null`, idle > 30 days, capped at 500, oldest first → AC-1, AC-2, AC-2b, AC-4
- [ ] Idle cutoff instant: confirm the 30 day cutoff is computed by `now()` inside the SQL function at query time (not passed in from the client) → vary the DB session's local time zone and confirm the cutoff is unaffected (timestamptz is UTC internally) → AC-1
- [ ] Pre delete re-check: confirm `is_candidate_still_idle(id)` is called once per candidate, immediately before `auth.admin.deleteUser`, using the exact same predicate as selection → AC-7b
- [ ] Credential: confirm the Edge Function compares the presented Bearer token against `SUPABASE_SERVICE_ROLE_KEY` (not the anon key or a different secret) → AC-9

## Acceptance-criteria coverage

- AC-1 … cron.job row + happy path deletion + value sourcing step · AC-2 … linked account exclusion step · AC-2b … pending confirmation exclusion step · AC-3 … cron.job row + job_run_details step · AC-4 … batch cap step · AC-5 … Edge Function log step · AC-6 … cascade check in happy path step · AC-7 … partial failure step · AC-7b … re-check step (both manual and value sourcing) · AC-8 … log + Sentry step · AC-9 … three curl auth steps
