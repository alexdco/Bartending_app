-- Fix: short/initialism/punctuated recipe names (e.g. "A. J.", "AT&T",
-- "H.D.") are unsearchable by name. English `to_tsvector`/`to_tsquery`
-- silently discards single letter and punctuation-only tokens as noise
-- (independent of the stopword list), so "A. J." reduces to the tsvector
-- 'j':2 and never matches a query of "A.J.", "A. J.", or even "A" — and
-- "AT&T" reduces to an empty tsvector, making it unsearchable by name at
-- all. This is the same class of problem `ingredient_matches` already
-- solves for ingredient names via the pg_trgm `%` operator; extend
-- `search_recipes` with an equivalent trigram fallback tier for recipe
-- names, backed by a trigram index so it stays index-backed at scale.
--
-- Uses `word_similarity`/`<%` rather than whole-string `similarity`/`%`:
-- `similarity()` compares trigrams of the *whole* query against trigrams
-- of the *whole* target string, so it's biased against short, partial
-- queries paired with longer names (their shared-trigram ratio shrinks
-- as the target grows). E.g. searching "god" scores ~0.3 against
-- "Godchild" (passing the 0.3 similarity threshold) but only ~0.27
-- against "Godfather"/"Godmother" (same 3 shared trigrams, but a wider
-- union) — so shorter names surface while longer ones with the same
-- prefix silently don't. `word_similarity()` instead scores the query
-- against its best-matching substring of the target, which is what a
-- "search by name" prefix/partial match should do, and is still backed
-- by the same trigram index. Same bug applies to `ingredient_matches`
-- below, so it's fixed here too.

create index if not exists recipes_name_trgm_idx
  on public.recipes using gin (name extensions.gin_trgm_ops);

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
  name_trgm_matches as (
    select r.id,
           coalesce(rt.name, r.name) as name,
           r.image_url, r.alcoholic_status,
           0 as match_bucket,
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
