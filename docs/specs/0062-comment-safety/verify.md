# Verify: comment safety · spec 0062 · updated 2026-11-18
_Steps derived from spec 0062 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Milestone 1 (screening thread). Before you start: `supabase/migrations/20261118130000_comment_safety_screening.sql` is applied and `screen-comment-photo` is deployed. You need two signed in accounts (the author and a second account) plus a guest window.

## Commands
- [ ] Paste `supabase/tests/comment_safety_screening_check.sql` into the SQL editor → the report (raised as an error, everything rolled back) shows PASS on all 16 lines → AC-1, AC-2, AC-3, AC-4, AC-5, AC-16
- [ ] `pnpm test` passes, including `supabase/functions/screen-comment-photo/screening-verdict.test.ts` and `packages/shared/src/moderation.test.ts` → AC-2, AC-3
- [ ] SQL: `select moderation_status, count(*) from comment_photos where created_at < '2026-11-19' group by 1` → every photo from before the migration is `approved` → AC-1
- [ ] SQL: `select has_column_privilege('anon', 'public.comment_photos', 'flag_categories', 'select')` → false → AC-16, invariant 2a

## UI / manual: web
- [ ] As the author, post a comment with text and one photo of a drink → the photo shows right away with a "Checking photo" caption under it → AC-1
- [ ] Within about a minute, without reloading → the caption disappears (the list refetches every 15 seconds while a photo is pending) → AC-2
- [ ] SQL: `select moderation_status, screened_at, screening_attempts from comment_photos order by created_at desc limit 1` → `approved`, `screened_at` set, attempts 0 → AC-2
- [ ] In the guest window, open the same recipe while the photo is still pending (post a second photo and look within seconds) → the comment text shows, the photo does not → AC-1
- [ ] As the author, post a photo only comment, then open the recipe as a guest within seconds → the comment is not shown at all, no empty card → AC-5
- [ ] As the second account, after screening passes → the photo shows with no caption → AC-2
- [ ] In the SQL editor, set a photo to flagged by hand: `update comment_photos set moderation_status = 'flagged', flag_reason = 'screening', flagged_at = now() where id = '<id>'` → the author sees "Hidden while under review" under it; the second account and the guest do not see it → AC-10
- [ ] View source of the recipe page as a guest while a photo is pending → no `comment-photos/<that path>` URL in the HTML or the JSON-LD → AC-16
- [ ] Edit the alt text of an approved photo → it stays approved, no "Checking photo" caption, no new screening call (usage count for today unchanged) → invariant 3

## Failure paths (Value sourcing and risks)
- [ ] Set the Edge Function secret `ANTHROPIC_API_KEY` to a wrong value, post a photo → it stays pending; after 3 cron runs (about 15 minutes) `screening_attempts = 3`, `moderation_status = 'flagged'`, `flag_reason = 'screening_failed'`, and Sentry shows a "comment photo flagged" warning with the photo id only. Restore the key afterwards → AC-3, AC-13
- [ ] SQL: `insert into photo_screening_usage (day, calls) values ((now() at time zone 'utc')::date, 2000) on conflict (day) do update set calls = 2000`, then post a photo → it stays pending, `screening_attempts` stays 0, Sentry shows "daily cap reached". Reset with `update photo_screening_usage set calls = 0 where day = (now() at time zone 'utc')::date` → the next cron run screens it → AC-4
- [ ] Check the day boundary: the cap row's `day` is the UTC date, not your local date (post near local midnight, or compare `select (now() at time zone 'utc')::date`) → AC-4, Value sourcing "today"
- [ ] SQL: `select status_code, content from net._http_response order by created desc limit 5` after a post → 200 responses with `{"screened":1,...}`, no 401 → AC-2, invariant 11

## Acceptance-criteria coverage
- AC-1: check script lines 1 to 4, backfill SQL, author caption, guest window
- AC-2: check script lines 8 to 11 and 15, caption clears, second account sees photo, pg_net responses
- AC-3: check script lines 12 and 13, wrong Anthropic key path
- AC-4: check script line 14, cap path, UTC day check
- AC-5: check script line 2, photo only comment as guest
- AC-10: hand flagged photo shows the author note (comment level note is exercised by the reports milestone)
- AC-13: Sentry warning on the failure path
- AC-16: check script lines 5 to 7, column privilege SQL, view source
- AC-6 to AC-9, AC-11, AC-12, AC-14, AC-15, AC-17, AC-18: later milestones
