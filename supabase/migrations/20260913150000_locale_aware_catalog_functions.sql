-- Multi language support (spec 0020), build plan step 4: thread a `locale`
-- parameter through the catalog read functions so results render translated
-- when available (AC-2, AC-13), fall back to English (AC-2), and a search in
-- a non English locale still surfaces an untranslated row matched on its
-- English name (AC-7, AC-14). Pantry matching itself stays keyed on
-- ingredient_id throughout (AC-6); only the returned display strings change.
--
-- popular_recipes_by_region and list_popular_regions had no migration file on
-- disk (applied live for spec 0010); this migration also backfills their
-- pre-locale definitions as the on-disk source of truth before extending them.

-- search_recipes -----------------------------------------------------------
--
-- Matches the translated name (locale's own text search config) OR the
-- English name (AC-14), so an untranslated recipe is never invisible in a
-- non English locale. Ingredient matching stays keyed on the English
-- ingredient name plus its translation for the caller's locale.

drop function if exists public.search_recipes(text, text, int, int);

create or replace function public.search_recipes(
  query text default '',
  status_filter text default null,
  page_limit int default 20,
  page_offset int default 0,
  locale text default 'en'
)
returns table (
  id uuid,
  name text,
  image_url text,
  alcoholic_status text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with resolved_locale as (
    select case when locale in ('es') then locale else null end as locale
  ),
  name_matches as (
    select r.id,
           coalesce(rt.name, r.name) as name,
           r.image_url, r.alcoholic_status,
           0 as match_bucket,
           greatest(
             ts_rank(r.name_search, websearch_to_tsquery('english', query)),
             coalesce(ts_rank(rt.name_search, websearch_to_tsquery('spanish', query)), 0)
           ) as rank
    from public.recipes r
    left join public.recipe_translations rt
      on rt.recipe_id = r.id and rt.locale = (select locale from resolved_locale)
    where r.deleted_at is null
      and query <> ''
      and (
        r.name_search @@ websearch_to_tsquery('english', query)
        or (rt.name_search is not null and rt.name_search @@ websearch_to_tsquery('spanish', query))
      )
      and (status_filter is null or r.alcoholic_status = status_filter)
  ),
  ingredient_matches as (
    select distinct r.id,
           coalesce(rt.name, r.name) as name,
           r.image_url, r.alcoholic_status,
           1 as match_bucket,
           0::real as rank
    from public.recipes r
    left join public.recipe_translations rt
      on rt.recipe_id = r.id and rt.locale = (select locale from resolved_locale)
    join public.recipe_ingredients ri on ri.recipe_id = r.id
    join public.ingredients i on i.id = ri.ingredient_id
    left join public.ingredient_translations it
      on it.ingredient_id = i.id and it.locale = (select locale from resolved_locale)
    where r.deleted_at is null
      and query <> ''
      and (i.name operator(extensions.%) query or it.name operator(extensions.%) query)
      and r.id not in (select nm.id from name_matches nm)
      and (status_filter is null or r.alcoholic_status = status_filter)
  ),
  browse_all as (
    select r.id,
           coalesce(rt.name, r.name) as name,
           r.image_url, r.alcoholic_status,
           0 as match_bucket,
           0::real as rank
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
    select * from ingredient_matches
    union all
    select * from browse_all
  )
  select c.id, c.name, c.image_url, c.alcoholic_status
  from combined c
  order by c.match_bucket asc, c.rank desc, c.name asc, c.id asc
  limit least(greatest(page_limit, 1), 50)
  offset greatest(page_offset, 0);
$$;

revoke all on function public.search_recipes(text, text, int, int, text) from public;
grant execute on function public.search_recipes(text, text, int, int, text) to anon, authenticated;

-- search_ingredients ---------------------------------------------------------
--
-- Matches the translated name OR the English name (AC-7, AC-14).

drop function if exists public.search_ingredients(text, int);

create or replace function public.search_ingredients(
  query text default '',
  result_limit int default 20,
  locale text default 'en'
)
returns table (
  id uuid,
  name text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with resolved_locale as (
    select case when locale in ('es') then locale else null end as locale
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
$$;

revoke all on function public.search_ingredients(text, int, text) from public;
grant execute on function public.search_ingredients(text, int, text) to anon, authenticated;

-- popular_recipes_by_region / list_popular_regions ---------------------------
--
-- Backfilled on-disk (previously applied live only, spec 0010) and extended
-- with a locale parameter for the translated display name.

drop function if exists public.popular_recipes_by_region(text);

create or replace function public.popular_recipes_by_region(
  region_filter text,
  locale text default 'en'
)
returns table (
  id uuid,
  name text,
  image_url text,
  alcoholic_status text,
  popularity_rank int
)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.id,
         coalesce(rt.name, r.name) as name,
         r.image_url, r.alcoholic_status, r.popularity_rank
  from public.recipes r
  left join public.recipe_translations rt
    on rt.recipe_id = r.id and rt.locale = (case when locale in ('es') then locale else null end)
  where r.deleted_at is null
    and r.region = region_filter
    and r.popularity_rank is not null
  order by r.popularity_rank asc
  limit 10;
$$;

revoke all on function public.popular_recipes_by_region(text, text) from public;
grant execute on function public.popular_recipes_by_region(text, text) to anon, authenticated;

create or replace function public.list_popular_regions()
returns table (region_name text)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct r.region as region_name
  from public.recipes r
  where r.deleted_at is null
    and r.region is not null
    and r.popularity_rank is not null
  order by r.region asc;
$$;

revoke all on function public.list_popular_regions() from public;
grant execute on function public.list_popular_regions() to anon, authenticated;

-- recommend_recipes -----------------------------------------------------------

drop function if exists public.recommend_recipes(uuid[], uuid, int, int);

create or replace function public.recommend_recipes(
  recent_recipe_ids uuid[] default '{}'::uuid[],
  current_recipe_id uuid default null,
  page_limit int default 20,
  page_offset int default 0,
  locale text default 'en'
)
returns table (
  id uuid,
  name text,
  image_url text,
  alcoholic_status text,
  score real
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  capped_recent_ids uuid[];
  resolved_locale text;
begin
  if auth.uid() is null then
    raise exception 'no active session' using errcode = '28000';
  end if;

  resolved_locale := case when locale in ('es') then locale else null end;

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
      (sum(coalesce(iw.weight, 0)) / rt2.total_count::real) as score
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
    group by r.id, rt.name, r.name, r.image_url, r.alcoholic_status, rt2.total_count
    having sum(coalesce(iw.weight, 0)) > 0
  ),
  scored_page as (
    select s.id, s.name, s.image_url, s.alcoholic_status, s.score
    from scored s
    order by s.score desc, s.name asc, s.id asc
    limit least(greatest(page_limit, 1), 50)
    offset greatest(page_offset, 0)
  ),
  fallback_page as (
    select r.id,
           coalesce(rt.name, r.name) as name,
           r.image_url, r.alcoholic_status, 0::real as score
    from public.recipes r
    left join public.recipe_translations rt
      on rt.recipe_id = r.id and rt.locale = resolved_locale
    where r.deleted_at is null
      and (current_recipe_id is null or r.id <> current_recipe_id)
      and not exists (
        select 1 from public.favorites f
        where f.user_id = auth.uid() and f.recipe_id = r.id
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

revoke all on function public.recommend_recipes(uuid[], uuid, int, int, text) from public;
grant execute on function public.recommend_recipes(uuid[], uuid, int, int, text) to anon, authenticated;

-- match_recipes_to_pantry ------------------------------------------------------
--
-- Matching stays keyed on ingredient_id throughout (AC-6); only the returned
-- recipe name and missing ingredient names are translated (AC-13).

drop function if exists public.match_recipes_to_pantry(real, int, int);

create or replace function public.match_recipes_to_pantry(
  max_ratio real default 0.25,
  page_limit int default 20,
  page_offset int default 0,
  locale text default 'en'
)
returns table (
  id uuid,
  name text,
  image_url text,
  alcoholic_status text,
  missing_ratio real,
  missing_ingredients jsonb
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  resolved_locale text;
begin
  if auth.uid() is null then
    raise exception 'no active session' using errcode = '28000';
  end if;

  resolved_locale := case when locale in ('es') then locale else null end;

  return query
  with recipe_totals as (
    select ri.recipe_id, count(*) as total_count
    from public.recipe_ingredients ri
    group by ri.recipe_id
  ),
  recipe_missing as (
    select
      ri.recipe_id,
      count(*) filter (where pi.ingredient_id is null) as missing_count,
      jsonb_agg(
        jsonb_build_object('id', i.id, 'name', coalesce(it.name, i.name))
        order by coalesce(it.name, i.name) asc
      ) filter (where pi.ingredient_id is null) as missing_ingredients
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
      coalesce(rm.missing_ingredients, '[]'::jsonb) as missing_ingredients
    from public.recipes r
    left join public.recipe_translations rt
      on rt.recipe_id = r.id and rt.locale = resolved_locale
    join recipe_totals rt2 on rt2.recipe_id = r.id
    join recipe_missing rm on rm.recipe_id = r.id
    where r.deleted_at is null
      and (
        (rm.missing_count::real / rt2.total_count::real) <= max_ratio
        or rm.missing_count = 1
      )
  )
  select s.id, s.name, s.image_url, s.alcoholic_status, s.missing_ratio, s.missing_ingredients
  from scored s
  order by s.missing_ratio asc, s.name asc, s.id asc
  limit least(greatest(page_limit, 1), 50)
  offset greatest(page_offset, 0);
end;
$$;

revoke all on function public.match_recipes_to_pantry(real, int, int, text) from public;
grant execute on function public.match_recipes_to_pantry(real, int, int, text) to anon, authenticated;
