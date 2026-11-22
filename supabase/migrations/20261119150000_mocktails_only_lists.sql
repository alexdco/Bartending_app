-- Spec 0063 (mocktails only mode), build task 2, migration 2: the other ten
-- catalog functions gain a mocktails only flag that reads the two shared
-- views from migration 1 (20261119140000_mocktails_only_search_detail.sql).
-- Spec: docs/specs/0063-mocktails-only-mode/index.md
--
-- Every body is copied unchanged from the live function (checked with
-- pg_get_functiondef on 2026-11-19; the sources are
-- 20261111130000 for match_recipes_to_pantry, recommend_recipes,
-- classic_recipes, popular_recipes_by_region, fetch_favorite_recipes, and
-- fetch_recipes_by_ids; 20260913150000 for list_popular_regions;
-- 20261111150000 for search_ingredients; 20261031140000 for
-- fetch_pantry_items and fetch_shopping_list_items), adding only the new
-- trailing parameter and its filter. A new argument list needs a drop and
-- create (create or replace would add an overload). pg_depend lists no
-- dependents of any of the ten (checked 2026-11-19). Every flag defaults to
-- false, so callers that omit it get exactly today's results (AC-17).
-- Grants match the live ones: execute for anon, authenticated, service_role.
--
-- Applied by hand in the dashboard SQL editor. Rollback:
-- supabase/rollbacks/20261119150000_mocktails_only_lists_down.sql.
-- Checks: supabase/tests/mocktails_only_lists_check.sql.

begin;

-- 1. match_recipes_to_pantry (AC-5, AC-7). In the mode the pantry is first
-- limited to visible ingredients, so the missing counts and ratio come from
-- that limited set; then only mocktail safe recipes are kept.
drop function public.match_recipes_to_pantry(real, integer, integer, text);

create function public.match_recipes_to_pantry(
  max_ratio real default 0.25,
  page_limit integer default 20,
  page_offset integer default 0,
  locale text default 'en'::text,
  mocktails_only boolean default false
)
returns table (id uuid, name text, image_url text, alcoholic_status text, missing_ratio real, missing_ingredients jsonb, base_name text)
language plpgsql
stable
set search_path = ''
as $function$
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
      -- Spec 0063 AC-7: in the mode, pantry rows outside the visible
      -- ingredients are ignored by matching.
      and (not match_recipes_to_pantry.mocktails_only
           or pi.ingredient_id in (select v.id from public.mocktail_visible_ingredients v))
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
      -- Spec 0063 AC-5: filtered before limit and offset.
      and (not match_recipes_to_pantry.mocktails_only
           or r.id in (select ms.id from public.mocktail_safe_recipes ms))
  )
  select s.id, s.name, s.image_url, s.alcoholic_status, s.missing_ratio, s.missing_ingredients, s.base_name
  from scored s
  order by s.missing_ratio asc, s.name asc, s.id asc
  limit least(greatest(page_limit, 1), 50)
  offset greatest(page_offset, 0);
end;
$function$;

revoke execute on function public.match_recipes_to_pantry(real, integer, integer, text, boolean) from public;
grant execute on function public.match_recipes_to_pantry(real, integer, integer, text, boolean)
  to anon, authenticated, service_role;

-- 2. recommend_recipes (AC-5): recommendations and more like this. The
-- weights are unchanged; only the candidates (scored and fallback) are
-- filtered, even when current or recent ids point at an unsafe recipe.
drop function public.recommend_recipes(uuid[], uuid, integer, integer, text);

create function public.recommend_recipes(
  recent_recipe_ids uuid[] default '{}'::uuid[],
  current_recipe_id uuid default null::uuid,
  page_limit integer default 20,
  page_offset integer default 0,
  locale text default 'en'::text,
  mocktails_only boolean default false
)
returns table (id uuid, name text, image_url text, alcoholic_status text, score real, base_name text)
language plpgsql
stable
set search_path = ''
as $function$
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
      -- Spec 0063 AC-5: filtered before limit and offset.
      and (not recommend_recipes.mocktails_only
           or r.id in (select ms.id from public.mocktail_safe_recipes ms))
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
      and (not recommend_recipes.mocktails_only
           or r.id in (select ms.id from public.mocktail_safe_recipes ms))
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
$function$;

revoke execute on function public.recommend_recipes(uuid[], uuid, integer, integer, text, boolean) from public;
grant execute on function public.recommend_recipes(uuid[], uuid, integer, integer, text, boolean)
  to anon, authenticated, service_role;

-- 3. classic_recipes (AC-5): the homepage classics row.
drop function public.classic_recipes(integer, text);

create function public.classic_recipes(
  page_limit integer default 10,
  locale text default 'en'::text,
  mocktails_only boolean default false
)
returns table (id uuid, name text, image_url text, alcoholic_status text, base_name text)
language sql
stable
set search_path = ''
as $function$
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
    -- Spec 0063 AC-5: filtered before the limit.
    and (not classic_recipes.mocktails_only
         or r.id in (select ms.id from public.mocktail_safe_recipes ms))
  order by r.fame_score desc, coalesce(rt.name, r.name) asc, r.id asc
  limit least(greatest(page_limit, 1), 50);
$function$;

revoke execute on function public.classic_recipes(integer, text, boolean) from public;
grant execute on function public.classic_recipes(integer, text, boolean)
  to anon, authenticated, service_role;

-- 4. popular_recipes_by_region (AC-5): up to ten safe recipes per region.
drop function public.popular_recipes_by_region(text, text);

create function public.popular_recipes_by_region(
  region_filter text,
  locale text default 'en'::text,
  mocktails_only boolean default false
)
returns table (id uuid, name text, image_url text, alcoholic_status text, popularity_rank integer, base_name text)
language sql
stable
set search_path = ''
as $function$
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
    -- Spec 0063 AC-5: filtered before the limit.
    and (not popular_recipes_by_region.mocktails_only
         or r.id in (select ms.id from public.mocktail_safe_recipes ms))
  order by r.popularity_rank asc
  limit 10;
$function$;

revoke execute on function public.popular_recipes_by_region(text, text, boolean) from public;
grant execute on function public.popular_recipes_by_region(text, text, boolean)
  to anon, authenticated, service_role;

-- 5. list_popular_regions (AC-5): in the mode, only regions with at least
-- one mocktail safe popular recipe. Same order as today.
drop function public.list_popular_regions();

create function public.list_popular_regions(
  mocktails_only boolean default false
)
returns table (region_name text)
language sql
stable
set search_path = ''
as $function$
  select distinct r.region as region_name
  from public.recipes r
  where r.deleted_at is null
    and r.region is not null
    and r.popularity_rank is not null
    and (not list_popular_regions.mocktails_only
         or r.id in (select ms.id from public.mocktail_safe_recipes ms))
  order by r.region asc;
$function$;

revoke execute on function public.list_popular_regions(boolean) from public;
grant execute on function public.list_popular_regions(boolean)
  to anon, authenticated, service_role;

-- 6. fetch_favorite_recipes (AC-5): stored favorites stay; unsafe ones are
-- just not returned.
drop function public.fetch_favorite_recipes(text, integer, integer);

create function public.fetch_favorite_recipes(
  p_locale text default 'en'::text,
  p_page_limit integer default 20,
  p_page_offset integer default 0,
  p_mocktails_only boolean default false
)
returns table (id uuid, name text, image_url text, alcoholic_status text, base_name text)
language sql
stable
set search_path = ''
as $function$
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
    -- Spec 0063 AC-5: filtered before limit and offset.
    and (not p_mocktails_only
         or r.id in (select ms.id from public.mocktail_safe_recipes ms))
  order by f.created_at desc
  limit least(greatest(p_page_limit, 1), 50)
  offset greatest(p_page_offset, 0);
$function$;

revoke execute on function public.fetch_favorite_recipes(text, integer, integer, boolean) from public;
grant execute on function public.fetch_favorite_recipes(text, integer, integer, boolean)
  to anon, authenticated, service_role;

-- 7. fetch_recipes_by_ids (AC-5): recently viewed.
drop function public.fetch_recipes_by_ids(uuid[], text);

create function public.fetch_recipes_by_ids(
  p_ids uuid[],
  p_locale text default 'en'::text,
  p_mocktails_only boolean default false
)
returns table (id uuid, name text, image_url text, alcoholic_status text, base_name text)
language sql
stable
set search_path = ''
as $function$
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
  -- Spec 0063 AC-5.
  where not p_mocktails_only
     or r.id in (select ms.id from public.mocktail_safe_recipes ms)
  order by t.ord;
$function$;

revoke execute on function public.fetch_recipes_by_ids(uuid[], text, boolean) from public;
grant execute on function public.fetch_recipes_by_ids(uuid[], text, boolean)
  to anon, authenticated, service_role;

-- 8. search_ingredients (AC-7): only mocktail visible ingredients.
drop function public.search_ingredients(text, integer, text, boolean);

create function public.search_ingredients(
  query text default ''::text,
  result_limit integer default 20,
  locale text default 'en'::text,
  include_staples boolean default false,
  mocktails_only boolean default false
)
returns table (id uuid, name text)
language sql
stable
set search_path = ''
as $function$
  with resolved_locale as (
    select public.resolve_locale(locale) as locale
  ),
  cjk_query as (
    select public.search_fold(query) as folded,
           public.has_cjk(query) and public.search_fold(query) <> '' as active
  ),
  name_matches as (
    select i.id,
           coalesce(it.name, i.name) as name,
           greatest(
             extensions.similarity(i.name, query),
             coalesce(extensions.similarity(it.name, query), 0),
             (case when (select active from cjk_query) and it.name is not null then
                case when starts_with(public.search_fold(it.name), (select folded from cjk_query)) then 1.0
                     when strpos(public.search_fold(it.name), (select folded from cjk_query)) > 0 then 0.5
                     else 0 end
              else 0 end)::real
           ) as rank
    from public.ingredients i
    left join public.ingredient_translations it
      on it.ingredient_id = i.id and it.locale = (select locale from resolved_locale)
    where query <> ''
      and (include_staples or not i.is_staple)
      and (
        i.name operator(extensions.%) query
        or it.name operator(extensions.%) query
        or ((select active from cjk_query)
            and it.name is not null
            and strpos(public.search_fold(it.name), (select folded from cjk_query)) > 0)
      )
  ),
  browse_all as (
    select i.id,
           coalesce(it.name, i.name) as name,
           0::real as rank
    from public.ingredients i
    left join public.ingredient_translations it
      on it.ingredient_id = i.id and it.locale = (select locale from resolved_locale)
    where query = ''
      and (include_staples or not i.is_staple)
  ),
  combined as (
    select * from name_matches
    union all
    select * from browse_all
  )
  select c.id, c.name
  from combined c
  -- Spec 0063 AC-7: filtered before the limit.
  where not search_ingredients.mocktails_only
     or c.id in (select v.id from public.mocktail_visible_ingredients v)
  order by c.rank desc, c.name asc, c.id asc
  limit least(greatest(result_limit, 1), 50);
$function$;

revoke execute on function public.search_ingredients(text, integer, text, boolean, boolean) from public;
grant execute on function public.search_ingredients(text, integer, text, boolean, boolean)
  to anon, authenticated, service_role;

-- 9. fetch_pantry_items (AC-7): hidden rows stay stored, just not returned.
drop function public.fetch_pantry_items(text);

create function public.fetch_pantry_items(
  p_locale text default 'en'::text,
  p_mocktails_only boolean default false
)
returns table (ingredient_id uuid, name text)
language sql
stable
set search_path = ''
as $function$
  with resolved_locale as (
    select public.resolve_locale(p_locale) as locale
  )
  select
    pi.ingredient_id,
    coalesce(it.name, i.name) as name
  from public.pantry_items pi
  join public.ingredients i on i.id = pi.ingredient_id
  left join public.ingredient_translations it
    on it.ingredient_id = i.id
    and it.locale = (select locale from resolved_locale)
  where pi.user_id = auth.uid()
    -- Spec 0063 AC-7.
    and (not p_mocktails_only
         or pi.ingredient_id in (select v.id from public.mocktail_visible_ingredients v));
$function$;

revoke execute on function public.fetch_pantry_items(text, boolean) from public;
grant execute on function public.fetch_pantry_items(text, boolean)
  to anon, authenticated, service_role;

-- 10. fetch_shopping_list_items (AC-7): same rule as the pantry.
drop function public.fetch_shopping_list_items(text);

create function public.fetch_shopping_list_items(
  p_locale text default 'en'::text,
  p_mocktails_only boolean default false
)
returns table (ingredient_id uuid, name text)
language sql
stable
set search_path = ''
as $function$
  with resolved_locale as (
    select public.resolve_locale(p_locale) as locale
  )
  select
    sli.ingredient_id,
    coalesce(it.name, i.name) as name
  from public.shopping_list_items sli
  join public.ingredients i on i.id = sli.ingredient_id
  left join public.ingredient_translations it
    on it.ingredient_id = i.id
    and it.locale = (select locale from resolved_locale)
  where sli.user_id = (select auth.uid())
    -- Spec 0063 AC-7.
    and (not p_mocktails_only
         or sli.ingredient_id in (select v.id from public.mocktail_visible_ingredients v))
  order by sli.created_at, sli.ingredient_id;
$function$;

revoke execute on function public.fetch_shopping_list_items(text, boolean) from public;
grant execute on function public.fetch_shopping_list_items(text, boolean)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
