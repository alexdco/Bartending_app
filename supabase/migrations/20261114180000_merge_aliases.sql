-- Catalog freshness rules (spec 0056), slice 5: merge aliases in search.
--
-- 1. recipe_aliases accepts source = 'merge', with a partial unique index so
--    one kept recipe never holds the same merge alias twice.
-- 2. import_catalog rewrites every merge alias after the merge steps (AC-11):
--    delete all source = 'merge' rows, then insert one per merge resolved this
--    run, holding the hidden recipe's stored name. Same signature and return
--    type as 20261114160000_catalog_source_hash.sql, so create or replace
--    keeps its grants. Only step 5b is new.
-- 3. search_recipes gains an alias_matches tier (AC-12): bucket 1, the same
--    trigram rule as name_trgm_matches, over merge aliases of live recipes,
--    excluding ids the name tiers already returned. ingredient_matches
--    excludes it in turn, so a recipe appears once. Body copied from
--    20261111150000_cjk_search.sql; signature and output columns unchanged.
--    generated and manual aliases still affect only search_bartender.
--
-- recipe_aliases already has a public select policy; search_recipes stays
-- security invoker, so no policy changes.
--
-- Rollback:
--   delete from public.recipe_aliases where source = 'merge';
--   drop index public.recipe_aliases_merge_unique;
--   restore the source check to ('generated', 'manual');
--   restore import_catalog from 20261114160000_catalog_source_hash.sql and
--   search_recipes from 20261111150000_cjk_search.sql.
--
-- Checks after apply (spec 0056 verify.md, slice 5): run a real import, then
--   select count(*) from public.recipe_aliases where source = 'merge';
--   select name from public.search_recipes('long island tea');  -- Long Island Iced Tea, once
--
-- Spec: docs/specs/0056-catalog-freshness-rules/index.md

begin;

-- 1. recipe_aliases: merge source -------------------------------------------
alter table public.recipe_aliases
  drop constraint recipe_aliases_source_check;

alter table public.recipe_aliases
  add constraint recipe_aliases_source_check
  check (source in ('generated', 'manual', 'merge'));

create unique index recipe_aliases_merge_unique
  on public.recipe_aliases (recipe_id, lower(alias))
  where source = 'merge';

comment on table public.recipe_aliases is
  'Another name for a catalog recipe. generated and manual rows are bartender shorthand (e.g. "old f" for Old Fashioned), matched by search_bartender. merge rows hold a hidden duplicate''s name on the kept recipe, owned by import_catalog (spec 0056), and matched by both search_recipes and search_bartender.';

-- 2. import_catalog ----------------------------------------------------------
create or replace function public.import_catalog(
  drinks jsonb,
  merges jsonb default '[]'::jsonb,
  staple_names text[] default '{}'::text[],
  hidden_source_ids text[] default '{}'::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  drink jsonb;
  ingredient jsonb;
  tag jsonb;
  merge_entry jsonb;
  recipe_row_id uuid;
  recipe_locked_at timestamptz;
  recipe_stored_name text;
  recipe_deleted_at timestamptz;
  recipe_source_hash text;
  recipe_latest_source_hash text;
  ingredient_row_id uuid;
  tag_row_id uuid;
  from_row_id uuid;
  to_row_id uuid;
  seen_source_ids text[] := array[]::text[];
  merged_source_ids text[] := array[]::text[];
  normalized_staples text[];
  locked_skipped jsonb := '[]'::jsonb;
  changed_upstream jsonb := '[]'::jsonb;
  locked_still_deleted jsonb := '[]'::jsonb;
  kept_missing jsonb := '[]'::jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('import_catalog'));

  -- Step 1: upsert drinks. Instructions are written on first insert, and on
  -- later runs only when the overrides file replaces them. A locked row
  -- (spec 0056 AC-2) keeps its content columns and deleted_at; the
  -- on conflict branch reads the committed admin_locked_at under the row
  -- lock, so an admin save that commits first always wins.
  for drink in select * from jsonb_array_elements(drinks)
  loop
    seen_source_ids := array_append(seen_source_ids, drink ->> 'sourceId');

    insert into public.recipes (
      source_id, name, instructions, image_url, image_origin, image_source_url,
      glass, alcoholic_status, iba, deleted_at, source_hash, latest_source_hash
    )
    values (
      drink ->> 'sourceId',
      drink ->> 'name',
      drink ->> 'instructions',
      drink ->> 'imageUrl',
      -- The job decides the origin; a payload without one is a hotlink.
      coalesce(
        drink ->> 'imageOrigin',
        case when drink ->> 'imageUrl' is not null then 'external_hotlink' end
      ),
      drink ->> 'imageSourceUrl',
      drink ->> 'glass',
      drink ->> 'alcoholicStatus',
      drink ->> 'iba',
      null,
      drink ->> 'sourceHash',
      drink ->> 'sourceHash'
    )
    on conflict (source_id) do update
    set name = case
          when public.recipes.admin_locked_at is not null then public.recipes.name
          else excluded.name
        end,
        instructions = case
          when public.recipes.admin_locked_at is not null then public.recipes.instructions
          when coalesce((drink ->> 'instructionsOverride')::boolean, false)
            then excluded.instructions
          else public.recipes.instructions
        end,
        -- AC-6 (spec 0041): an admin uploaded (or admin removed) image is never touched.
        image_url = case
          when public.recipes.image_origin = 'admin_upload' then public.recipes.image_url
          else excluded.image_url
        end,
        image_origin = case
          when public.recipes.image_origin = 'admin_upload' then public.recipes.image_origin
          else excluded.image_origin
        end,
        image_source_url = case
          when public.recipes.image_origin = 'admin_upload' then public.recipes.image_source_url
          else excluded.image_source_url
        end,
        glass = case
          when public.recipes.admin_locked_at is not null then public.recipes.glass
          else excluded.glass
        end,
        alcoholic_status = case
          when public.recipes.admin_locked_at is not null then public.recipes.alcoholic_status
          else excluded.alcoholic_status
        end,
        iba = case
          when public.recipes.admin_locked_at is not null then public.recipes.iba
          else excluded.iba
        end,
        deleted_at = case
          when public.recipes.admin_locked_at is not null then public.recipes.deleted_at
          else null
        end,
        -- AC-5: the acknowledged version moves with the content, so a locked
        -- row keeps its baseline once it has one.
        source_hash = case
          when public.recipes.admin_locked_at is not null
            and public.recipes.source_hash is not null
            then public.recipes.source_hash
          else excluded.source_hash
        end,
        latest_source_hash = excluded.latest_source_hash,
        updated_at = now()
    returning id, admin_locked_at, name, deleted_at, source_hash, latest_source_hash
      into recipe_row_id, recipe_locked_at, recipe_stored_name, recipe_deleted_at,
        recipe_source_hash, recipe_latest_source_hash;

    -- The child row steps branch on the value the upsert returned, not an
    -- earlier read.
    if recipe_locked_at is not null then
      locked_skipped := locked_skipped || jsonb_build_array(
        jsonb_build_object('sourceId', drink ->> 'sourceId', 'name', recipe_stored_name)
      );

      if recipe_source_hash is distinct from recipe_latest_source_hash then
        changed_upstream := changed_upstream || jsonb_build_array(
          jsonb_build_object('sourceId', drink ->> 'sourceId', 'name', recipe_stored_name)
        );
      end if;

      -- AC-4: back in the payload but still deleted; Reset brings it back.
      if recipe_deleted_at is not null then
        locked_still_deleted := locked_still_deleted || jsonb_build_array(
          jsonb_build_object('sourceId', drink ->> 'sourceId', 'name', recipe_stored_name)
        );
      end if;

      continue;
    end if;

    delete from public.recipe_ingredients where recipe_id = recipe_row_id;
    -- Only catalog tags come from the payload; taste tags belong to the
    -- classify-recipes backfill and must survive a reimport.
    delete from public.recipe_tags rtags
    using public.tags t
    where rtags.recipe_id = recipe_row_id
      and t.id = rtags.tag_id
      and t.kind = 'catalog';

    for ingredient in select * from jsonb_array_elements(drink -> 'ingredients')
    loop
      insert into public.ingredients (name)
      values (ingredient ->> 'ingredientName')
      on conflict (normalized_name) do update
      set name = excluded.name
      returning id into ingredient_row_id;

      insert into public.recipe_ingredients (
        recipe_id, ingredient_id, measure, sort_order, amount_value, amount_max_value, amount_unit
      )
      values (
        recipe_row_id,
        ingredient_row_id,
        ingredient ->> 'measure',
        (ingredient ->> 'sortOrder')::int,
        (ingredient ->> 'amountValue')::numeric,
        (ingredient ->> 'amountMaxValue')::numeric,
        ingredient ->> 'amountUnit'
      )
      on conflict (recipe_id, ingredient_id) do update
      set measure = excluded.measure,
          amount_value = excluded.amount_value,
          amount_max_value = excluded.amount_max_value,
          amount_unit = excluded.amount_unit;
    end loop;

    for tag in select * from jsonb_array_elements(drink -> 'tags')
    loop
      insert into public.tags (name)
      values (tag ->> 'tagName')
      on conflict (normalized_name) do update
      set name = excluded.name
      returning id into tag_row_id;

      insert into public.recipe_tags (recipe_id, tag_id)
      values (recipe_row_id, tag_row_id)
      on conflict (recipe_id, tag_id) do nothing;
    end loop;
  end loop;

  -- Step 2: reconcile soft deletes. Only TheCocktailDB rows: custom recipes
  -- ("custom:" ids) and admin recipes (source 'admin') are never in this
  -- payload, so they must never be hidden by its absence. AC-4: a locked row
  -- gone from source stays live (and is reported), unless the overrides hide
  -- it, which soft deletes it like an unlocked row.
  select coalesce(
    jsonb_agg(jsonb_build_object('sourceId', r.source_id, 'name', r.name) order by r.source_id),
    '[]'::jsonb
  )
  into kept_missing
  from public.recipes r
  where r.source = 'catalog'
    and r.source_id !~ '^custom:'
    and r.admin_locked_at is not null
    and r.deleted_at is null
    and r.source_id <> all (seen_source_ids)
    and r.source_id <> all (hidden_source_ids);

  update public.recipes
  set deleted_at = now()
  where source = 'catalog'
    and source_id !~ '^custom:'
    and source_id <> all (seen_source_ids)
    and deleted_at is null
    and (admin_locked_at is null or source_id = any (hidden_source_ids));

  -- Steps 3 to 5: resolve merges after the upsert, so a target that is new
  -- this run works. One hop only; the import validates there are no chains.
  for merge_entry in select * from jsonb_array_elements(merges)
  loop
    select r.id into from_row_id
    from public.recipes r
    where r.source_id = merge_entry ->> 'fromSourceId';

    if from_row_id is null then
      continue;
    end if;

    select r.id into to_row_id
    from public.recipes r
    where r.source_id = merge_entry ->> 'toSourceId'
      and r.deleted_at is null;

    if to_row_id is null then
      raise exception 'merge target % is not a live recipe', merge_entry ->> 'toSourceId';
    end if;

    merged_source_ids := array_append(merged_source_ids, merge_entry ->> 'fromSourceId');

    update public.recipes
    set merged_into_recipe_id = to_row_id
    where id = from_row_id
      and merged_into_recipe_id is distinct from to_row_id;

    -- A user who already holds the target keeps that one row.
    delete from public.favorites f
    where f.recipe_id = from_row_id
      and exists (
        select 1 from public.favorites g
        where g.user_id = f.user_id and g.recipe_id = to_row_id
      );

    update public.favorites set recipe_id = to_row_id where recipe_id = from_row_id;

    delete from public.pinned_recipes p
    where p.recipe_id = from_row_id
      and exists (
        select 1 from public.pinned_recipes q
        where q.user_id = p.user_id and q.recipe_id = to_row_id
      );

    -- An update never fires the 20 pin insert trigger, so a user at the
    -- limit doesn't abort the import.
    update public.pinned_recipes set recipe_id = to_row_id where recipe_id = from_row_id;
  end loop;

  -- Step 4: clear pointers no longer named in the overrides file.
  update public.recipes
  set merged_into_recipe_id = null
  where source = 'catalog'
    and merged_into_recipe_id is not null
    and source_id <> all (merged_source_ids);

  -- Step 5b (spec 0056 AC-11): merge aliases mirror the overrides file. Every
  -- merge row is rewritten each run, so a merge removed from the file loses
  -- its alias. The alias is the hidden recipe's stored name (even if a lock
  -- renamed it), skipped when it equals the kept recipe's name ignoring case.
  -- A merge whose hidden recipe doesn't exist gets no alias; a merge whose
  -- target isn't live already raised above. Only this function writes or
  -- deletes source = 'merge' rows.
  delete from public.recipe_aliases where source = 'merge';

  insert into public.recipe_aliases (recipe_id, alias, source)
  select to_r.id, from_r.name, 'merge'
  from jsonb_array_elements(merges) as m (entry)
  join public.recipes from_r on from_r.source_id = m.entry ->> 'fromSourceId'
  join public.recipes to_r
    on to_r.source_id = m.entry ->> 'toSourceId'
   and to_r.deleted_at is null
  where lower(from_r.name) <> lower(to_r.name)
  on conflict do nothing;

  -- Step 6: staple flags, matched on the same normalization as
  -- ingredients.normalized_name.
  normalized_staples := array(
    select lower(btrim(regexp_replace(s, '\s+', ' ', 'g')))
    from unnest(staple_names) as s
  );

  update public.ingredients
  set is_staple = (normalized_name = any (normalized_staples))
  where is_staple is distinct from (normalized_name = any (normalized_staples));

  -- Step 7: staples never live in a pantry or shopping list.
  delete from public.pantry_items pi
  using public.ingredients i
  where i.id = pi.ingredient_id and i.is_staple;

  delete from public.shopping_list_items sli
  using public.ingredients i
  where i.id = sli.ingredient_id and i.is_staple;

  return jsonb_build_object(
    'lockedSkipped', locked_skipped,
    'changedUpstream', changed_upstream,
    'keptMissing', kept_missing,
    'lockedStillDeleted', locked_still_deleted
  );
end;
$$;

revoke execute on function public.import_catalog(jsonb, jsonb, text[], text[]) from public, anon, authenticated;
grant execute on function public.import_catalog(jsonb, jsonb, text[], text[]) to service_role;

-- 3. search_recipes: alias_matches tier --------------------------------------
create or replace function public.search_recipes(
  query text default ''::text,
  status_filter text default null::text,
  page_limit integer default 20,
  page_offset integer default 0,
  locale text default 'en'::text
)
returns table (id uuid, name text, image_url text, alcoholic_status text, base_name text)
language sql
stable
set search_path = ''
as $function$
  with resolved_locale as (
    select public.resolve_locale(locale) as locale,
           public.locale_search_config(locale) as cfg
  ),
  cjk_query as (
    select public.search_fold(query) as folded,
           public.has_cjk(query) and public.search_fold(query) <> '' as active
  ),
  name_matches as (
    select r.id,
           coalesce(rt.name, r.name) as name,
           r.image_url, r.alcoholic_status,
           0 as match_bucket,
           greatest(
             ts_rank(r.name_search, websearch_to_tsquery('english', query), 1),
             coalesce(ts_rank(rt.name_search, websearch_to_tsquery((select cfg from resolved_locale), query), 1), 0)
           ) as rank,
           r.fame_score,
           r.name as base_name
    from public.recipes r
    left join public.recipe_translations rt
      on rt.recipe_id = r.id and rt.locale = (select locale from resolved_locale)
    where r.deleted_at is null
      and query <> ''
      and (
        r.name_search @@ websearch_to_tsquery('english', query)
        or (rt.name_search is not null and rt.name_search @@ websearch_to_tsquery((select cfg from resolved_locale), query))
      )
      and (status_filter is null or r.alcoholic_status = status_filter)
  ),
  name_trgm_matches as (
    select r.id,
           coalesce(rt.name, r.name) as name,
           r.image_url, r.alcoholic_status,
           1 as match_bucket,
           extensions.word_similarity(query, r.name) as rank,
           r.fame_score,
           r.name as base_name
    from public.recipes r
    left join public.recipe_translations rt
      on rt.recipe_id = r.id and rt.locale = (select locale from resolved_locale)
    where r.deleted_at is null
      and query <> ''
      and query operator(extensions.<%) r.name
      and r.id not in (select nm.id from name_matches nm)
      and (status_filter is null or r.alcoholic_status = status_filter)
  ),
  name_cjk_matches as (
    select r.id,
           coalesce(rt.name, r.name) as name,
           r.image_url, r.alcoholic_status,
           1 as match_bucket,
           (case when starts_with(public.search_fold(rt.name), (select folded from cjk_query))
                 then 1.0 else 0.5 end)::real as rank,
           r.fame_score,
           r.name as base_name
    from public.recipes r
    left join public.recipe_translations rt
      on rt.recipe_id = r.id and rt.locale = (select locale from resolved_locale)
    where (select active from cjk_query)
      and r.deleted_at is null
      and rt.name is not null
      and strpos(public.search_fold(rt.name), (select folded from cjk_query)) > 0
      and r.id not in (select nm.id from name_matches nm)
      and r.id not in (select ntm.id from name_trgm_matches ntm)
      and (status_filter is null or r.alcoholic_status = status_filter)
  ),
  -- Spec 0056 AC-12: a merged duplicate's old name finds the kept recipe.
  -- Same trigram rule and rank as name_trgm_matches; a recipe with several
  -- merge aliases takes its best one.
  alias_matches as (
    select r.id,
           coalesce(rt.name, r.name) as name,
           r.image_url, r.alcoholic_status,
           1 as match_bucket,
           max(extensions.word_similarity(query, ra.alias))::real as rank,
           r.fame_score,
           r.name as base_name
    from public.recipe_aliases ra
    join public.recipes r on r.id = ra.recipe_id
    left join public.recipe_translations rt
      on rt.recipe_id = r.id and rt.locale = (select locale from resolved_locale)
    where ra.source = 'merge'
      and r.deleted_at is null
      and query <> ''
      and query operator(extensions.<%) ra.alias
      and r.id not in (select nm.id from name_matches nm)
      and r.id not in (select ntm.id from name_trgm_matches ntm)
      and r.id not in (select ncm.id from name_cjk_matches ncm)
      and (status_filter is null or r.alcoholic_status = status_filter)
    group by r.id, rt.name, r.name, r.image_url, r.alcoholic_status, r.fame_score
  ),
  ingredient_matches as (
    select distinct r.id,
           coalesce(rt.name, r.name) as name,
           r.image_url, r.alcoholic_status,
           2 as match_bucket,
           0::real as rank,
           r.fame_score,
           r.name as base_name
    from public.recipes r
    left join public.recipe_translations rt
      on rt.recipe_id = r.id and rt.locale = (select locale from resolved_locale)
    join public.recipe_ingredients ri on ri.recipe_id = r.id
    join public.ingredients i on i.id = ri.ingredient_id
    left join public.ingredient_translations it
      on it.ingredient_id = i.id and it.locale = (select locale from resolved_locale)
    where r.deleted_at is null
      and query <> ''
      and (
        query operator(extensions.<%) i.name
        or (it.name is not null and query operator(extensions.<%) it.name)
        or ((select active from cjk_query)
            and it.name is not null
            and strpos(public.search_fold(it.name), (select folded from cjk_query)) > 0)
      )
      and r.id not in (select nm.id from name_matches nm)
      and r.id not in (select ntm.id from name_trgm_matches ntm)
      and r.id not in (select ncm.id from name_cjk_matches ncm)
      and r.id not in (select am.id from alias_matches am)
      and (status_filter is null or r.alcoholic_status = status_filter)
  ),
  browse_all as (
    select r.id,
           coalesce(rt.name, r.name) as name,
           r.image_url, r.alcoholic_status,
           0 as match_bucket,
           0::real as rank,
           r.fame_score,
           r.name as base_name
    from public.recipes r
    left join public.recipe_translations rt
      on rt.recipe_id = r.id and rt.locale = (select locale from resolved_locale)
    where r.deleted_at is null
      and query = ''
      and (status_filter is null or r.alcoholic_status = status_filter)
  ),
  combined as (
    select * from name_matches
    union all
    select * from name_trgm_matches
    union all
    select * from name_cjk_matches
    union all
    select * from alias_matches
    union all
    select * from ingredient_matches
    union all
    select * from browse_all
  )
  select c.id, c.name, c.image_url, c.alcoholic_status, c.base_name
  from combined c
  order by c.match_bucket asc, c.rank desc, c.fame_score desc nulls last, c.name asc, c.id asc
  limit least(greatest(page_limit, 1), 50)
  offset greatest(page_offset, 0);
$function$;

revoke execute on function public.search_recipes(text, text, integer, integer, text) from public;
grant execute on function public.search_recipes(text, text, integer, integer, text)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
