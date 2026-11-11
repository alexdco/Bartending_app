-- Recipe read functions return base_name (spec 0048, build step 2, AC-5, AC-9).
--
-- Each of the eight recipe read functions the apps build recipe slugs from
-- gains base_name (the English recipes.name) as its last output column, so a
-- name in a script with no transliteration table (Devanagari, later CJK and
-- Arabic) can fall back to an English slug in buildRecipeSlugPath.
--
-- This is locale agnostic and live for every locale as soon as it applies:
-- the added column is the only change in output. Bodies are copied from the
-- live definitions (pg_get_functiondef, 2026-11-11), with base_name carried
-- through. A new output column needs drop and create, not create or replace,
-- so each function's revoke and grants are restated to match the live ACL
-- (anon, authenticated, service_role; no public). Every function keeps
-- security invoker and search_path ''.
--
-- Bar and service functions (fetch_bar_recipe_detail, search_bartender,
-- search_recipes_by_ingredients, fetch_bar_service_data) are unchanged; no
-- slug is built from them. search_bartender calls search_recipes but names
-- its columns (sr.id, sr.name), so the added column does not reach it.
--
-- Apply before deploying the TS that reads base_name.
-- Rollback: supabase/rollbacks/20261111130000_recipe_read_base_name_down.sql.
--
-- Check after apply (expect no rows):
--   select r.id from public.recipes r
--   cross join lateral public.fetch_recipe_detail(r.id, 'ru') d
--   where r.deleted_at is null and d.base_name is distinct from r.name;

begin;

-- 1. search_recipes
drop function public.search_recipes(text, text, integer, integer, text);

create function public.search_recipes(
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
as $$
  with resolved_locale as (
    select public.resolve_locale(locale) as locale,
           public.locale_search_config(locale) as cfg
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
      and (query operator(extensions.<%) i.name or (it.name is not null and query operator(extensions.<%) it.name))
      and r.id not in (select nm.id from name_matches nm)
      and r.id not in (select ntm.id from name_trgm_matches ntm)
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
    select * from ingredient_matches
    union all
    select * from browse_all
  )
  select c.id, c.name, c.image_url, c.alcoholic_status, c.base_name
  from combined c
  order by c.match_bucket asc, c.rank desc, c.fame_score desc nulls last, c.name asc, c.id asc
  limit least(greatest(page_limit, 1), 50)
  offset greatest(page_offset, 0);
$$;

revoke execute on function public.search_recipes(text, text, integer, integer, text) from public;
grant execute on function public.search_recipes(text, text, integer, integer, text)
  to anon, authenticated, service_role;

-- 2. classic_recipes
drop function public.classic_recipes(integer, text);

create function public.classic_recipes(page_limit integer default 10, locale text default 'en'::text)
returns table (id uuid, name text, image_url text, alcoholic_status text, base_name text)
language sql
stable
set search_path = ''
as $$
  with resolved_locale as (
    select public.resolve_locale(locale) as locale
  )
  select r.id,
         coalesce(rt.name, r.name) as name,
         r.image_url,
         r.alcoholic_status,
         r.name as base_name
  from public.recipes r
  left join public.recipe_translations rt
    on rt.recipe_id = r.id and rt.locale = (select locale from resolved_locale)
  where r.deleted_at is null
    and r.fame_score is not null
  order by r.fame_score desc, coalesce(rt.name, r.name) asc, r.id asc
  limit least(greatest(page_limit, 1), 50);
$$;

revoke execute on function public.classic_recipes(integer, text) from public;
grant execute on function public.classic_recipes(integer, text)
  to anon, authenticated, service_role;

-- 3. recommend_recipes
drop function public.recommend_recipes(uuid[], uuid, integer, integer, text);

create function public.recommend_recipes(
  recent_recipe_ids uuid[] default '{}'::uuid[],
  current_recipe_id uuid default null::uuid,
  page_limit integer default 20,
  page_offset integer default 0,
  locale text default 'en'::text
)
returns table (id uuid, name text, image_url text, alcoholic_status text, score real, base_name text)
language plpgsql
stable
set search_path = ''
as $$
declare
  capped_recent_ids uuid[];
  resolved_locale text;
begin
  if auth.uid() is null then
    raise exception 'no active session' using errcode = '28000';
  end if;

  resolved_locale := public.resolve_locale(locale);

  select coalesce(array_agg(distinct rid), '{}'::uuid[])
  into capped_recent_ids
  from (
    select r.id as rid
    from unnest(coalesce(recent_recipe_ids, '{}'::uuid[])) with ordinality as t(id, ord)
    join public.recipes r on r.id = t.id and r.deleted_at is null
    order by t.ord
    limit 20
  ) capped;

  return query
  with weighted_ingredients as (
    select pi.ingredient_id, 1.0::real as weight
    from public.pantry_items pi
    where pi.user_id = auth.uid()
    union all
    select ri.ingredient_id, 0.75::real as weight
    from public.favorites f
    join public.recipe_ingredients ri on ri.recipe_id = f.recipe_id
    where f.user_id = auth.uid()
    union all
    select ri.ingredient_id, 0.5::real as weight
    from public.recipe_ingredients ri
    where ri.recipe_id = any (capped_recent_ids)
    union all
    select ri.ingredient_id,
      case ra.score
        when 5 then 1.0::real
        when 4 then 0.6::real
      end as weight
    from public.ratings ra
    join public.recipe_ingredients ri on ri.recipe_id = ra.recipe_id
    where ra.user_id = auth.uid()
      and ra.score >= 4
  ),
  ingredient_weights as (
    select ingredient_id, max(weight) as weight
    from weighted_ingredients
    group by ingredient_id
  ),
  recipe_totals as (
    select ri.recipe_id, count(*) as total_count
    from public.recipe_ingredients ri
    group by ri.recipe_id
  ),
  scored as (
    select
      r.id,
      coalesce(rt.name, r.name) as name,
      r.image_url,
      r.alcoholic_status,
      (sum(coalesce(iw.weight, 0)) / rt2.total_count::real) as score,
      r.name as base_name
    from public.recipes r
    left join public.recipe_translations rt
      on rt.recipe_id = r.id and rt.locale = resolved_locale
    join recipe_totals rt2 on rt2.recipe_id = r.id
    join public.recipe_ingredients ri on ri.recipe_id = r.id
    left join ingredient_weights iw on iw.ingredient_id = ri.ingredient_id
    where r.deleted_at is null
      and (current_recipe_id is null or r.id <> current_recipe_id)
      and not exists (
        select 1 from public.favorites f
        where f.user_id = auth.uid() and f.recipe_id = r.id
      )
      and not exists (
        select 1 from public.ratings ra
        where ra.user_id = auth.uid() and ra.recipe_id = r.id
      )
    group by r.id, rt.name, r.name, r.image_url, r.alcoholic_status, rt2.total_count
    having sum(coalesce(iw.weight, 0)) > 0
  ),
  scored_page as (
    select s.id, s.name, s.image_url, s.alcoholic_status, s.score, s.base_name
    from scored s
    order by s.score desc, s.name asc, s.id asc
    limit least(greatest(page_limit, 1), 50)
    offset greatest(page_offset, 0)
  ),
  fallback_page as (
    select r.id,
           coalesce(rt.name, r.name) as name,
           r.image_url, r.alcoholic_status, 0::real as score,
           r.name as base_name
    from public.recipes r
    left join public.recipe_translations rt
      on rt.recipe_id = r.id and rt.locale = resolved_locale
    where r.deleted_at is null
      and (current_recipe_id is null or r.id <> current_recipe_id)
      and not exists (
        select 1 from public.favorites f
        where f.user_id = auth.uid() and f.recipe_id = r.id
      )
      and not exists (
        select 1 from public.ratings ra
        where ra.user_id = auth.uid() and ra.recipe_id = r.id
      )
    order by r.name asc, r.id asc
    limit least(greatest(page_limit, 1), 50)
    offset greatest(page_offset, 0)
  )
  select * from scored_page
  where greatest(page_offset, 0) > 0
     or exists (select 1 from scored s)
  union all
  select * from fallback_page
  where greatest(page_offset, 0) = 0
    and not exists (select 1 from scored s);
end;
$$;

revoke execute on function public.recommend_recipes(uuid[], uuid, integer, integer, text) from public;
grant execute on function public.recommend_recipes(uuid[], uuid, integer, integer, text)
  to anon, authenticated, service_role;

-- 4. match_recipes_to_pantry
drop function public.match_recipes_to_pantry(real, integer, integer, text);

create function public.match_recipes_to_pantry(
  max_ratio real default 0.25,
  page_limit integer default 20,
  page_offset integer default 0,
  locale text default 'en'::text
)
returns table (
  id uuid,
  name text,
  image_url text,
  alcoholic_status text,
  missing_ratio real,
  missing_ingredients jsonb,
  base_name text
)
language plpgsql
stable
set search_path = ''
as $$
declare
  resolved_locale text;
begin
  if auth.uid() is null then
    raise exception 'no active session' using errcode = '28000';
  end if;

  resolved_locale := public.resolve_locale(locale);

  return query
  with recipe_totals as (
    -- total_count still counts every line, so "x of y" describes the whole
    -- recipe; a recipe made only of staples is excluded below.
    select
      ri.recipe_id,
      count(*) as total_count,
      count(*) filter (where not i.is_staple) as non_staple_count
    from public.recipe_ingredients ri
    join public.ingredients i on i.id = ri.ingredient_id
    group by ri.recipe_id
  ),
  recipe_missing as (
    select
      ri.recipe_id,
      count(*) filter (where pi.ingredient_id is null and not i.is_staple) as missing_count,
      jsonb_agg(
        jsonb_build_object('id', i.id, 'name', coalesce(it.name, i.name))
        order by coalesce(it.name, i.name) asc
      ) filter (where pi.ingredient_id is null and not i.is_staple) as missing_ingredients
    from public.recipe_ingredients ri
    join public.ingredients i on i.id = ri.ingredient_id
    left join public.ingredient_translations it
      on it.ingredient_id = i.id and it.locale = resolved_locale
    left join public.pantry_items pi
      on pi.ingredient_id = ri.ingredient_id
      and pi.user_id = auth.uid()
    group by ri.recipe_id
  ),
  scored as (
    select
      r.id,
      coalesce(rt.name, r.name) as name,
      r.image_url,
      r.alcoholic_status,
      (rm.missing_count::real / rt2.total_count::real) as missing_ratio,
      coalesce(rm.missing_ingredients, '[]'::jsonb) as missing_ingredients,
      r.name as base_name
    from public.recipes r
    left join public.recipe_translations rt
      on rt.recipe_id = r.id and rt.locale = resolved_locale
    join recipe_totals rt2 on rt2.recipe_id = r.id
    join recipe_missing rm on rm.recipe_id = r.id
    where r.deleted_at is null
      and rt2.non_staple_count > 0
      and (
        (rm.missing_count::real / rt2.total_count::real) <= max_ratio
        or rm.missing_count = 1
      )
  )
  select s.id, s.name, s.image_url, s.alcoholic_status, s.missing_ratio, s.missing_ingredients, s.base_name
  from scored s
  order by s.missing_ratio asc, s.name asc, s.id asc
  limit least(greatest(page_limit, 1), 50)
  offset greatest(page_offset, 0);
end;
$$;

revoke execute on function public.match_recipes_to_pantry(real, integer, integer, text) from public;
grant execute on function public.match_recipes_to_pantry(real, integer, integer, text)
  to anon, authenticated, service_role;

-- 5. popular_recipes_by_region
drop function public.popular_recipes_by_region(text, text);

create function public.popular_recipes_by_region(region_filter text, locale text default 'en'::text)
returns table (
  id uuid,
  name text,
  image_url text,
  alcoholic_status text,
  popularity_rank integer,
  base_name text
)
language sql
stable
set search_path = ''
as $$
  with resolved_locale as (
    select public.resolve_locale(locale) as locale
  )
  select r.id,
         coalesce(rt.name, r.name) as name,
         r.image_url, r.alcoholic_status, r.popularity_rank,
         r.name as base_name
  from public.recipes r
  left join public.recipe_translations rt
    on rt.recipe_id = r.id and rt.locale = (select locale from resolved_locale)
  where r.deleted_at is null
    and r.region = region_filter
    and r.popularity_rank is not null
  order by r.popularity_rank asc
  limit 10;
$$;

revoke execute on function public.popular_recipes_by_region(text, text) from public;
grant execute on function public.popular_recipes_by_region(text, text)
  to anon, authenticated, service_role;

-- 6. fetch_favorite_recipes
drop function public.fetch_favorite_recipes(text, integer, integer);

create function public.fetch_favorite_recipes(
  p_locale text default 'en'::text,
  p_page_limit integer default 20,
  p_page_offset integer default 0
)
returns table (id uuid, name text, image_url text, alcoholic_status text, base_name text)
language sql
stable
set search_path = ''
as $$
  with resolved_locale as (
    select public.resolve_locale(p_locale) as locale
  )
  select
    r.id,
    coalesce(rt.name, r.name) as name,
    r.image_url,
    r.alcoholic_status,
    r.name as base_name
  from public.favorites f
  join public.recipes r on r.id = f.recipe_id
  left join public.recipe_translations rt
    on rt.recipe_id = r.id
    and rt.locale = (select locale from resolved_locale)
  where f.user_id = auth.uid()
  order by f.created_at desc
  limit least(greatest(p_page_limit, 1), 50)
  offset greatest(p_page_offset, 0);
$$;

revoke execute on function public.fetch_favorite_recipes(text, integer, integer) from public;
grant execute on function public.fetch_favorite_recipes(text, integer, integer)
  to anon, authenticated, service_role;

-- 7. fetch_recipes_by_ids
drop function public.fetch_recipes_by_ids(uuid[], text);

create function public.fetch_recipes_by_ids(p_ids uuid[], p_locale text default 'en'::text)
returns table (id uuid, name text, image_url text, alcoholic_status text, base_name text)
language sql
stable
set search_path = ''
as $$
  with resolved_locale as (
    select public.resolve_locale(p_locale) as locale
  )
  select
    r.id,
    coalesce(rt.name, r.name) as name,
    r.image_url,
    r.alcoholic_status,
    r.name as base_name
  from unnest(p_ids) with ordinality as t(id, ord)
  join public.recipes r on r.id = t.id and r.deleted_at is null
  left join public.recipe_translations rt
    on rt.recipe_id = r.id
    and rt.locale = (select locale from resolved_locale)
  order by t.ord;
$$;

revoke execute on function public.fetch_recipes_by_ids(uuid[], text) from public;
grant execute on function public.fetch_recipes_by_ids(uuid[], text)
  to anon, authenticated, service_role;

-- 8. fetch_recipe_detail
drop function public.fetch_recipe_detail(uuid, text);

create function public.fetch_recipe_detail(p_id uuid, p_locale text default 'en'::text)
returns table (
  id uuid,
  name text,
  instructions text,
  image_url text,
  alcoholic_status text,
  glass text,
  difficulty text,
  method text,
  straining text,
  taste_tags text[],
  is_favorited boolean,
  ingredients jsonb,
  is_cocktaildb_recipe boolean,
  drink_style text,
  drink_style_note text,
  bartender_tip text,
  presentation_tip text,
  base_name text
)
language sql
stable
set search_path = ''
as $$
  with resolved_locale as (
    select public.resolve_locale(p_locale) as locale
  )
  select
    r.id,
    coalesce(rt.name, r.name) as name,
    coalesce(rt.instructions, r.instructions) as instructions,
    r.image_url,
    r.alcoholic_status,
    coalesce(rt.glass, r.glass) as glass,
    r.difficulty,
    r.method,
    r.straining,
    coalesce(
      (
        select array_agg(coalesce(tt.name, t.name) order by t.normalized_name)
        from public.recipe_tags rtags
        join public.tags t on t.id = rtags.tag_id and t.kind = 'taste'
        left join public.tag_translations tt
          on tt.tag_id = t.id and tt.locale = (select locale from resolved_locale)
        where rtags.recipe_id = r.id
      ),
      array[]::text[]
    ) as taste_tags,
    exists (
      select 1 from public.favorites f
      where f.recipe_id = r.id and f.user_id = auth.uid()
    ) as is_favorited,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'ingredient_id', ri.ingredient_id,
            'name', coalesce(it.name, i.name),
            'measure', coalesce(rit.measure, ri.measure),
            'sort_order', ri.sort_order,
            'amount_value', ri.amount_value,
            'amount_unit', ri.amount_unit,
            'category', i.category,
            'is_staple', i.is_staple,
            'allergens', i.allergens
          )
          order by ri.sort_order
        )
        from public.recipe_ingredients ri
        join public.ingredients i on i.id = ri.ingredient_id
        left join public.ingredient_translations it
          on it.ingredient_id = i.id and it.locale = (select locale from resolved_locale)
        left join public.recipe_ingredient_translations rit
          on rit.recipe_id = ri.recipe_id
          and rit.ingredient_id = ri.ingredient_id
          and rit.locale = (select locale from resolved_locale)
        where ri.recipe_id = r.id
      ),
      '[]'::jsonb
    ) as ingredients,
    (r.source = 'catalog' and r.source_id !~ '^custom:') as is_cocktaildb_recipe,
    r.drink_style,
    coalesce(rt.drink_style_note, r.drink_style_note) as drink_style_note,
    coalesce(rt.bartender_tip, r.bartender_tip) as bartender_tip,
    coalesce(rt.presentation_tip, r.presentation_tip) as presentation_tip,
    r.name as base_name
  from public.recipes r
  left join public.recipe_translations rt
    on rt.recipe_id = r.id and rt.locale = (select locale from resolved_locale)
  where r.id = p_id
    and r.deleted_at is null;
$$;

revoke execute on function public.fetch_recipe_detail(uuid, text) from public;
grant execute on function public.fetch_recipe_detail(uuid, text)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
