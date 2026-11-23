-- Hand run database checks for spec 0064 build plan task 8 (screening).
-- Paste into the Supabase SQL editor after applying
-- 20261122150000_recipe_submission_screening.sql.
--
-- Runs inside begin ... rollback. The DO block always ends by raising an
-- exception, so everything it seeds is rolled back, and the pg_net requests
-- the triggers queue are rolled back with it (no real function call). The
-- exception message IS the report: a PASS/FAIL line per check. The service
-- role functions run here as postgres, the way the Edge Function's secret
-- key reaches them.
-- Spec: docs/specs/0064-user-submitted-recipes/index.md

begin;

create function pg_temp.try_as(p_role text, p_claims jsonb, p_sql text)
returns text
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', p_claims::text, true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
  exception when others then
    execute 'reset role';
    return sqlerrm;
  end;
  execute 'reset role';
  return 'ok';
end;
$$;

create function pg_temp.claims(p_user uuid)
returns jsonb
language sql
as $$
  select jsonb_build_object('sub', p_user, 'role', 'authenticated', 'is_anonymous', false);
$$;

do $check$
declare
  v_report text := '';
  v_author uuid := gen_random_uuid();
  v_sub uuid := gen_random_uuid();
  v_sub2 uuid := gen_random_uuid();
  v_res text;
  v_n int;
  v_updated timestamptz;
  v_submitted timestamptz;
  v_old_submitted timestamptz;
  v_result text;
  v_queued_before bigint;
  v_queued_after bigint;
  v_ing constant text := '''[{"name":"Gin","measure":"2 oz"}]''::jsonb';
begin
  insert into auth.users (id, aud, role, email, is_anonymous, created_at, updated_at)
  values (v_author, 'authenticated', 'authenticated', 'screening-check-author@example.invalid', false, now(), now());
  insert into public.user_preferences (user_id, display_name) values (v_author, 'Sam')
  on conflict (user_id) do update set display_name = excluded.display_name;

  -- Invariant 9: a save that enters pending queues one screening request.
  select count(*) into v_queued_before from net.http_request_queue;
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_author), format(
    $q$select public.save_recipe_submission(%L, 'Screen Sour', %s, 'Shake.', null, 'alcoholic', null, null, 'en', null)$q$,
    v_sub, v_ing));
  select count(*) into v_queued_after from net.http_request_queue;
  v_report := v_report || format(E'\n%s Invariant 9 a new submission queues one screening request (%s, +%s)',
    case when v_res = 'ok' and v_queued_after = v_queued_before + 1 then 'PASS' else 'FAIL' end,
    v_res, v_queued_after - v_queued_before);

  select s.updated_at, s.submitted_at into v_updated, v_submitted
  from public.recipe_submissions s where s.id = v_sub;

  -- Clients can't reach the service role functions.
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_author),
    $q$select * from public.claim_pending_recipe_submissions(null, 10)$q$);
  v_report := v_report || format(E'\n%s AC-23 an author can''t call the claim function (%s)',
    case when v_res like '%permission denied%' then 'PASS' else 'FAIL' end, v_res);

  -- Trigger mode claims that one row and stamps the lease; a second claim gets nothing.
  select count(*) into v_n from public.claim_pending_recipe_submissions(v_sub, 10) c
  where c.id = v_sub and c.submitted_at = v_submitted;
  v_report := v_report || format(E'\n%s AC-9 trigger mode claims the row with its submitted_at',
    case when v_n = 1 then 'PASS' else 'FAIL' end);
  select count(*) into v_n from public.claim_pending_recipe_submissions(v_sub, 10);
  v_report := v_report || format(E'\n%s AC-9 a leased row is not claimed twice (%s)',
    case when v_n = 0 then 'PASS' else 'FAIL' end, v_n);

  -- Screening writes never move updated_at (the AC-14 token) or re-fire the trigger.
  select count(*) into v_queued_before from net.http_request_queue;
  v_result := public.record_recipe_submission_screening(v_sub, v_submitted, 'failed', null, null, 'Screening failed (api_500).');
  select count(*) into v_queued_after from net.http_request_queue;
  select count(*) into v_n from public.recipe_submissions s
  where s.id = v_sub and s.updated_at = v_updated and s.screening_attempts = 1
    and s.text_screening = 'pending' and s.screening_claimed_at is null and s.screening_note is null;
  v_report := v_report || format(E'\n%s AC-9 first failure counts an attempt, stays pending, keeps updated_at, queues nothing (%s)',
    case when v_result = 'pending' and v_n = 1 and v_queued_after = v_queued_before then 'PASS' else 'FAIL' end, v_result);

  v_result := public.record_recipe_submission_screening(v_sub, v_submitted, 'failed', null, null, 'Screening failed (api_500).');
  v_result := public.record_recipe_submission_screening(v_sub, v_submitted, 'failed', null, null, 'Screening failed (timeout).');
  select count(*) into v_n from public.recipe_submissions s
  where s.id = v_sub and s.text_screening = 'error' and s.photo_screening is null
    and s.screening_attempts = 3 and s.status = 'pending'
    and s.screening_note = 'Screening failed (timeout).';
  v_report := v_report || format(E'\n%s AC-9 third failure sets error, status stays pending (%s)',
    case when v_result = 'error' and v_n = 1 then 'PASS' else 'FAIL' end, v_result);

  -- AC-6 + AC-9: a resubmit resets screening, fires the update trigger once.
  v_old_submitted := v_submitted;
  select count(*) into v_queued_before from net.http_request_queue;
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_author), format(
    $q$select public.save_recipe_submission(%L, 'Screen Sour v2', %s, 'Shake hard.', null, 'alcoholic', null, null, 'en', null)$q$,
    v_sub, v_ing));
  select count(*) into v_queued_after from net.http_request_queue;
  select s.submitted_at into v_submitted from public.recipe_submissions s where s.id = v_sub;
  select count(*) into v_n from public.recipe_submissions s
  where s.id = v_sub and s.text_screening = 'pending' and s.screening_attempts = 0 and s.screening_note is null;
  v_report := v_report || format(E'\n%s AC-9 an edit resets screening and queues one request (%s, +%s)',
    case when v_res = 'ok' and v_n = 1 and v_queued_after = v_queued_before + 1 then 'PASS' else 'FAIL' end,
    v_res, v_queued_after - v_queued_before);

  -- AC-9 race: a late result for the old version is discarded.
  v_result := public.record_recipe_submission_screening(v_sub, v_old_submitted, 'screened', 'flagged', null, 'Old version.');
  select count(*) into v_n from public.recipe_submissions s
  where s.id = v_sub and s.text_screening = 'pending' and s.screening_note is null;
  v_report := v_report || format(E'\n%s AC-9 a result for an older version is discarded (%s)',
    case when v_result is null and v_n = 1 then 'PASS' else 'FAIL' end, coalesce(v_result, 'null'));

  -- A flagged result records the note and never changes status (invariant 5).
  v_result := public.record_recipe_submission_screening(v_sub, v_submitted, 'screened', 'flagged', null, '  Contains a promo link.  ');
  select count(*) into v_n from public.recipe_submissions s
  where s.id = v_sub and s.text_screening = 'flagged' and s.status = 'pending'
    and s.screening_note = 'Contains a promo link.';
  v_report := v_report || format(E'\n%s AC-9 flagged result sets text_screening and a trimmed note, status untouched (%s)',
    case when v_result = 'flagged' and v_n = 1 then 'PASS' else 'FAIL' end, v_result);

  -- AC-23: the author's own reads never carry screening fields.
  select count(*) into v_n
  from pg_proc p
  where p.proname in ('fetch_my_recipe_submission', 'fetch_my_recipe_submissions')
    and pg_get_function_result(p.oid) ~ '(screening|screening_note)';
  v_report := v_report || format(E'\n%s AC-23 author functions return no screening columns (%s)',
    case when v_n = 0 then 'PASS' else 'FAIL' end, v_n);

  -- AC-9 ceiling: reserve stops at the cap; a skipped row still reaches the queue.
  delete from public.recipe_screening_daily_total where day = (now() at time zone 'utc')::date;
  v_report := v_report || format(E'\n%s AC-9 reserve under the cap succeeds, at the cap fails (%s/%s)',
    case when public.reserve_recipe_screening(1) and not public.reserve_recipe_screening(1) then 'PASS' else 'FAIL' end,
    'first', 'second');

  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_author), format(
    $q$select public.save_recipe_submission(%L, 'Skip Sour', %s, 'Stir.', null, 'alcoholic', null, null, 'en', null)$q$,
    v_sub2, v_ing));
  select s.submitted_at into v_submitted from public.recipe_submissions s where s.id = v_sub2;
  v_result := public.record_recipe_submission_screening(v_sub2, v_submitted, 'skipped');
  select count(*) into v_n from public.recipe_submissions s
  where s.id = v_sub2 and s.text_screening = 'skipped' and s.status = 'pending';
  v_report := v_report || format(E'\n%s AC-9 past the ceiling a submission is skipped and stays pending (%s)',
    case when v_result = 'skipped' and v_n = 1 then 'PASS' else 'FAIL' end, v_result);

  -- Sweep mode skips rows saved under 2 minutes ago (the trigger has them).
  select count(*) into v_n from public.claim_pending_recipe_submissions(null, 50) c where c.id = v_sub2;
  v_report := v_report || format(E'\n%s AC-9 sweep leaves a just saved row to its trigger (%s)',
    case when v_n = 0 then 'PASS' else 'FAIL' end, v_n);

  -- The cron job exists.
  select count(*) into v_n from cron.job j
  where j.jobname = 'screen-recipe-submissions' and j.schedule = '*/5 * * * *';
  v_report := v_report || format(E'\n%s AC-9 the 5 minute sweep cron is scheduled',
    case when v_n = 1 then 'PASS' else 'FAIL' end);

  raise exception 'recipe_submission_screening_check report:%', v_report;
end;
$check$;

rollback;
