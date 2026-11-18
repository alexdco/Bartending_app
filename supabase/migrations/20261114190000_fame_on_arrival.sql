-- Catalog freshness rules (spec 0056), slice 6: fame for new recipes.
--
-- 1. recompute_popularity_ranks(text[]) is apply_region_proposals' step 3,
--    extracted: the same two phase rewrite (null the ranks in those regions,
--    then rank live scored rows top 10 by fame, name, id), so the partial
--    unique index on (region, popularity_rank) never sees a collision. It
--    takes its own advisory lock, so two callers reranking the same region
--    at once queue instead of colliding. Internal: no client can call it.
-- 2. apply_region_proposals calls it for its step 3. Same signature, so
--    create or replace keeps its grants.
-- 3. apply_fame_on_arrival(jsonb) is the import tail's apply step (AC-9): it
--    writes only rows whose fame_score is still null when the update takes
--    the row lock (so a score an admin set meanwhile wins), the proposed
--    region only when the recipe has none, then reranks every affected
--    region. Service role only.
-- 4. admin_upsert_recipe gains p_set_fame_score and p_fame_score (AC-10),
--    and reranks the old and new region in the same transaction when the
--    fame score or region changes. The signature changes, so the old one is
--    dropped and the grants are repeated. Body otherwise copied from
--    20261114160000_catalog_source_hash.sql.
-- 5. admin_delete_recipe reranks the deleted recipe's region (AC-3). Body
--    otherwise copied from 20261114150000_catalog_lock.sql.
--
-- Needs 20261114170000_catalog_reset.sql first (and is independent of
-- 20261114180000_merge_aliases.sql).
--
-- Before the first import that runs the fame tail, export
-- id, region, fame_score, popularity_rank from recipes as CSV (spec 0038's
-- rollback rule).
--
-- Rollback:
--   drop function public.apply_fame_on_arrival(jsonb);
--   drop function public.admin_upsert_recipe(
--     uuid, text, text, text, text, text, jsonb, jsonb, text[], boolean, text, boolean, smallint);
--   restore admin_upsert_recipe (with its drop, create, revoke, and grant)
--   from 20261114140000_recipe_method_source.sql, then its body from
--   20261114160000_catalog_source_hash.sql; admin_delete_recipe from
--   20261114150000_catalog_lock.sql; apply_region_proposals from
--   20261012130000_popularity_columns_and_fame_order.sql; then
--   drop function public.recompute_popularity_ranks(text[]);
--
-- Spec: docs/specs/0056-catalog-freshness-rules/index.md

begin;

-- 1. recompute_popularity_ranks ----------------------------------------------
create function public.recompute_popularity_ranks(p_regions text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_regions is null or cardinality(p_regions) = 0 then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtext('recompute_popularity_ranks'));

  update public.recipes r
  set popularity_rank = null
  where r.region = any (p_regions)
    and r.popularity_rank is not null;

  with ranked as (
    select r.id,
           row_number() over (
             partition by r.region
             order by r.fame_score desc, r.name asc, r.id asc
           ) as rn
    from public.recipes r
    where r.region = any (p_regions)
      and r.fame_score is not null
      and r.deleted_at is null
  )
  update public.recipes r
  set popularity_rank = ranked.rn
  from ranked
  where r.id = ranked.id
    and ranked.rn <= 10;
end;
$$;

revoke execute on function public.recompute_popularity_ranks(text[]) from public, anon, authenticated;

-- 2. apply_region_proposals --------------------------------------------------
create or replace function public.apply_region_proposals(proposals jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_regions text[];
  bad_count int;
begin
  perform pg_advisory_xact_lock(hashtext('apply_region_proposals'));

  -- Spec 0038: every proposal carries a fame score from 0 to 100; region is
  -- optional. Reject the whole payload before any write.
  select count(*) into bad_count
  from jsonb_to_recordset(proposals) as p(id uuid, region text, fame_score int)
  where p.fame_score is null or p.fame_score < 0 or p.fame_score > 100;

  if bad_count > 0 then
    raise exception 'apply_region_proposals: % proposal(s) have a missing or out of range fame_score', bad_count
      using errcode = '22023';
  end if;

  -- Step 1: null out region/fame_score/popularity_rank for every recipe in
  -- this payload, so a corrected rerun cleanly replaces a prior apply and the
  -- partial unique index on (region, popularity_rank) never sees a transient
  -- collision from the rewrite below. Regions this payload moves recipes out
  -- of are collected first so their ranks are recomputed too.
  select array_agg(distinct r.region) into affected_regions
  from public.recipes r
  join jsonb_to_recordset(proposals) as p(id uuid, region text, fame_score int)
    on p.id = r.id
  where r.region is not null;

  update public.recipes r
  set region = null, fame_score = null, popularity_rank = null
  from jsonb_to_recordset(proposals) as p(id uuid, region text, fame_score int)
  where r.id = p.id;

  -- Step 2: write the new region/fame_score from the reviewed proposals. A
  -- null region with a fame score is valid (spec 0038).
  update public.recipes r
  set region = p.region, fame_score = p.fame_score
  from jsonb_to_recordset(proposals) as p(id uuid, region text, fame_score int)
  where r.id = p.id;

  -- Step 3: recompute popularity_rank for every region this payload touched
  -- (old or new), through the shared helper (spec 0056).
  select array_agg(distinct x.region) into affected_regions
  from (
    select unnest(coalesce(affected_regions, '{}'::text[])) as region
    union
    select p.region
    from jsonb_to_recordset(proposals) as p(id uuid, region text, fame_score int)
    where p.region is not null
  ) x;

  perform public.recompute_popularity_ranks(affected_regions);
end;
$$;

-- 3. apply_fame_on_arrival (AC-9) --------------------------------------------
create function public.apply_fame_on_arrival(proposals jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_regions text[];
  bad_count int;
begin
  select count(*) into bad_count
  from jsonb_to_recordset(proposals) as p(id uuid, region text, fame_score int)
  where p.fame_score is null or p.fame_score < 0 or p.fame_score > 100;

  if bad_count > 0 then
    raise exception 'apply_fame_on_arrival: % proposal(s) have a missing or out of range fame_score', bad_count
      using errcode = '22023';
  end if;

  -- The update rechecks fame_score is null once it holds each row's lock,
  -- so a fame score an admin saved after the tail read the row is kept.
  with written as (
    update public.recipes r
    set fame_score = p.fame_score,
        region = coalesce(r.region, p.region),
        updated_at = now()
    from jsonb_to_recordset(proposals) as p(id uuid, region text, fame_score int)
    where r.id = p.id
      and r.fame_score is null
    returning r.region
  )
  select array_agg(distinct w.region) filter (where w.region is not null)
  into affected_regions
  from written w;

  perform public.recompute_popularity_ranks(affected_regions);
end;
$$;

revoke execute on function public.apply_fame_on_arrival(jsonb) from public, anon, authenticated;
grant execute on function public.apply_fame_on_arrival(jsonb) to service_role;

-- 4. admin_upsert_recipe with p_set_fame_score and p_fame_score (AC-10) ------
drop function public.admin_upsert_recipe(
  uuid, text, text, text, text, text, jsonb, jsonb, text[], boolean, text
);

create function public.admin_upsert_recipe(
  p_recipe_id uuid,
  p_name text,
  p_instructions text,
  p_glass text,
  p_alcoholic_status text,
  p_region text,
  p_ingredients jsonb,
  p_tags jsonb,
  p_flavor_profile text[] default null,
  p_set_method boolean default false,
  p_method text default null,
  p_set_fame_score boolean default false,
  p_fame_score smallint default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipe_row_id uuid;
  ingredient jsonb;
  tag jsonb;
  flavor text;
  ingredient_row_id uuid;
  tag_row_id uuid;
  tag_row_kind text;
  ingredient_count int;
  stored public.recipes%rowtype;
  stored_ingredients jsonb;
  input_ingredients jsonb;
  stored_tags text[];
  input_tags text[];
  import_owned_changed boolean;
  old_region text;
  old_fame_score smallint;
  rank_changed boolean;
begin
  if not exists (
    select 1 from public.user_preferences up
    where up.user_id = auth.uid()
      and up.is_admin
  ) then
    raise exception 'not authorized';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'name is required';
  end if;

  if length(p_name) > 200 then
    raise exception 'name must be 200 characters or fewer';
  end if;

  if p_instructions is null or btrim(p_instructions) = '' then
    raise exception 'instructions are required';
  end if;

  if length(p_instructions) > 10000 then
    raise exception 'instructions must be 10,000 characters or fewer';
  end if;

  if p_alcoholic_status is null
    or p_alcoholic_status not in ('alcoholic', 'non_alcoholic', 'optional', 'unknown')
  then
    raise exception 'alcoholic_status must be one of alcoholic, non_alcoholic, optional, unknown';
  end if;

  select coalesce(jsonb_array_length(p_ingredients), 0) into ingredient_count;

  if ingredient_count = 0 then
    raise exception 'at least one ingredient is required';
  end if;

  if p_flavor_profile is not null then
    foreach flavor in array p_flavor_profile
    loop
      if length(btrim(flavor)) > 50 then
        raise exception 'flavor must be 50 characters or fewer: %', flavor;
      end if;
    end loop;
  end if;

  -- recipes_method_check also rejects an unknown method; this gives the
  -- admin form a readable message first.
  if p_set_method
    and p_method is not null
    and p_method not in ('shake', 'stir', 'build', 'blend', 'layer')
  then
    raise exception 'method must be one of shake, stir, build, blend, layer';
  end if;

  -- Spec 0056 AC-10: a whole number from 0 to 100, or null (the next import
  -- scores it). smallint already rules out fractions.
  if p_set_fame_score
    and p_fame_score is not null
    and (p_fame_score < 0 or p_fame_score > 100)
  then
    raise exception 'fame score must be a whole number from 0 to 100';
  end if;

  perform pg_advisory_xact_lock(hashtext('admin_upsert_recipe'));

  if p_recipe_id is null then
    insert into public.recipes (
      source_id, source, name, instructions, glass, alcoholic_status, region, fame_score
    )
    values (
      'admin-' || gen_random_uuid()::text,
      'admin',
      p_name,
      p_instructions,
      p_glass,
      p_alcoholic_status,
      p_region,
      case when p_set_fame_score then p_fame_score end
    )
    returning id into recipe_row_id;

    rank_changed := p_region is not null
      or (p_set_fame_score and p_fame_score is not null);
  else
    -- Spec 0056 AC-1: read the stored row under the row lock before any
    -- write, so the comparison never sees content an import is changing.
    select * into stored
    from public.recipes r
    where r.id = p_recipe_id
    for update;

    if not found then
      raise exception 'recipe not found: %', p_recipe_id;
    end if;

    -- AC-10: the old region is read before the write, so both the region a
    -- recipe leaves and the one it joins are reranked.
    old_region := stored.region;
    old_fame_score := stored.fame_score;
    rank_changed := p_region is distinct from old_region
      or (p_set_fame_score and p_fame_score is distinct from old_fame_score);

    if stored.source = 'catalog' and stored.admin_locked_at is null then
      -- Each side is normalized the way the form normalizes before sending:
      -- ingredient names to ingredients.normalized_name, measures trimmed
      -- with blank as null, list order by position (the import numbers from
      -- 1, the form from 0), glass by lower(btrim()), tags as a set.
      select coalesce(
        jsonb_agg(
          jsonb_build_array(
            i.normalized_name,
            nullif(btrim(ri.measure), ''),
            ri.amount_value,
            ri.amount_max_value,
            ri.amount_unit
          )
          order by ri.sort_order, i.normalized_name
        ),
        '[]'::jsonb
      )
      into stored_ingredients
      from public.recipe_ingredients ri
      join public.ingredients i on i.id = ri.ingredient_id
      where ri.recipe_id = p_recipe_id;

      select coalesce(
        jsonb_agg(
          jsonb_build_array(
            lower(btrim(regexp_replace(e ->> 'name', '\s+', ' ', 'g'))),
            nullif(btrim(e ->> 'measure'), ''),
            (e ->> 'amount_value')::numeric,
            (e ->> 'amount_max_value')::numeric,
            e ->> 'amount_unit'
          )
          order by ord
        ),
        '[]'::jsonb
      )
      into input_ingredients
      from jsonb_array_elements(p_ingredients) with ordinality as x(e, ord);

      select coalesce(array_agg(t.normalized_name order by t.normalized_name), '{}')
      into stored_tags
      from public.recipe_tags rtags
      join public.tags t on t.id = rtags.tag_id and t.kind = 'catalog'
      where rtags.recipe_id = p_recipe_id;

      -- A name that matches an existing taste tag is skipped by the tag loop
      -- below, so it is no catalog tag change either.
      select coalesce(array_agg(n order by n), '{}')
      into input_tags
      from (
        select distinct lower(btrim(regexp_replace(e ->> 'name', '\s+', ' ', 'g'))) as n
        from jsonb_array_elements(coalesce(p_tags, '[]'::jsonb)) as e
        where nullif(btrim(e ->> 'name'), '') is not null
      ) names
      where not exists (
        select 1 from public.tags t
        where t.normalized_name = names.n and t.kind <> 'catalog'
      );

      import_owned_changed :=
        btrim(stored.name) is distinct from btrim(p_name)
        or nullif(lower(btrim(stored.glass)), '') is distinct from nullif(lower(btrim(p_glass)), '')
        or stored.alcoholic_status is distinct from p_alcoholic_status
        or (
          stored.source_id ~ '^custom:'
          and btrim(stored.instructions) is distinct from btrim(p_instructions)
        )
        or stored_ingredients is distinct from input_ingredients
        or stored_tags is distinct from input_tags;
    else
      import_owned_changed := false;
    end if;

    update public.recipes
    set name = p_name,
        instructions = p_instructions,
        glass = p_glass,
        alcoholic_status = p_alcoholic_status,
        region = p_region,
        fame_score = case when p_set_fame_score then p_fame_score else fame_score end,
        -- Cleared here so moving regions never collides with a rank already
        -- held in the new region; recompute_popularity_ranks sets it again.
        popularity_rank = case when rank_changed then null else popularity_rank end,
        admin_locked_at = case
          when import_owned_changed then now()
          else admin_locked_at
        end,
        -- AC-5: any save of a row that is locked after this save acknowledges
        -- the latest upstream version.
        source_hash = case
          when admin_locked_at is not null or import_owned_changed then latest_source_hash
          else source_hash
        end,
        updated_at = now()
    where id = p_recipe_id
    returning id into recipe_row_id;
  end if;

  delete from public.recipe_ingredients where recipe_id = recipe_row_id;

  delete from public.recipe_tags rtags
  using public.tags t
  where rtags.recipe_id = recipe_row_id
    and t.id = rtags.tag_id
    and t.kind = 'catalog';

  for ingredient in select * from jsonb_array_elements(p_ingredients)
  loop
    if (ingredient ->> 'name') is null or btrim(ingredient ->> 'name') = '' then
      raise exception 'ingredient name is required';
    end if;

    insert into public.ingredients (name)
    values (ingredient ->> 'name')
    on conflict (normalized_name) do update
    set name = excluded.name
    returning id into ingredient_row_id;

    -- recipe_ingredients_amount_unit_check and _amount_pair_check reject an
    -- unknown unit or a half set pair, and _amount_max_check rejects a max
    -- that is not above the value, failing the whole save atomically.
    insert into public.recipe_ingredients (
      recipe_id, ingredient_id, measure, sort_order, amount_value, amount_max_value, amount_unit
    )
    values (
      recipe_row_id,
      ingredient_row_id,
      ingredient ->> 'measure',
      (ingredient -> 'sortOrder')::int,
      (ingredient ->> 'amount_value')::numeric,
      (ingredient ->> 'amount_max_value')::numeric,
      ingredient ->> 'amount_unit'
    )
    on conflict (recipe_id, ingredient_id) do nothing;
  end loop;

  for tag in select * from jsonb_array_elements(coalesce(p_tags, '[]'::jsonb))
  loop
    if (tag ->> 'name') is null or btrim(tag ->> 'name') = '' then
      continue;
    end if;

    insert into public.tags (name)
    values (tag ->> 'name')
    on conflict (normalized_name) do update
    set name = excluded.name
    returning id, kind into tag_row_id, tag_row_kind;

    -- Flavor profile is managed only through p_flavor_profile.
    if tag_row_kind <> 'catalog' then
      continue;
    end if;

    insert into public.recipe_tags (recipe_id, tag_id)
    values (recipe_row_id, tag_row_id)
    on conflict (recipe_id, tag_id) do nothing;
  end loop;

  if p_flavor_profile is not null then
    delete from public.recipe_tags rtags
    using public.tags t
    where rtags.recipe_id = recipe_row_id
      and t.id = rtags.tag_id
      and t.kind = 'taste';

    foreach flavor in array p_flavor_profile
    loop
      if flavor is null or btrim(flavor) = '' then
        continue;
      end if;

      -- A new flavor becomes a new taste tag. An existing taste tag keeps its
      -- stored spelling. A catalog tag of the same name is promoted to taste
      -- (names are unique across kinds), as the vocabulary seed did for
      -- Fruity and Refreshing.
      insert into public.tags (name, kind)
      values (btrim(flavor), 'taste')
      on conflict (normalized_name) do update
      set kind = 'taste'
      returning id into tag_row_id;

      insert into public.recipe_tags (recipe_id, tag_id)
      values (recipe_row_id, tag_row_id)
      on conflict (recipe_id, tag_id) do nothing;
    end loop;

    update public.recipes
    set flavor_profile_locked = true
    where id = recipe_row_id;
  end if;

  -- Spec 0054 AC-11: only when the caller asks. A chosen method is an admin
  -- pick the classifier never overwrites; blank clears both columns, leaving
  -- the recipe free for the classifier's next run.
  if p_set_method then
    update public.recipes
    set method = p_method,
        method_source = case when p_method is null then null else 'admin' end
    where id = recipe_row_id;
  end if;

  if rank_changed then
    perform public.recompute_popularity_ranks(array_remove(array[old_region, p_region], null));
  end if;

  return recipe_row_id;
end;
$;


revoke all on function public.admin_upsert_recipe(
  uuid, text, text, text, text, text, jsonb, jsonb, text[], boolean, text, boolean, smallint
) from public, anon;

grant execute on function public.admin_upsert_recipe(
  uuid, text, text, text, text, text, jsonb, jsonb, text[], boolean, text, boolean, smallint
) to authenticated;

-- 5. admin_delete_recipe reranks the region it leaves (AC-3) -----------------
create or replace function public.admin_delete_recipe(p_recipe_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_region text;
begin
  if not exists (
    select 1 from public.user_preferences up
    where up.user_id = auth.uid()
      and up.is_admin
  ) then
    raise exception 'not authorized';
  end if;

  -- import_catalog raises when a merge target is not live, so deleting one
  -- would break every later import.
  if exists (
    select 1 from public.recipes r
    where r.merged_into_recipe_id = p_recipe_id
  ) then
    raise exception 'this recipe is a merge target in catalogOverrides.json';
  end if;

  update public.recipes
  set deleted_at = now(),
      popularity_rank = null,
      admin_locked_at = case
        when source = 'catalog' then coalesce(admin_locked_at, now())
        else admin_locked_at
      end
  where id = p_recipe_id
    and deleted_at is null
  returning region into deleted_region;

  if deleted_region is not null then
    perform public.recompute_popularity_ranks(array[deleted_region]);
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
