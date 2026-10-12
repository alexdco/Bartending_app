-- Hand run database checks for spec 0036 (recipe catalog cleanup), Build plan
-- task 10. Paste into the Supabase SQL editor after applying
-- 20261012120000_catalog_cleanup.sql.
--
-- Everything runs inside one DO block that always ends by raising an
-- exception, so every synthetic recipe, user, favorite, pin, and pantry row
-- (and the import's soft deletes of the real catalog, which isn't in the test
-- payload) is rolled back. The exception message IS the report: a PASS/FAIL
-- line per check.
-- Spec: docs/specs/0036-recipe-catalog-cleanup/index.md

do $$
declare
  v_users uuid[] := array(select gen_random_uuid() from generate_series(1, 3));
  v_drinks jsonb;
  v_drinks_without_hidden jsonb;
  v_merges jsonb := '[{"fromSourceId": "990002", "toSourceId": "990001"}]'::jsonb;
  v_staples text[] := array['Ice', 'Water'];
  v_target uuid;
  v_dupe uuid;
  v_crude uuid;
  v_mixed uuid;
  v_staples_only uuid;
  v_ice uuid;
  v_gin uuid;
  v_admin_live_before int;
  v_snapshot_before text;
  v_snapshot_after text;
  v_report text := '';
  v_ok boolean;
  r record;
begin
  insert into auth.users (id, is_anonymous)
  select u, true from unnest(v_users) u;

  select count(*) into v_admin_live_before
  from public.recipes where source = 'admin' and deleted_at is null;

  -- 990001 kept, 990002 its duplicate, 990003 crude, 990004 only staples,
  -- 990005 Gin plus Ice, 990100.. fillers so a user can hold 20 pins.
  v_drinks := jsonb_build_array(
    jsonb_build_object('sourceId', '990001', 'name', 'Check Kept', 'instructions', 'Original.',
      'glass', 'Highball glass', 'alcoholicStatus', 'alcoholic',
      'ingredients', jsonb_build_array(jsonb_build_object('ingredientName', 'Gin', 'sortOrder', 1)),
      'tags', '[]'::jsonb),
    jsonb_build_object('sourceId', '990002', 'name', 'Check Dupe', 'instructions', 'x',
      'glass', 'Highball glass', 'alcoholicStatus', 'alcoholic',
      'ingredients', jsonb_build_array(jsonb_build_object('ingredientName', 'Gin', 'sortOrder', 1)),
      'tags', '[]'::jsonb),
    jsonb_build_object('sourceId', '990003', 'name', 'Check Crude', 'instructions', 'x',
      'glass', 'Highball glass', 'alcoholicStatus', 'alcoholic',
      'ingredients', jsonb_build_array(jsonb_build_object('ingredientName', 'Gin', 'sortOrder', 1)),
      'tags', '[]'::jsonb),
    jsonb_build_object('sourceId', '990004', 'name', 'Check Staples Only', 'instructions', 'x',
      'glass', 'Highball glass', 'alcoholicStatus', 'non_alcoholic',
      'ingredients', jsonb_build_array(
        jsonb_build_object('ingredientName', 'Ice', 'sortOrder', 1),
        jsonb_build_object('ingredientName', 'Water', 'sortOrder', 2)),
      'tags', '[]'::jsonb),
    jsonb_build_object('sourceId', '990005', 'name', 'Check Gin On Ice', 'instructions', 'x',
      'glass', 'Highball glass', 'alcoholicStatus', 'alcoholic',
      'ingredients', jsonb_build_array(
        jsonb_build_object('ingredientName', 'Gin', 'sortOrder', 1),
        jsonb_build_object('ingredientName', 'Ice', 'sortOrder', 2)),
      'tags', '[]'::jsonb)
  ) || (
    select jsonb_agg(jsonb_build_object('sourceId', (990100 + g)::text, 'name', 'Check Filler ' || g,
      'instructions', 'x', 'glass', 'Highball glass', 'alcoholicStatus', 'alcoholic',
      'ingredients', jsonb_build_array(jsonb_build_object('ingredientName', 'Gin', 'sortOrder', 1)),
      'tags', '[]'::jsonb))
    from generate_series(1, 19) g
  );

  -- First run: every drink present, no merges, no staples yet.
  perform public.import_catalog(v_drinks);

  select id into v_target from public.recipes where source_id = '990001';
  select id into v_dupe from public.recipes where source_id = '990002';
  select id into v_crude from public.recipes where source_id = '990003';
  select id into v_staples_only from public.recipes where source_id = '990004';
  select id into v_mixed from public.recipes where source_id = '990005';
  select id into v_ice from public.ingredients where normalized_name = 'ice';
  select id into v_gin from public.ingredients where normalized_name = 'gin';

  -- User 1 favorites both the kept recipe and the duplicate; user 2 only the
  -- duplicate; user 3 holds 20 pins, one of them on the duplicate.
  insert into public.favorites (user_id, recipe_id) values
    (v_users[1], v_target), (v_users[1], v_dupe), (v_users[2], v_dupe);
  insert into public.pinned_recipes (user_id, recipe_id, sort_order)
  select v_users[3], r2.id, (row_number() over (order by r2.source_id))::int
  from public.recipes r2
  where r2.source_id = '990002' or r2.source_id ~ '^9901(0[1-9]|1[0-9])$';
  insert into public.pantry_items (user_id, ingredient_id) values
    (v_users[1], v_gin), (v_users[1], v_ice);

  -- Second run: the overrides leave out the duplicate and the crude drink.
  v_drinks_without_hidden := (
    select jsonb_agg(d) from jsonb_array_elements(v_drinks) d
    where d ->> 'sourceId' not in ('990002', '990003')
  );
  perform public.import_catalog(v_drinks_without_hidden, v_merges, v_staples);

  ---------------------------------------------------------------------------
  -- AC-1, AC-3: hidden rows soft deleted; only the duplicate has a pointer.
  ---------------------------------------------------------------------------
  v_ok := (select deleted_at is not null and merged_into_recipe_id = v_target from public.recipes where id = v_dupe)
    and (select deleted_at is not null and merged_into_recipe_id is null from public.recipes where id = v_crude)
    and (select deleted_at is null and merged_into_recipe_id is null from public.recipes where id = v_target);
  v_report := v_report || format(E'%s  AC-1/AC-3 duplicate and crude soft deleted, pointer only on the duplicate\n', case when v_ok then 'PASS' else 'FAIL' end);

  v_ok := (select count(*) from public.recipes where source = 'admin' and deleted_at is null) = v_admin_live_before;
  v_report := v_report || format(E'%s  admin recipes are never soft deleted by the catalog import\n', case when v_ok then 'PASS' else 'FAIL' end);

  ---------------------------------------------------------------------------
  -- AC-5: favorites and pins move without duplicates or a pin limit abort.
  ---------------------------------------------------------------------------
  v_ok := (select count(*) from public.favorites where user_id = v_users[1] and recipe_id = v_target) = 1
    and not exists (select 1 from public.favorites where recipe_id = v_dupe)
    and exists (select 1 from public.favorites where user_id = v_users[2] and recipe_id = v_target);
  v_report := v_report || format(E'%s  AC-5 favorites moved, a user holding both keeps one row\n', case when v_ok then 'PASS' else 'FAIL' end);

  v_ok := (select count(*) from public.pinned_recipes where user_id = v_users[3]) = 20
    and exists (select 1 from public.pinned_recipes where user_id = v_users[3] and recipe_id = v_target)
    and not exists (select 1 from public.pinned_recipes where recipe_id = v_dupe);
  v_report := v_report || format(E'%s  AC-5 a user at 20 pins has the duplicate pin moved, import not aborted\n', case when v_ok then 'PASS' else 'FAIL' end);

  ---------------------------------------------------------------------------
  -- AC-2: redirect lookup.
  ---------------------------------------------------------------------------
  v_ok := public.resolve_recipe_redirect(v_dupe) = v_target
    and public.resolve_recipe_redirect(v_crude) is null
    and public.resolve_recipe_redirect(v_target) is null;
  v_report := v_report || format(E'%s  AC-2 redirect returns the target for a duplicate, null for crude and live ids\n', case when v_ok then 'PASS' else 'FAIL' end);

  ---------------------------------------------------------------------------
  -- AC-10, AC-13: staple flags, pantry cleanup, search filter.
  ---------------------------------------------------------------------------
  v_ok := (select bool_and(is_staple) from public.ingredients where normalized_name in ('ice', 'water'))
    and not (select is_staple from public.ingredients where id = v_gin)
    and not exists (select 1 from public.pantry_items where ingredient_id = v_ice)
    and exists (select 1 from public.pantry_items where user_id = v_users[1] and ingredient_id = v_gin);
  v_report := v_report || format(E'%s  AC-10 Ice and Water flagged, staple pantry rows removed, others kept\n', case when v_ok then 'PASS' else 'FAIL' end);

  v_ok := not exists (select 1 from public.search_ingredients('ice', 50, 'en') s where s.id = v_ice)
    and exists (select 1 from public.search_ingredients('ice', 50, 'en', true) s where s.id = v_ice);
  v_report := v_report || format(E'%s  AC-10/AC-13 search hides Ice unless include_staples\n', case when v_ok then 'PASS' else 'FAIL' end);

  v_ok := (
    select bool_or((ing ->> 'is_staple')::boolean) filter (where ing ->> 'ingredient_id' = v_ice::text)
    from public.fetch_recipe_detail(v_mixed) d, jsonb_array_elements(d.ingredients) ing
  );
  v_report := v_report || format(E'%s  AC-10 recipe detail marks Ice as a staple\n', case when coalesce(v_ok, false) then 'PASS' else 'FAIL' end);

  ---------------------------------------------------------------------------
  -- AC-11: matching counts staples as present.
  ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_users[1], 'role', 'authenticated')::text, true);
  select * into r from public.match_recipes_to_pantry(0.25, 50, 0, 'en') m where m.id = v_mixed;
  v_ok := r.id is not null and r.missing_ratio = 0 and r.missing_ingredients = '[]'::jsonb
    and not exists (select 1 from public.match_recipes_to_pantry(1, 50, 0, 'en') m where m.id = v_staples_only);
  v_report := v_report || format(E'%s  AC-11 Gin plus Ice is a full match, a staples only recipe is excluded\n', case when v_ok then 'PASS' else 'FAIL' end);

  ---------------------------------------------------------------------------
  -- AC-4, AC-9: a rerun changes nothing; instructions only with an override.
  ---------------------------------------------------------------------------
  select string_agg(concat_ws('|', source_id, name, glass, instructions, deleted_at is null, merged_into_recipe_id), ',' order by source_id)
  into v_snapshot_before from public.recipes where source_id like '99%';
  perform public.import_catalog(v_drinks_without_hidden, v_merges, v_staples);
  select string_agg(concat_ws('|', source_id, name, glass, instructions, deleted_at is null, merged_into_recipe_id), ',' order by source_id)
  into v_snapshot_after from public.recipes where source_id like '99%';
  v_report := v_report || format(E'%s  AC-4 a second identical import changes nothing\n', case when v_snapshot_before = v_snapshot_after then 'PASS' else 'FAIL' end);

  perform public.import_catalog(
    (select jsonb_agg(case when d ->> 'sourceId' = '990001'
        then d || '{"instructions": "Changed without override."}'::jsonb else d end)
     from jsonb_array_elements(v_drinks_without_hidden) d),
    v_merges, v_staples);
  v_ok := (select instructions from public.recipes where id = v_target) = 'Original.';
  perform public.import_catalog(
    (select jsonb_agg(case when d ->> 'sourceId' = '990001'
        then d || '{"instructions": "Overridden.", "instructionsOverride": true}'::jsonb else d end)
     from jsonb_array_elements(v_drinks_without_hidden) d),
    v_merges, v_staples);
  v_ok := v_ok and (select instructions from public.recipes where id = v_target) = 'Overridden.';
  v_report := v_report || format(E'%s  AC-9 instructions change only with instructionsOverride\n', case when v_ok then 'PASS' else 'FAIL' end);

  ---------------------------------------------------------------------------
  -- Merge into a row that isn't live raises.
  ---------------------------------------------------------------------------
  begin
    perform public.import_catalog(v_drinks_without_hidden,
      '[{"fromSourceId": "990002", "toSourceId": "990003"}]'::jsonb, v_staples);
    v_ok := false;
  exception when others then
    v_ok := sqlerrm like 'merge target 990003 is not a live recipe%';
  end;
  v_report := v_report || format(E'%s  a merge into a hidden recipe raises\n', case when v_ok then 'PASS' else 'FAIL' end);

  raise exception E'Catalog cleanup checks finished, every change rolled back. % failed.\n\n%',
    (length(v_report) - length(replace(v_report, 'FAIL  ', ''))) / length('FAIL  '),
    v_report;
end;
$$;
