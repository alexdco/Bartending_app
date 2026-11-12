-- CJK contains search tier (spec 0050, build step 2, AC-3 to AC-6).
--
-- Japanese is written without spaces and the simple config only splits names
-- at the middle dot, so a short query (one kanji), a hiragana or half width
-- spelling, or a name typed without the dot finds nothing through name_search
-- or trigrams. This adds a contains tier that folds both sides with
-- search_fold (NFKC, lower case, hiragana to katakana, whitespace and the
-- middle dot removed) and matches with strpos.
--
-- The tier is gated by script, never by locale: it runs only when the query
-- holds a Han, Hiragana, Katakana, or Hangul character (has_cjk) and folds to
-- a non empty string. For any other query the gate is false, the added match
-- conditions are false, and the added rank is 0, so every existing locale
-- returns identical rows in identical order (AC-6). Korean and Chinese reuse
-- it with only a supported_locales row (AC-5).
--
-- Bodies are copied from the live definitions (pg_get_functiondef,
-- 2026-11-11; search_recipes from 20261111130000_recipe_read_base_name.sql).
-- Signatures and output columns are unchanged, so create or replace is
-- enough. Each function keeps security invoker and search_path ''. Grants are
-- restated as revoke from public plus anon, authenticated, service_role. Live
-- search_ingredients also carried a public execute grant; the revoke drops it,
-- which changes nothing for API callers (all three roles keep an explicit
-- grant) and matches every other read function.
--
-- No index: folding happens at query time over about 430 rows per locale.
-- Both helpers are immutable, so a stored folded column with a trigram index
-- stays possible later (spec 0050 follow-up).
--
-- Rollback: supabase/rollbacks/20261111150000_cjk_search_down.sql.
--
-- Checks after apply (spec 0050 verify.md, step 2):
--   select public.search_fold('ｼﾞﾝ'), public.search_fold('じん'),
--          public.search_fold('ジン・トニック');           -- ジン, ジン, ジントニック
--   select public.has_cjk('Margarita'), public.has_cjk('ＧＩＮ'),
--          public.has_cjk('梅'), public.has_cjk('진');        -- f, f, t, t

begin;

-- 1. search_fold: the fold applied to both sides of every CJK comparison.
create function public.search_fold(t text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select regexp_replace(
    translate(
      lower(normalize(t, NFKC)),
      -- hiragana U+3041 to U+3096, then ゝゞ
      'ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔゕゖゝゞ',
      -- katakana U+30A1 to U+30F6, then ヽヾ
      'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴヵヶヽヾ'
    ),
    '[\s\u30FB]', '', 'g'
  );
$$;

revoke execute on function public.search_fold(text) from public;
grant execute on function public.search_fold(text)
  to anon, authenticated, service_role;

-- 2. has_cjk: Hiragana and Katakana, CJK Extension A, CJK Unified, CJK
-- Compatibility, half width katakana, Hangul Jamo, Compatibility Jamo, and
-- Syllables. Full width Latin is not CJK.
create function public.has_cjk(t text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select t ~ '[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF66-\uFF9F\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]';
$$;

revoke execute on function public.has_cjk(text) from public;
grant execute on function public.has_cjk(text)
  to anon, authenticated, service_role;

-- 3. search_recipes: name_cjk_matches tier (bucket 1, prefix 1.0, contains
-- 0.5), and the CJK match inside the ingredient tier.
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

-- 4. search_ingredients: the CJK match inside the existing match group (so
-- the staples filter still applies), and a prefix 1.0 / contains 0.5 rank.
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

notify pgrst, 'reload schema';

commit;
