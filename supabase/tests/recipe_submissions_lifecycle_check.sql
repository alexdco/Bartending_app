-- Hand run database checks for spec 0064 build plan task 5 (author lifecycle).
-- Paste into the Supabase SQL editor after applying
-- 20261122130000_recipe_submissions_lifecycle.sql.
--
-- Runs inside begin ... rollback. The DO block always ends by raising an
-- exception, so everything it seeds is rolled back. The exception message IS
-- the report: a PASS/FAIL line per check. The admin is the first existing
-- user_preferences row with is_admin.
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

create function pg_temp.claims(p_user uuid, p_anonymous boolean default false)
returns jsonb
language sql
as $$
  select jsonb_build_object('sub', p_user, 'role', 'authenticated', 'is_anonymous', p_anonymous);
$$;

do $check$
declare
  v_report text := '';
  v_author uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_admin uuid;
  v_sub uuid := gen_random_uuid();
  v_sub2 uuid := gen_random_uuid();
  v_res text;
  v_n int;
  v_updated timestamptz;
  v_submitted timestamptz;
  v_usage int;
  v_ing constant text := '''[{"name":"Gin","measure":"2 oz"}]''::jsonb';
begin
  select up.user_id into v_admin from public.user_preferences up where up.is_admin limit 1;
  if v_admin is null then
    raise exception 'no admin user found; this check needs one';
  end if;

  insert into auth.users (id, aud, role, email, is_anonymous, created_at, updated_at)
  values
    (v_author, 'authenticated', 'authenticated', 'lifecycle-check-author@example.invalid', false, now(), now()),
    (v_other, 'authenticated', 'authenticated', 'lifecycle-check-other@example.invalid', false, now(), now());
  insert into public.user_preferences (user_id, display_name) values (v_author, 'Sam'), (v_other, 'Kim')
  on conflict (user_id) do update set display_name = excluded.display_name;

  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_author), format(
    $q$select public.save_recipe_submission(%L, 'Lifecycle Sour', %s, 'Shake.', null, 'alcoholic', null, null, 'ja', null)$q$,
    v_sub, v_ing));
  select s.updated_at, s.submitted_at into v_updated, v_submitted
  from public.recipe_submissions s where s.id = v_sub;

  -- AC-13: reject needs a reason of 1 to 500 characters.
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_admin), format(
    $q$select public.admin_reject_recipe_submission(%L, '   ', %L)$q$, v_sub, v_updated));
  v_report := v_report || format(E'\n%s AC-13 blank reason gets invalid_reason (%s)',
    case when v_res = 'invalid_reason' then 'PASS' else 'FAIL' end, v_res);
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_admin), format(
    $q$select public.admin_reject_recipe_submission(%L, %L, %L)$q$, v_sub, repeat('r', 501), v_updated));
  v_report := v_report || format(E'\n%s AC-13 501 character reason gets invalid_reason (%s)',
    case when v_res = 'invalid_reason' then 'PASS' else 'FAIL' end, v_res);

  -- AC-23: a non admin can't reject.
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_other), format(
    $q$select public.admin_reject_recipe_submission(%L, 'No.', %L)$q$, v_sub, v_updated));
  v_report := v_report || format(E'\n%s AC-23 non admin reject gets not_admin (%s)',
    case when v_res = 'not_admin' then 'PASS' else 'FAIL' end, v_res);

  -- AC-14: a wrong updated_at is stale and writes nothing.
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_admin), format(
    $q$select public.admin_reject_recipe_submission(%L, 'No.', %L)$q$, v_sub, v_updated - interval '1 second'));
  select count(*) into v_n from public.recipe_submissions s where s.id = v_sub and s.status = 'pending';
  v_report := v_report || format(E'\n%s AC-14 stale updated_at gets stale, still pending (%s)',
    case when v_res = 'stale' and v_n = 1 then 'PASS' else 'FAIL' end, v_res);

  -- AC-13: a valid reject sets status, reason, reviewed_at.
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_admin), format(
    $q$select public.admin_reject_recipe_submission(%L, '  Needs a measure for the gin.  ', %L)$q$, v_sub, v_updated));
  select count(*) into v_n from public.recipe_submissions s
  where s.id = v_sub and s.status = 'rejected' and s.rejection_reason = 'Needs a measure for the gin.'
    and s.reviewed_at is not null and s.updated_at > v_updated;
  v_report := v_report || format(E'\n%s AC-13 reject sets status, trimmed reason, reviewed_at, new updated_at (%s)',
    case when v_res = 'ok' and v_n = 1 then 'PASS' else 'FAIL' end, v_res);

  -- AC-14: rejecting a row that is no longer pending is stale.
  select s.updated_at into v_updated from public.recipe_submissions s where s.id = v_sub;
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_admin), format(
    $q$select public.admin_reject_recipe_submission(%L, 'Again.', %L)$q$, v_sub, v_updated));
  v_report := v_report || format(E'\n%s AC-14 reject of a rejected row gets stale (%s)',
    case when v_res = 'stale' then 'PASS' else 'FAIL' end, v_res);

  -- AC-13: the author reads the reason.
  perform set_config('request.jwt.claims', pg_temp.claims(v_author)::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.fetch_my_recipe_submissions() m
  where m.id = v_sub and m.status = 'rejected' and m.rejection_reason = 'Needs a measure for the gin.';
  execute 'reset role';
  v_report := v_report || format(E'\n%s AC-13 author sees the rejection reason',
    case when v_n = 1 then 'PASS' else 'FAIL' end);

  -- AC-6: edit and resubmit puts it back to pending, clears the reason and
  -- reviewed_at, resets submitted_at, keeps locale, and counts toward the day.
  select u.count into v_usage from public.recipe_submission_usage u
  where u.user_id = v_author and u.day = (now() at time zone 'utc')::date;
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_author), format(
    $q$select public.save_recipe_submission(%L, 'Lifecycle Sour', '[{"name":"Gin","measure":"2 oz"},{"name":"Lemon","measure":"1 oz"}]'::jsonb, 'Shake hard.', null, 'alcoholic', null, null, 'en', null)$q$,
    v_sub));
  select count(*) into v_n from public.recipe_submissions s
  where s.id = v_sub and s.status = 'pending' and s.rejection_reason is null and s.reviewed_at is null
    and s.submitted_at > v_submitted and s.locale = 'ja' and s.text_screening = 'pending'
    and s.instructions = 'Shake hard.';
  v_report := v_report || format(E'\n%s AC-6 resubmit is pending, reason cleared, new submitted_at, locale kept (%s)',
    case when v_res = 'ok' and v_n = 1 then 'PASS' else 'FAIL' end, v_res);
  select count(*) into v_n from public.recipe_submission_usage u
  where u.user_id = v_author and u.day = (now() at time zone 'utc')::date and u.count = v_usage + 1;
  v_report := v_report || format(E'\n%s AC-6 resubmit counts toward the daily limit',
    case when v_n = 1 then 'PASS' else 'FAIL' end);

  -- AC-14: the admin's earlier token is now stale for approve and reject.
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_admin), format(
    $q$select public.admin_reject_recipe_submission(%L, 'No.', %L)$q$, v_sub, v_updated));
  v_report := v_report || format(E'\n%s AC-14 reject with the pre edit token gets stale (%s)',
    case when v_res = 'stale' then 'PASS' else 'FAIL' end, v_res);

  -- AC-6: withdraw. Another user's id reads as not_found and deletes nothing.
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_other), format(
    $q$select public.withdraw_recipe_submission(%L)$q$, v_sub));
  select count(*) into v_n from public.recipe_submissions s where s.id = v_sub;
  v_report := v_report || format(E'\n%s AC-6 withdraw of another user''s row gets not_found (%s)',
    case when v_res = 'not_found' and v_n = 1 then 'PASS' else 'FAIL' end, v_res);

  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_author, true), format(
    $q$select public.withdraw_recipe_submission(%L)$q$, v_sub));
  v_report := v_report || format(E'\n%s AC-4 anonymous withdraw gets anonymous (%s)',
    case when v_res = 'anonymous' then 'PASS' else 'FAIL' end, v_res);
  v_report := v_report || format(E'\n%s AC-4 anon role has no execute on withdraw',
    case when not has_function_privilege('anon', 'public.withdraw_recipe_submission(uuid)', 'execute')
    then 'PASS' else 'FAIL' end);

  -- AC-6 + AC-18: withdraw still works while blocked; the day's count stays.
  update public.user_preferences set submissions_blocked_at = now() where user_id = v_author;
  select u.count into v_usage from public.recipe_submission_usage u
  where u.user_id = v_author and u.day = (now() at time zone 'utc')::date;
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_author), format(
    $q$select public.withdraw_recipe_submission(%L)$q$, v_sub));
  select count(*) into v_n from public.recipe_submissions s where s.id = v_sub;
  v_report := v_report || format(E'\n%s AC-6 withdraw while blocked deletes the row (%s)',
    case when v_res = 'ok' and v_n = 0 then 'PASS' else 'FAIL' end, v_res);
  select count(*) into v_n from public.recipe_submission_usage u
  where u.user_id = v_author and u.day = (now() at time zone 'utc')::date and u.count = v_usage;
  v_report := v_report || format(E'\n%s AC-5 withdraw does not lower the daily count',
    case when v_n = 1 then 'PASS' else 'FAIL' end);
  update public.user_preferences set submissions_blocked_at = null where user_id = v_author;

  -- AC-6: an approved row can't be withdrawn.
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_author), format(
    $q$select public.save_recipe_submission(%L, 'Lifecycle Fizz', %s, 'Build.', null, 'alcoholic', null, null, 'en', null)$q$,
    v_sub2, v_ing));
  select s.updated_at into v_updated from public.recipe_submissions s where s.id = v_sub2;
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_admin), format(
    $q$select public.admin_approve_recipe_submission(%L, %L, %L, 'Lifecycle Fizz', 'Build.', null, 'alcoholic', null, '[{"name":"Gin","measure":"2 oz","sortOrder":0}]'::jsonb, '[]'::jsonb)$q$,
    v_sub2, v_updated, gen_random_uuid()));
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_author), format(
    $q$select public.withdraw_recipe_submission(%L)$q$, v_sub2));
  select count(*) into v_n from public.recipe_submissions s where s.id = v_sub2 and s.status = 'approved';
  v_report := v_report || format(E'\n%s AC-6 withdraw of an approved row gets not_editable (%s)',
    case when v_res = 'not_editable' and v_n = 1 then 'PASS' else 'FAIL' end, v_res);

  raise exception E'recipe submissions lifecycle check report (rolled back):%', v_report;
end;
$check$;

rollback;
