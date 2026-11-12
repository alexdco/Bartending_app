-- Rollback for 20261111150000_cjk_search.sql (spec 0050, build step 2).
-- Kept outside supabase/migrations so the CLI never applies it. Run by hand in
-- the SQL editor only for a full revert. It restores search_recipes and
-- search_ingredients to their bodies before the CJK tier (pg_get_functiondef,
-- 2026-11-11), then drops search_fold and has_cjk. No TS depends on the tier.
-- Grants stay as the forward migration left them (anon, authenticated,
-- service_role; no public).

begin;

-- 1. search_recipes
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
$function$;

revoke execute on function public.search_recipes(text, text, integer, integer, text) from public;
grant execute on function public.search_recipes(text, text, integer, integer, text)
  to anon, authenticated, service_role;

-- 2. search_ingredients
create or replace function public.search_ingredients(
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
  name_matches as (
    select i.id,
           coalesce(it.name, i.name) as name,
           greatest(
             extensions.similarity(i.name, query),
             coalesce(extensions.similarity(it.name, query), 0)
           ) as rank
    from public.ingredients i
    left join public.ingredient_translations it
      on it.ingredient_id = i.id and it.locale = (select locale from resolved_locale)
    where query <> ''
      and (include_staples or not i.is_staple)
      and (i.name operator(extensions.%) query or it.name operator(extensions.%) query)
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

-- 3. The helpers, after nothing calls them.
drop function public.has_cjk(text);
drop function public.search_fold(text);

notify pgrst, 'reload schema';

commit;
