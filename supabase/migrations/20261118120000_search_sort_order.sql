-- Spec 0061 (search sort control), build task 1: search_recipes gains an
-- optional sort_order ('popular' default, or 'az').
-- Spec: docs/specs/0061-search-sort-control/index.md
--
-- The body is copied from 20261114180000_merge_aliases.sql; only the new
-- parameter, the sort_key CTE, and the order by change. A new argument means a
-- new signature, so the five argument function is dropped and the six
-- argument one created in one transaction. Callers that pass five named
-- arguments (released mobile builds, admin list, home hero) resolve to this
-- function through the default and keep today's order (AC-14).
--
-- Applied by hand in the dashboard SQL editor. Rollback:
-- supabase/rollbacks/20261118120000_search_sort_order_down.sql.
-- Checks: supabase/tests/search_sort_check.sql.
--
-- Spot checks after applying:
--   select name from public.search_recipes('', null, 10, 0, 'en', 'az');
--   select name from public.search_recipes('lime', null, 10, 0, 'ru', 'az');

begin;

-- Nothing in the schema depends on search_recipes (pg_depend); its callers are
-- clients over PostgREST.
drop function public.search_recipes(text, text, integer, integer, text);

create function public.search_recipes(
  query text default ''::text,
  status_filter text default null::text,
  page_limit integer default 20,
  page_offset integer default 0,
  locale text default 'en'::text,
  sort_order text default 'popular'::text
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
  ),
  -- Spec 0061: which order to use, and which alphabet A to Z compares in.
  -- Any value other than exactly 'az' is Popular (AC-14, same rule as
  -- parseSearchSort). resolve_locale returns null for English.
  sort_key as (
    select (select rl.locale from resolved_locale rl) as loc,
           search_recipes.sort_order = 'az' as az
  )
  select c.id, c.name, c.image_url, c.alcoholic_status, c.base_name
  from combined c
  cross join sort_key s
  -- Popular: every A to Z term is null, so this is the pre 0061 order exactly
  -- (AC-3). A to Z: match bucket, then the displayed name under the locale's
  -- ICU collation (AC-4 to AC-6). COLLATE needs a literal, hence one term per
  -- locale; only one is ever non null. Keep in sync with SUPPORTED_LOCALES.
  order by
    c.match_bucket asc,
    case when s.az then null else c.rank end desc,
    case when s.az then null else c.fame_score end desc nulls last,
    (case when s.az and s.loc is null then c.name end) collate "en-x-icu",
    (case when s.az and s.loc = 'es' then c.name end) collate "es-x-icu",
    (case when s.az and s.loc = 'pt' then c.name end) collate "pt-x-icu",
    (case when s.az and s.loc = 'fr' then c.name end) collate "fr-x-icu",
    (case when s.az and s.loc = 'ru' then c.name end) collate "ru-x-icu",
    (case when s.az and s.loc = 'hi' then c.name end) collate "hi-x-icu",
    (case when s.az and s.loc = 'ja' then c.name end) collate "ja-x-icu",
    (case when s.az and s.loc = 'ko' then c.name end) collate "ko-x-icu",
    (case when s.az and s.loc = 'zh' then c.name end) collate "zh-Hans-x-icu",
    c.name asc,
    c.id asc
  limit least(greatest(page_limit, 1), 50)
  offset greatest(page_offset, 0);
$function$;

revoke execute on function public.search_recipes(text, text, integer, integer, text, text) from public;
grant execute on function public.search_recipes(text, text, integer, integer, text, text)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
