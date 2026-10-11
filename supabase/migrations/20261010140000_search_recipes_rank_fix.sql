-- Fix AC-5 ranking (spec 0004): best name match first.
--
-- Two bugs in the previous `search_recipes`:
--
-- 1. Plain `ts_rank` (normalization 0) gives a single word query the same
--    score in every name that contains it, regardless of name length. So
--    "Margarita", "House Margarita" and "Whitecap Margarita" all scored
--    0.0608, the tie fell through to `name asc`, and "House Margarita"
--    outranked "Margarita". Normalization flag 1 divides the rank by
--    1 + log(lexeme count), so the tighter name wins.
--
-- 2. The trigram fallback tier shared match_bucket 0 with full text
--    matches but scored with `word_similarity` (0 to 1), while full text
--    rows scored with `ts_rank` (around 0.06). Any fuzzy match therefore
--    beat every whole word match: "gin" put "Pineapple Gingerale
--    Smoothie" (word_similarity 0.75) above "Gin Fizz". The trigram tier
--    exists only for names full text cannot tokenize ("A. J.", "AT&T"),
--    so it now gets its own bucket after full text and before
--    ingredient only matches.

drop function if exists public.search_recipes(text, text, int, int, text);

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
             ts_rank(r.name_search, websearch_to_tsquery('english', query), 1),
             coalesce(ts_rank(rt.name_search, websearch_to_tsquery('spanish', query), 1), 0)
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
  name_trgm_matches as (
    select r.id,
           coalesce(rt.name, r.name) as name,
           r.image_url, r.alcoholic_status,
           1 as match_bucket,
           extensions.word_similarity(query, r.name) as rank
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
    select * from name_trgm_matches
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
