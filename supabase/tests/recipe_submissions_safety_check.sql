-- Hand run database checks for spec 0064 build plan task 10 (safety and
-- lifecycle): the block toggle (AC-18), the cleanup helpers (AC-19), the
-- account deletion cascade (AC-17), and the import guard (AC-22, invariant 7).
-- Paste into the Supabase SQL editor after applying
-- 20261123120000_recipe_submissions_safety.sql.
--
-- Runs inside begin ... rollback. The DO block always ends by raising an
-- exception, so everything it seeds (users, submissions, storage rows,
-- recipes, and the import's soft deletes of the real catalog, which isn't in
-- the test payload) is rolled back. The exception message IS the report: a
-- PASS/FAIL line per check. The admin is the first existing user_preferences
-- row with is_admin. Storage rows are metadata only; no file bytes exist.
--
-- Import guard scope (decided during /develop on 2026-11-23): the import,
-- merges, hides, custom recipes, and reset leave a community recipe exactly
-- as it was. Fame on arrival may fill fame_score (and region when empty, and
-- the derived popularity_rank) on a community recipe that has none, matching
-- the spec's Value sourcing table; it never changes anything else, and never
-- overwrites a fame score set at review.
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

-- A recipe row plus its ingredients and tags, as one comparable text.
create function pg_temp.recipe_snapshot(p_id uuid, p_ignore text[] default '{}')
returns text
language sql
as $$
  select concat_ws('|',
    (select (to_jsonb(r) - p_ignore)::text from public.recipes r where r.id = p_id),
    (select coalesce(jsonb_agg(to_jsonb(ri) order by ri.sort_order, ri.ingredient_id), '[]')::text
       from public.recipe_ingredients ri where ri.recipe_id = p_id),
    (select coalesce(jsonb_agg(rt.tag_id order by rt.tag_id), '[]')::text
       from public.recipe_tags rt where rt.recipe_id = p_id)
  );
$$;

do $check$
declare
  v_report text := '';
  v_author uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_admin uuid;
  v_sub uuid := gen_random_uuid();
  v_sub2 uuid := gen_random_uuid();
  v_old_rejected uuid := gen_random_uuid();
  v_new_rejected uuid := gen_random_uuid();
  v_pending_photo uuid := gen_random_uuid();
  v_recipe uuid := gen_random_uuid();
  v_scored_recipe uuid := gen_random_uuid();
  v_res text;
  v_n int;
  v_updated timestamptz;
  v_before text;
  v_before_scored text;
  v_paths text[];
  v_ing constant text := '''[{"name":"Gin","measure":"2 oz"}]''::jsonb';
  v_today date := (now() at time zone 'utc')::date;
  v_fame_ignore constant text[] := array['fame_score', 'region', 'popularity_rank', 'updated_at'];
begin
  select up.user_id into v_admin from public.user_preferences up where up.is_admin limit 1;
  if v_admin is null then
    raise exception 'no admin user found; this check needs one';
  end if;

  insert into auth.users (id, aud, role, email, is_anonymous, created_at, updated_at)
  values
    (v_author, 'authenticated', 'authenticated', 'safety-check-author@example.invalid', false, now(), now()),
    (v_other, 'authenticated', 'authenticated', 'safety-check-other@example.invalid', false, now(), now());
  insert into public.user_preferences (user_id, display_name) values (v_author, 'Sam'), (v_other, 'Kim')
  on conflict (user_id) do update set display_name = excluded.display_name;

  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_author), format(
    $q$select public.save_recipe_submission(%L, 'Safety Sour', %s, 'Shake.', null, 'alcoholic', null, null, 'en', null)$q$,
    v_sub, v_ing));

  -- AC-18 / AC-23: only the admin can block. -----------------------------------
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_other), format(
    $q$select public.admin_set_submission_block(%L, true)$q$, v_sub));
  v_report := v_report || format(E'\n%s AC-23 non admin block gets not_admin (%s)',
    case when v_res = 'not_admin' then 'PASS' else 'FAIL' end, v_res);

  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_admin), format(
    $q$select public.admin_set_submission_block(%L, true)$q$, gen_random_uuid()));
  v_report := v_report || format(E'\n%s AC-18 block on an unknown submission gets not_found (%s)',
    case when v_res = 'not_found' then 'PASS' else 'FAIL' end, v_res);

  -- AC-18: block on; saves fail, the pending row stays, the form reads blocked.
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_admin), format(
    $q$select public.admin_set_submission_block(%L, true)$q$, v_sub));
  select count(*) into v_n from public.user_preferences up
  where up.user_id = v_author and up.submissions_blocked_at is not null;
  v_report := v_report || format(E'\n%s AC-18 admin block sets submissions_blocked_at (%s)',
    case when v_res = 'ok' and v_n = 1 then 'PASS' else 'FAIL' end, v_res);

  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_author), format(
    $q$select public.save_recipe_submission(%L, 'Safety Fizz', %s, 'Build.', null, 'alcoholic', null, null, 'en', null)$q$,
    v_sub2, v_ing));
  v_report := v_report || format(E'\n%s AC-18 blocked author save gets blocked (%s)',
    case when v_res = 'blocked' then 'PASS' else 'FAIL' end, v_res);

  select count(*) into v_n from public.recipe_submissions s where s.id = v_sub and s.status = 'pending';
  v_report := v_report || format(E'\n%s AC-18 existing pending submission stays in the queue',
    case when v_n = 1 then 'PASS' else 'FAIL' end);

  perform set_config('request.jwt.claims', pg_temp.claims(v_author)::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.fetch_my_recipe_submission(v_sub) m where m.blocked;
  execute 'reset role';
  v_report := v_report || format(E'\n%s AC-18 author form context reads blocked',
    case when v_n = 1 then 'PASS' else 'FAIL' end);

  -- AC-18: block off restores saving.
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_admin), format(
    $q$select public.admin_set_submission_block(%L, false)$q$, v_sub));
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_author), format(
    $q$select public.save_recipe_submission(%L, 'Safety Fizz', %s, 'Build.', null, 'alcoholic', null, null, 'en', null)$q$,
    v_sub2, v_ing));
  v_report := v_report || format(E'\n%s AC-18 unblock restores saving (%s)',
    case when v_res = 'ok' then 'PASS' else 'FAIL' end, v_res);

  -- AC-18: a blocked user with no user_preferences row yet gets one.
  delete from public.user_preferences where user_id = v_other;
  insert into public.recipe_submissions (id, author_id, status, locale, name, instructions, ingredients,
    alcoholic_status, submitted_at)
  values (v_pending_photo, v_other, 'pending', 'en', 'Other Pending', 'Stir.',
    '[{"name":"Gin","measure":null}]'::jsonb, 'alcoholic', now());
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_admin), format(
    $q$select public.admin_set_submission_block(%L, true)$q$, v_pending_photo));
  select count(*) into v_n from public.user_preferences up
  where up.user_id = v_other and up.submissions_blocked_at is not null;
  v_report := v_report || format(E'\n%s AC-18 block works for an author with no preferences row (%s)',
    case when v_res = 'ok' and v_n = 1 then 'PASS' else 'FAIL' end, v_res);
  delete from public.recipe_submissions where id = v_pending_photo;

  -- AC-19: rejected rows over 90 days old go, newer ones stay. ------------------
  insert into public.recipe_submissions (id, author_id, status, locale, name, instructions, ingredients,
    alcoholic_status, rejection_reason, submitted_at, reviewed_at, photo_path, photo_screening)
  values
    (v_old_rejected, v_author, 'rejected', 'en', 'Old Reject', 'Stir.', '[{"name":"Gin","measure":null}]'::jsonb,
      'alcoholic', 'No.', now() - interval '100 days', now() - interval '91 days',
      v_author::text || '/' || v_old_rejected::text || '-0123456789abcdef', 'clear'),
    (v_new_rejected, v_author, 'rejected', 'en', 'New Reject', 'Stir.', '[{"name":"Gin","measure":null}]'::jsonb,
      'alcoholic', 'No.', now() - interval '100 days', now() - interval '89 days', null, null);

  select count(*) into v_n from public.delete_expired_rejected_recipe_submissions(100, true) d
  where d.id = v_old_rejected;
  select count(*) + v_n * 10 into v_n from public.recipe_submissions s where s.id = v_old_rejected;
  v_report := v_report || format(E'\n%s AC-19 dry run lists the expired row and deletes nothing',
    case when v_n = 11 then 'PASS' else 'FAIL' end);

  select array_agg(d.photo_path) into v_paths
  from public.delete_expired_rejected_recipe_submissions(100) d
  where d.id in (v_old_rejected, v_new_rejected);
  select count(*) into v_n from public.recipe_submissions s where s.id in (v_old_rejected, v_new_rejected);
  v_report := v_report || format(E'\n%s AC-19 deletes the 91 day reject, keeps the 89 day one, returns its photo path',
    case when v_n = 1 and v_paths = array[v_author::text || '/' || v_old_rejected::text || '-0123456789abcdef']
      then 'PASS' else 'FAIL' end);

  -- AC-19: orphan files over 24 hours go; a pending row's file and a fresh file stay.
  insert into public.recipe_submissions (id, author_id, status, locale, name, instructions, ingredients,
    alcoholic_status, submitted_at, photo_path, photo_screening)
  values (v_pending_photo, v_author, 'pending', 'en', 'Photo Pending', 'Stir.',
    '[{"name":"Gin","measure":null}]'::jsonb, 'alcoholic', now(),
    v_author::text || '/' || v_pending_photo::text || '-aaaaaaaaaaaaaaaa', 'pending');
  insert into storage.objects (bucket_id, name, owner_id, created_at) values
    ('recipe-submission-photos', v_author::text || '/' || v_pending_photo::text || '-aaaaaaaaaaaaaaaa-hero.webp', v_author, now() - interval '2 days'),
    ('recipe-submission-photos', v_author::text || '/' || v_pending_photo::text || '-bbbbbbbbbbbbbbbb-hero.webp', v_author, now() - interval '2 days'),
    ('recipe-submission-photos', v_author::text || '/' || v_pending_photo::text || '-cccccccccccccccc-card.webp', v_author, now() - interval '1 hour');
  v_paths := public.list_orphan_recipe_submission_photos(1000);
  v_report := v_report || format(E'\n%s AC-19 orphan list has the stale replaced file only',
    case when (v_author::text || '/' || v_pending_photo::text || '-bbbbbbbbbbbbbbbb-hero.webp') = any (v_paths)
      and not (v_author::text || '/' || v_pending_photo::text || '-aaaaaaaaaaaaaaaa-hero.webp') = any (v_paths)
      and not (v_author::text || '/' || v_pending_photo::text || '-cccccccccccccccc-card.webp') = any (v_paths)
      then 'PASS' else 'FAIL' end);

  -- AC-19: usage rows over 7 days go.
  insert into public.recipe_submission_usage (user_id, day, count) values
    (v_other, v_today - 8, 3), (v_other, v_today - 7, 2)
  on conflict do nothing;
  v_n := public.delete_old_recipe_submission_usage(true);
  select count(*) + (case when v_n >= 1 then 10 else 0 end) into v_n
  from public.recipe_submission_usage u where u.user_id = v_other;
  v_report := v_report || format(E'\n%s AC-19 usage dry run counts and keeps rows',
    case when v_n = 12 then 'PASS' else 'FAIL' end);
  perform public.delete_old_recipe_submission_usage();
  select count(*) into v_n from public.recipe_submission_usage u
  where u.user_id = v_other and u.day = v_today - 7;
  select v_n * 10 + count(*) into v_n from public.recipe_submission_usage u
  where u.user_id = v_other and u.day = v_today - 8;
  v_report := v_report || format(E'\n%s AC-19 usage over 7 days deleted, 7 days kept',
    case when v_n = 10 then 'PASS' else 'FAIL' end);

  -- AC-19 / AC-23: the cleanup helpers are service role only.
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_admin),
    $q$select public.list_orphan_recipe_submission_photos(1)$q$);
  v_report := v_report || format(E'\n%s AC-23 cleanup helpers refuse a signed in caller (%s)',
    case when v_res like '%permission denied%' then 'PASS' else 'FAIL' end, v_res);

  -- AC-22: a community recipe (approved through the real path) and one -----------
  -- whose fame score was set at review.
  select s.updated_at into v_updated from public.recipe_submissions s where s.id = v_sub;
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_admin), format(
    $q$select public.admin_approve_recipe_submission(%L, %L, %L, 'Safety Sour', 'Shake.', null, 'alcoholic', null, '[{"name":"Gin","measure":"2 oz","sortOrder":0}]'::jsonb, '[]'::jsonb)$q$,
    v_sub, v_updated, v_recipe));
  v_report := v_report || format(E'\n%s AC-22 setup: community recipe approved (%s)',
    case when v_res = 'ok' then 'PASS' else 'FAIL' end, v_res);
  select s.updated_at into v_updated from public.recipe_submissions s where s.id = v_sub2;
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_admin), format(
    $q$select public.admin_approve_recipe_submission(%L, %L, %L, 'Safety Fizz', 'Build.', null, 'alcoholic', null, '[{"name":"Gin","measure":"2 oz","sortOrder":0}]'::jsonb, '[]'::jsonb)$q$,
    v_sub2, v_updated, v_scored_recipe));
  update public.recipes set fame_score = 42 where id = v_scored_recipe;

  v_before := pg_temp.recipe_snapshot(v_recipe);
  v_before_scored := pg_temp.recipe_snapshot(v_scored_recipe);

  -- The catalog import with merges and hides (none name the community recipe:
  -- the overrides schema only accepts numeric TheCocktailDB ids), then custom
  -- recipes. A catalog run soft deletes every catalog recipe not in its
  -- payload; it must skip community ones.
  perform public.import_catalog(
    jsonb_build_array(
      jsonb_build_object('sourceId', '990001', 'name', 'Guard Kept', 'instructions', 'x',
        'glass', 'Highball glass', 'alcoholicStatus', 'alcoholic',
        'ingredients', jsonb_build_array(jsonb_build_object('ingredientName', 'Gin', 'sortOrder', 1)),
        'tags', '[]'::jsonb),
      jsonb_build_object('sourceId', '990002', 'name', 'Guard Dupe', 'instructions', 'x',
        'glass', 'Highball glass', 'alcoholicStatus', 'alcoholic',
        'ingredients', jsonb_build_array(jsonb_build_object('ingredientName', 'Gin', 'sortOrder', 1)),
        'tags', '[]'::jsonb)),
    '[{"fromSourceId": "990002", "toSourceId": "990001"}]'::jsonb,
    array['Ice'],
    array['990003']
  );
  perform public.import_custom_recipes(jsonb_build_array(
    jsonb_build_object('sourceId', 'custom:guard-check', 'name', 'Guard Custom', 'instructions', 'x',
      'glass', 'Highball glass', 'alcoholicStatus', 'alcoholic', 'sourceHash', 'guard',
      'ingredients', jsonb_build_array(jsonb_build_object('ingredientName', 'Gin', 'sortOrder', 1)),
      'tags', '[]'::jsonb)));
  v_report := v_report || format(E'\n%s AC-22 catalog import, merges, hides, and custom import leave the community recipe unchanged',
    case when pg_temp.recipe_snapshot(v_recipe) = v_before
      and pg_temp.recipe_snapshot(v_scored_recipe) = v_before_scored then 'PASS' else 'FAIL' end);

  -- Reset refuses a community recipe.
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_admin), format(
    $q$select public.admin_reset_recipe_to_source(%L)$q$, v_recipe));
  v_report := v_report || format(E'\n%s AC-22 reset refuses a community recipe, row unchanged (%s)',
    case when v_res = 'only catalog recipes can be reset' and pg_temp.recipe_snapshot(v_recipe) = v_before
      then 'PASS' else 'FAIL' end, v_res);

  -- Fame on arrival fills only the empty fame score; nothing else moves, and a
  -- score set at review is kept.
  v_before := pg_temp.recipe_snapshot(v_recipe, v_fame_ignore);
  perform public.apply_fame_on_arrival(jsonb_build_array(
    jsonb_build_object('id', v_recipe, 'region', null, 'fame_score', 30),
    jsonb_build_object('id', v_scored_recipe, 'region', null, 'fame_score', 90)));
  select count(*) into v_n from public.recipes r where r.id = v_recipe and r.fame_score = 30;
  v_report := v_report || format(E'\n%s AC-22 fame on arrival fills an empty community fame score and nothing else',
    case when v_n = 1 and pg_temp.recipe_snapshot(v_recipe, v_fame_ignore) = v_before
      then 'PASS' else 'FAIL' end);
  v_report := v_report || format(E'\n%s AC-22 fame on arrival keeps a fame score set at review',
    case when pg_temp.recipe_snapshot(v_scored_recipe) = v_before_scored then 'PASS' else 'FAIL' end);

  -- AC-17: account deletion. -------------------------------------------------
  -- v_author owns two approved recipes, a kept rejected row, a pending photo
  -- row, and usage. Deleting the user removes every submission and usage row;
  -- the recipes stay live, credited to nobody.
  delete from auth.users where id = v_author;
  select count(*) into v_n from public.recipe_submissions s where s.author_id = v_author;
  v_report := v_report || format(E'\n%s AC-17 account deletion removes every submission',
    case when v_n = 0 then 'PASS' else 'FAIL' end);
  select count(*) into v_n from public.recipe_submission_usage u where u.user_id = v_author;
  v_report := v_report || format(E'\n%s AC-17 account deletion removes usage rows',
    case when v_n = 0 then 'PASS' else 'FAIL' end);
  select count(*) into v_n from public.recipes r
  where r.id in (v_recipe, v_scored_recipe) and r.submitted_by is null and r.deleted_at is null
    and r.source = 'community';
  v_report := v_report || format(E'\n%s AC-17 approved recipes stay live with submitted_by null',
    case when v_n = 2 then 'PASS' else 'FAIL' end);
  select count(*) into v_n from public.fetch_recipe_detail(v_recipe, 'en') d
  where d.is_community and d.submitted_by_name is null;
  v_report := v_report || format(E'\n%s AC-17 detail reads is_community with no name (community member fallback)',
    case when v_n = 1 then 'PASS' else 'FAIL' end);

  raise exception E'recipe submissions safety check report (rolled back):%', v_report;
end;
$check$;

rollback;
