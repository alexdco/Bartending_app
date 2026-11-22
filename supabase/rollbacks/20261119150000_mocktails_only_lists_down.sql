-- Rollback for 20261119150000_mocktails_only_lists.sql (spec 0063,
-- migration 2). Drops the ten flagged functions and recreates each one
-- exactly as it was before (bodies checked by md5 against the live
-- functions on 2026-11-19), with the same grants. The views from migration 1
-- stay; roll back 20261119140000 separately if needed.
-- Run in the dashboard SQL editor.

begin;

-- 1. match_recipes_to_pantry
drop function public.match_recipes_to_pantry(real, integer, integer, text, boolean);

create function public.match_recipes_to_pantry(
  max_ratio real default 0.25,
  page_limit integer default 20,
  page_offset integer default 0,
  locale text default 'en'::text
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
$function$;

revoke execute on function public.match_recipes_to_pantry(real, integer, integer, text) from public;
grant execute on function public.match_recipes_to_pantry(real, integer, integer, text)
  to anon, authenticated, service_role;

-- 2. recommend_recipes
drop function public.recommend_recipes(uuid[], uuid, integer, integer, text, boolean);

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
$function$;

revoke execute on function public.recommend_recipes(uuid[], uuid, integer, integer, text) from public;
grant execute on function public.recommend_recipes(uuid[], uuid, integer, integer, text)
  to anon, authenticated, service_role;

-- 3. classic_recipes
drop function public.classic_recipes(integer, text, boolean);

create function public.classic_recipes(
  page_limit integer default 10,
  locale text default 'en'::text
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
  order by r.fame_score desc, coalesce(rt.name, r.name) asc, r.id asc
  limit least(greatest(page_limit, 1), 50);
$function$;

revoke execute on function public.classic_recipes(integer, text) from public;
grant execute on function public.classic_recipes(integer, text)
  to anon, authenticated, service_role;

-- 4. popular_recipes_by_region
drop function public.popular_recipes_by_region(text, text, boolean);

create function public.popular_recipes_by_region(
  region_filter text,
  locale text default 'en'::text
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
  order by r.popularity_rank asc
  limit 10;
$function$;

revoke execute on function public.popular_recipes_by_region(text, text) from public;
grant execute on function public.popular_recipes_by_region(text, text)
  to anon, authenticated, service_role;

-- 5. list_popular_regions
drop function public.list_popular_regions(boolean);

create function public.list_popular_regions()
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
  order by r.region asc;
$function$;

revoke execute on function public.list_popular_regions() from public;
grant execute on function public.list_popular_regions()
  to anon, authenticated, service_role;

-- 6. fetch_favorite_recipes
drop function public.fetch_favorite_recipes(text, integer, integer, boolean);

create function public.fetch_favorite_recipes(
  p_locale text default 'en'::text,
  p_page_limit integer default 20,
  p_page_offset integer default 0
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
  order by f.created_at desc
  limit least(greatest(p_page_limit, 1), 50)
  offset greatest(p_page_offset, 0);
$function$;

revoke execute on function public.fetch_favorite_recipes(text, integer, integer) from public;
grant execute on function public.fetch_favorite_recipes(text, integer, integer)
  to anon, authenticated, service_role;

-- 7. fetch_recipes_by_ids
drop function public.fetch_recipes_by_ids(uuid[], text, boolean);

create function public.fetch_recipes_by_ids(
  p_ids uuid[],
  p_locale text default 'en'::text
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
  order by t.ord;
$function$;

revoke execute on function public.fetch_recipes_by_ids(uuid[], text) from public;
grant execute on function public.fetch_recipes_by_ids(uuid[], text)
  to anon, authenticated, service_role;

-- 8. search_ingredients
drop function public.search_ingredients(text, integer, text, boolean, boolean);

create function public.search_ingredients(
  query text default ''::text,
  result_limit integer default 20,
  locale text default 'en'::text,
  include_staples boolean default false
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
  order by c.rank desc, c.name asc, c.id asc
  limit least(greatest(result_limit, 1), 50);
$function$;

revoke execute on function public.search_ingredients(text, integer, text, boolean) from public;
grant execute on function public.search_ingredients(text, integer, text, boolean)
  to anon, authenticated, service_role;

-- 9. fetch_pantry_items
drop function public.fetch_pantry_items(text, boolean);

create function public.fetch_pantry_items(
  p_locale text default 'en'::text
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
  where pi.user_id = auth.uid();
$function$;

revoke execute on function public.fetch_pantry_items(text) from public;
grant execute on function public.fetch_pantry_items(text)
  to anon, authenticated, service_role;

-- 10. fetch_shopping_list_items
drop function public.fetch_shopping_list_items(text, boolean);

create function public.fetch_shopping_list_items(
  p_locale text default 'en'::text
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
  order by sli.created_at, sli.ingredient_id;
$function$;

revoke execute on function public.fetch_shopping_list_items(text) from public;
grant execute on function public.fetch_shopping_list_items(text)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
