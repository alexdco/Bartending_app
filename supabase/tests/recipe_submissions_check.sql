-- Hand run database checks for spec 0064 (user submitted recipes), migration
-- slice 1. Paste into the Supabase SQL editor after applying
-- 20261122120000_user_submitted_recipes.sql.
--
-- Runs inside begin ... rollback. The DO block always ends by raising an
-- exception, so every seeded user, submission, and recipe is rolled back.
-- The exception message IS the report: a PASS/FAIL line per check.
-- Two throwaway auth users are created (an author and a second user); the
-- admin is the first existing user_preferences row with is_admin.
-- Spec: docs/specs/0064-user-submitted-recipes/index.md

begin;

-- Runs p_sql as p_role with the given JWT claims and returns 'ok' or the error
-- message. set_config(..., true) and set local role last until the end of the
-- transaction, so each call sets both again.
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
  v_recipe uuid := gen_random_uuid();
  v_recipe_admin uuid;
  v_res text;
  v_n int;
  v_ok boolean;
  v_updated timestamptz;
  v_name text;
  v_ing constant text := '''[{"name":" Gin ","measure":"2 oz"},{"name":"Lime juice","measure":"  "}]''::jsonb';
  i int;
begin
  select up.user_id into v_admin from public.user_preferences up where up.is_admin limit 1;
  if v_admin is null then
    raise exception 'no admin user found; this check needs one';
  end if;

  insert into auth.users (id, aud, role, email, is_anonymous, created_at, updated_at)
  values
    (v_author, 'authenticated', 'authenticated', 'submissions-check-author@example.invalid', false, now(), now()),
    (v_other, 'authenticated', 'authenticated', 'submissions-check-other@example.invalid', false, now(), now());
  -- Some projects create the preferences row by trigger; make sure the author
  -- starts without a display name either way.
  insert into public.user_preferences (user_id) values (v_author), (v_other)
  on conflict (user_id) do update set display_name = null;

  -- AC-4: anonymous sessions are rejected; anon has no execute at all.
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_author, true), format(
    $q$select public.save_recipe_submission(%L, 'Test Sour', %s, 'Shake.', null, 'alcoholic', null, null, 'en', 'Sam')$q$,
    v_sub, v_ing));
  v_report := v_report || format(E'\n%s AC-4 anonymous JWT gets anonymous (%s)',
    case when v_res = 'anonymous' then 'PASS' else 'FAIL' end, v_res);
  v_report := v_report || format(E'\n%s AC-4 anon role has no execute on save',
    case when not has_function_privilege('anon',
      'public.save_recipe_submission(uuid, text, jsonb, text, text, text, text, text, text, text)', 'execute')
    then 'PASS' else 'FAIL' end);

  -- AC-3: display name required once.
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_author), format(
    $q$select public.save_recipe_submission(%L, 'Test Sour', %s, 'Shake.', null, 'alcoholic', null, null, 'en', null)$q$,
    v_sub, v_ing));
  v_report := v_report || format(E'\n%s AC-3 missing display name gets display_name_required (%s)',
    case when v_res = 'display_name_required' then 'PASS' else 'FAIL' end, v_res);

  -- AC-2: limits.
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_author), format(
    $q$select public.save_recipe_submission(%L, %L, %s, 'Shake.', null, 'alcoholic', null, null, 'en', 'Sam')$q$,
    v_sub, repeat('x', 101), v_ing));
  v_report := v_report || format(E'\n%s AC-2 101 character name gets invalid_name (%s)',
    case when v_res = 'invalid_name' then 'PASS' else 'FAIL' end, v_res);

  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_author), format(
    $q$select public.save_recipe_submission(%L, 'Test Sour', (select jsonb_agg(jsonb_build_object('name', 'Ing ' || g)) from generate_series(1, 21) g), 'Shake.', null, 'alcoholic', null, null, 'en', 'Sam')$q$,
    v_sub));
  v_report := v_report || format(E'\n%s AC-2 21 ingredients gets invalid_ingredients (%s)',
    case when v_res = 'invalid_ingredients' then 'PASS' else 'FAIL' end, v_res);

  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_author), format(
    $q$select public.save_recipe_submission(%L, 'Test Sour', %s, '   ', null, 'alcoholic', null, null, 'en', 'Sam')$q$,
    v_sub, v_ing));
  v_report := v_report || format(E'\n%s AC-2 blank instructions gets invalid_instructions (%s)',
    case when v_res = 'invalid_instructions' then 'PASS' else 'FAIL' end, v_res);

  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_author), format(
    $q$select public.save_recipe_submission(%L, 'Test Sour', %s, 'Shake.', null, 'alcoholic', %L, null, 'en', 'Sam')$q$,
    v_sub, v_ing, repeat('n', 301)));
  v_report := v_report || format(E'\n%s AC-2 301 character note gets invalid_note (%s)',
    case when v_res = 'invalid_note' then 'PASS' else 'FAIL' end, v_res);

  select count(*) into v_n from public.recipe_submissions where author_id = v_author;
  v_report := v_report || format(E'\n%s AC-2 nothing saved after failed saves (%s rows)',
    case when v_n = 0 then 'PASS' else 'FAIL' end, v_n);

  -- AC-1: a valid save is pending, trimmed, in the given locale.
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_author), format(
    $q$select public.save_recipe_submission(%L, '  Test Sour  ', %s, 'Shake.', null, 'alcoholic', null, null, 'ja', ' Sam ')$q$,
    v_sub, v_ing));
  select count(*) into v_n
  from public.recipe_submissions s
  where s.id = v_sub and s.status = 'pending' and s.name = 'Test Sour' and s.locale = 'ja'
    and s.ingredients = '[{"name":"Gin","measure":"2 oz"},{"name":"Lime juice","measure":null}]'::jsonb
    and s.text_screening = 'pending' and s.photo_screening is null;
  v_report := v_report || format(E'\n%s AC-1 valid save is pending, trimmed, locale ja (%s)',
    case when v_res = 'ok' and v_n = 1 then 'PASS' else 'FAIL' end, v_res);

  select up.display_name into v_name from public.user_preferences up where up.user_id = v_author;
  v_report := v_report || format(E'\n%s AC-3 display name saved trimmed (%s)',
    case when v_name = 'Sam' then 'PASS' else 'FAIL' end, v_name);

  -- AC-1 / AC-23: not public, not visible to other users.
  select count(*) into v_n from public.search_recipes('Test Sour', null, 50, 0, 'en', 'popular', false) sr
  where sr.name = 'Test Sour';
  v_report := v_report || format(E'\n%s AC-1 pending submission not in search_recipes',
    case when v_n = 0 then 'PASS' else 'FAIL' end);

  perform set_config('request.jwt.claims', pg_temp.claims(v_other)::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.recipe_submissions;
  execute 'reset role';
  v_report := v_report || format(E'\n%s AC-23 non admin selects zero rows from recipe_submissions (%s)',
    case when v_n = 0 then 'PASS' else 'FAIL' end, v_n);

  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_other),
    format($q$insert into public.recipe_submissions (author_id, status, locale, name, instructions, ingredients, alcoholic_status) values (%L, 'pending', 'en', 'x', 'x', '[{"name":"x"}]', 'alcoholic')$q$, v_other));
  v_report := v_report || format(E'\n%s AC-23 direct insert is denied (%s)',
    case when v_res <> 'ok' then 'PASS' else 'FAIL' end, v_res);

  -- Invariant 10: another user's id gets not_editable.
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_other), format(
    $q$select public.save_recipe_submission(%L, 'Hijack', %s, 'Shake.', null, 'alcoholic', null, null, 'en', 'Eve')$q$,
    v_sub, v_ing));
  v_report := v_report || format(E'\n%s AC-23 saving another user''s id gets not_editable (%s)',
    case when v_res = 'not_editable' then 'PASS' else 'FAIL' end, v_res);

  -- AC-23: author reads never carry screening fields.
  select pg_get_function_result('public.fetch_my_recipe_submission(uuid)'::regprocedure)
       || pg_get_function_result('public.fetch_my_recipe_submissions(timestamptz, uuid, integer, text)'::regprocedure)
  into v_name;
  v_report := v_report || format(E'\n%s AC-23 author functions return no screening columns',
    case when v_name not like '%screening%' then 'PASS' else 'FAIL' end);

  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_author), format(
    $q$select 1 from public.fetch_my_recipe_submission(%L) where name = 'Test Sour' and not needs_display_name and not blocked$q$, v_sub));
  v_report := v_report || format(E'\n%s fetch_my_recipe_submission returns the author''s row (%s)',
    case when v_res = 'ok' then 'PASS' else 'FAIL' end, v_res);

  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_other), format(
    $q$select 1 from public.fetch_my_recipe_submission(%L)$q$, v_sub));
  v_report := v_report || format(E'\n%s fetch_my_recipe_submission hides other users'' rows (%s)',
    case when v_res = 'not_found' then 'PASS' else 'FAIL' end, v_res);

  -- AC-5: pending cap. The author has 1 pending; 4 more reach 5.
  for i in 1..4 loop
    v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_author), format(
      $q$select public.save_recipe_submission(%L, 'Cap %s', %s, 'Shake.', null, 'alcoholic', null, null, 'en', null)$q$,
      gen_random_uuid(), i, v_ing));
  end loop;
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_author), format(
    $q$select public.save_recipe_submission(%L, 'Cap 6', %s, 'Shake.', null, 'alcoholic', null, null, 'en', null)$q$,
    gen_random_uuid(), v_ing));
  v_report := v_report || format(E'\n%s AC-5 a 6th pending save gets pending_cap (%s)',
    case when v_res = 'pending_cap' then 'PASS' else 'FAIL' end, v_res);

  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_author), format(
    $q$select public.save_recipe_submission(%L, 'Test Sour edited', %s, 'Shake.', null, 'alcoholic', null, null, 'en', null)$q$,
    v_sub, v_ing));
  v_report := v_report || format(E'\n%s AC-5 editing one of 5 pending still works (%s)',
    case when v_res = 'ok' then 'PASS' else 'FAIL' end, v_res);

  -- AC-6: an edit never changes locale.
  select count(*) into v_n from public.recipe_submissions where id = v_sub and locale = 'ja';
  v_report := v_report || format(E'\n%s AC-6 edit keeps locale',
    case when v_n = 1 then 'PASS' else 'FAIL' end);

  -- AC-5: daily cap (6 saves so far today; force the count to 10).
  update public.recipe_submission_usage set count = 10 where user_id = v_author;
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_author), format(
    $q$select public.save_recipe_submission(%L, 'Test Sour again', %s, 'Shake.', null, 'alcoholic', null, null, 'en', null)$q$,
    v_sub, v_ing));
  v_report := v_report || format(E'\n%s AC-5 the 11th save in a UTC day gets daily_cap (%s)',
    case when v_res = 'daily_cap' then 'PASS' else 'FAIL' end, v_res);
  update public.recipe_submission_usage set count = 6 where user_id = v_author;

  -- AC-23: admin functions check is_admin.
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_other), format(
    $q$select public.admin_approve_recipe_submission(%L, now(), %L, 'x', 'x', null, 'alcoholic', null, '[{"name":"Gin"}]', '[]')$q$,
    v_sub, v_recipe));
  v_report := v_report || format(E'\n%s AC-23 non admin approve gets not_admin (%s)',
    case when v_res = 'not_admin' then 'PASS' else 'FAIL' end, v_res);
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_other),
    $q$select 1 from public.admin_list_recipe_submissions('pending')$q$);
  v_report := v_report || format(E'\n%s AC-23 non admin list gets not_admin (%s)',
    case when v_res = 'not_admin' then 'PASS' else 'FAIL' end, v_res);

  -- AC-10: the admin list, oldest pending first.
  perform set_config('request.jwt.claims', pg_temp.claims(v_admin)::text, true);
  execute 'set local role authenticated';
  select
    count(*) filter (where l.author_id = v_author),
    array_agg(l.submitted_at) = array_agg(l.submitted_at order by l.submitted_at, l.id)
  into v_n, v_ok
  from public.admin_list_recipe_submissions('pending', null, null, 100) l;
  execute 'reset role';
  v_report := v_report || format(E'\n%s AC-10 admin list shows the 5 pending, oldest first (%s rows)',
    case when v_n = 5 and coalesce(v_ok, false) then 'PASS' else 'FAIL' end, v_n);

  -- AC-14: stale token fails and writes nothing.
  select s.updated_at into v_updated from public.recipe_submissions s where s.id = v_sub;
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_admin), format(
    $q$select public.admin_approve_recipe_submission(%L, %L::timestamptz - interval '1 second', %L, 'Test Sour', 'Shake.', null, 'alcoholic', null, '[{"name":"Gin","measure":"2 oz","sortOrder":0}]', '[]')$q$,
    v_sub, v_updated, v_recipe));
  select count(*) into v_n from public.recipes where id = v_recipe;
  v_report := v_report || format(E'\n%s AC-14 approve with an old updated_at gets stale, no recipe (%s)',
    case when v_res = 'stale' and v_n = 0 then 'PASS' else 'FAIL' end, v_res);

  -- AC-11: approve creates a community recipe credited to the author.
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_admin), format(
    $q$select public.admin_approve_recipe_submission(%L, %L::timestamptz, %L, 'Submission Check Sour', 'Shake with ice.', 'Coupe', 'alcoholic', null, '[{"name":"Gin","measure":"2 oz","sortOrder":0},{"name":"Lime juice","measure":"1 oz","sortOrder":1}]', '[{"name":"Sour"}]', null, false, null, false, null, ' A tip. ', null)$q$,
    v_sub, v_updated, v_recipe));
  select count(*) into v_n
  from public.recipes r
  where r.id = v_recipe and r.source = 'community' and r.source_id = 'community-' || v_sub
    and r.submitted_by = v_author and r.bartender_tip = 'A tip.'
    and (select count(*) from public.recipe_ingredients ri where ri.recipe_id = r.id) = 2;
  v_report := v_report || format(E'\n%s AC-11 approve writes a community recipe with ingredients and tip (%s)',
    case when v_res = 'ok' and v_n = 1 then 'PASS' else 'FAIL' end, v_res);

  select count(*) into v_n from public.recipe_submissions s
  where s.id = v_sub and s.status = 'approved' and s.approved_recipe_id = v_recipe and s.reviewed_at is not null;
  v_report := v_report || format(E'\n%s AC-11 submission marked approved with the recipe id',
    case when v_n = 1 then 'PASS' else 'FAIL' end);

  select count(*) into v_n from public.search_recipes('Submission Check Sour', null, 10, 0, 'en', 'popular', false) sr
  where sr.id = v_recipe;
  v_report := v_report || format(E'\n%s AC-11 approved recipe is live in search',
    case when v_n = 1 then 'PASS' else 'FAIL' end);

  -- AC-16: live credit.
  select d.submitted_by_name into v_name
  from public.fetch_recipe_detail(v_recipe, 'en') d where d.is_community;
  v_report := v_report || format(E'\n%s AC-16 detail credits the author (%s)',
    case when v_name = 'Sam' then 'PASS' else 'FAIL' end, v_name);

  -- AC-6: approved rows are read only.
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_author), format(
    $q$select public.save_recipe_submission(%L, 'Edit after approval', %s, 'Shake.', null, 'alcoholic', null, null, 'en', null)$q$,
    v_sub, v_ing));
  v_report := v_report || format(E'\n%s AC-6 saving an approved submission gets not_editable (%s)',
    case when v_res = 'not_editable' then 'PASS' else 'FAIL' end, v_res);

  -- AC-22: an admin edit keeps source, source_id, and submitted_by.
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_admin), format(
    $q$select public.admin_upsert_recipe(%L, 'Submission Check Sour v2', 'Shake hard.', 'Coupe', 'alcoholic', null, '[{"name":"Gin","measure":"2 oz","sortOrder":0}]', '[]')$q$,
    v_recipe));
  select count(*) into v_n from public.recipes r
  where r.id = v_recipe and r.name = 'Submission Check Sour v2' and r.source = 'community'
    and r.source_id = 'community-' || v_sub and r.submitted_by = v_author;
  v_report := v_report || format(E'\n%s AC-22 admin edit keeps source, source_id, submitted_by (%s)',
    case when v_res = 'ok' and v_n = 1 then 'PASS' else 'FAIL' end, v_res);

  -- 0030 unchanged: admin_upsert_recipe still creates an admin recipe, and
  -- non admins still get 'not authorized'.
  perform set_config('request.jwt.claims', pg_temp.claims(v_admin)::text, true);
  execute 'set local role authenticated';
  select public.admin_upsert_recipe(null, 'Submission Check Admin', 'Stir.', null, 'alcoholic', null,
    '[{"name":"Gin","measure":"2 oz","sortOrder":0}]'::jsonb, '[]'::jsonb)
  into v_recipe_admin;
  execute 'reset role';
  select count(*) into v_n from public.recipes r
  where r.id = v_recipe_admin and r.source = 'admin' and r.source_id like 'admin-%' and r.submitted_by is null;
  v_report := v_report || format(E'\n%s 0030 admin_upsert_recipe create unchanged',
    case when v_n = 1 then 'PASS' else 'FAIL' end);
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_other),
    $q$select public.admin_upsert_recipe(null, 'x', 'x', null, 'alcoholic', null, '[{"name":"Gin"}]', '[]')$q$);
  v_report := v_report || format(E'\n%s 0030 non admin upsert still gets not authorized (%s)',
    case when v_res = 'not authorized' then 'PASS' else 'FAIL' end, v_res);
  v_report := v_report || format(E'\n%s _upsert_recipe_core is not callable by authenticated',
    case when not has_function_privilege('authenticated',
      'public._upsert_recipe_core(text, text, uuid, uuid, uuid, text, text, text, text, text, jsonb, jsonb, text[], boolean, text, boolean, smallint)', 'execute')
    then 'PASS' else 'FAIL' end);

  -- AC-17: deleting the account removes submissions and nulls the credit.
  delete from auth.users where id = v_author;
  select count(*) into v_n from public.recipe_submissions where author_id = v_author;
  v_ok := v_n = 0;
  select count(*) into v_n from public.fetch_recipe_detail(v_recipe, 'en') d
  where d.is_community and d.submitted_by_name is null;
  v_report := v_report || format(E'\n%s AC-17 account deletion removes submissions, recipe stays uncredited',
    case when v_ok and v_n = 1 then 'PASS' else 'FAIL' end);

  raise exception E'recipe submissions check report (rolled back):%', v_report;
end;
$check$;

rollback;
