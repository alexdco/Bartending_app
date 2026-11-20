-- Spec 0063 (mocktails only mode), build task 1, migration 1: the two
-- shared views, the Fancy White Russian fix, search_recipes with
-- mocktails_only, and fetch_recipe_detail with a mocktail_safe column.
-- Spec: docs/specs/0063-mocktails-only-mode/index.md
--
-- Both function bodies are copied unchanged from their latest migrations
-- (search_recipes: 20261118120000_search_sort_order.sql; fetch_recipe_detail:
-- 20261114130000_batch_ranges.sql, both matching the live functions on
-- 2026-11-19), adding only the new parameter or column. A new argument list
-- or return type needs a drop and create (create or replace would add an
-- overload). pg_depend lists no dependents of either function (checked
-- 2026-11-19). The flag defaults to false, so callers that omit it get
-- exactly today's results (AC-17).
--
-- Before applying: anon can select recipes (deleted_at is null),
-- recipe_ingredients, and ingredients under RLS (checked 2026-11-19), so the
-- security_invoker views return rows for every visitor.
--
-- Applied by hand in the dashboard SQL editor. Rollback:
-- supabase/rollbacks/20261119140000_mocktails_only_search_detail_down.sql.
-- Checks: supabase/tests/mocktails_only_check.sql.

begin;

-- 1. The one definition of "mocktail safe" (AC-4): non alcoholic and no
-- spirit or liqueur ingredient. alcoholic, optional, and unknown never pass.
create view public.mocktail_safe_recipes
with (security_invoker = true)
as
  select r.id
  from public.recipes r
  where r.deleted_at is null
    and r.alcoholic_status = 'non_alcoholic'
    and not exists (
      select 1
      from public.recipe_ingredients ri
      join public.ingredients i on i.id = ri.ingredient_id
      where ri.recipe_id = r.id
        and i.category in ('spirit', 'liqueur')
    );

-- 2. "Mocktail visible" ingredients (AC-7): used in a mocktail safe recipe,
-- plus staples that are not a spirit or liqueur. Read by migration 2 and the
-- generate-drink-idea function.
create view public.mocktail_visible_ingredients
with (security_invoker = true)
as
  select ri.ingredient_id as id
  from public.recipe_ingredients ri
  join public.mocktail_safe_recipes ms on ms.id = ri.recipe_id
  union
  select i.id
  from public.ingredients i
  where i.is_staple
    and coalesce(i.category, '') not in ('spirit', 'liqueur');

-- Read only: mocktail_safe_recipes is a simple single table view, so it would
-- be auto updatable through the default grants (RLS would still block writes).
revoke all on public.mocktail_safe_recipes, public.mocktail_visible_ingredients
  from public, anon, authenticated;
grant select on public.mocktail_safe_recipes, public.mocktail_visible_ingredients
  to anon, authenticated, service_role;

-- 3. Data fix (AC-4): Fancy White Russian is made with vodka and coffee
-- liqueur, so it is alcoholic.
update public.recipes
set alcoholic_status = 'alcoholic'
where id = '9cc015b9-0e31-46d8-8550-1b8bce459068'
  and alcoholic_status = 'non_alcoholic';

-- 4. search_recipes gains mocktails_only (AC-5, AC-17).
drop function public.search_recipes(text, text, integer, integer, text, text);

create function public.search_recipes(
  query text default ''::text,
  status_filter text default null::text,
  page_limit integer default 20,
  page_offset integer default 0,
  locale text default 'en'::text,
  sort_order text default 'popular'::text,
  mocktails_only boolean default false
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
  -- Spec 0063 AC-5: filtered before limit and offset, so a page holds up to
  -- page_limit mocktail safe recipes. False (the default) keeps every row.
  where not search_recipes.mocktails_only
     or c.id in (select ms.id from public.mocktail_safe_recipes ms)
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

revoke execute on function public.search_recipes(text, text, integer, integer, text, text, boolean) from public;
grant execute on function public.search_recipes(text, text, integer, integer, text, text, boolean)
  to anon, authenticated, service_role;

-- 5. fetch_recipe_detail gains mocktail_safe (AC-6). A new output column
-- changes the return type, so it is dropped and created too.
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
  base_name text,
  mocktail_safe boolean
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
            'amount_max_value', ri.amount_max_value,
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
    r.name as base_name,
    -- Spec 0063 AC-6: the one definition of mocktail safe, from the view.
    r.id in (select ms.id from public.mocktail_safe_recipes ms) as mocktail_safe
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
