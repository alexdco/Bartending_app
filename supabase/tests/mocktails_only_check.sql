-- Hand run database checks for spec 0063 (mocktails only mode), migration 1.
-- Paste into the Supabase SQL editor after applying
-- 20261119140000_mocktails_only_search_detail.sql.
--
-- Runs inside begin ... rollback. The DO block always ends by raising an
-- exception, so every seeded recipe and ingredient is rolled back. The
-- exception message IS the report: a PASS/FAIL line per check.
-- pg_temp.search_recipes_old and pg_temp.fetch_recipe_detail_old are the
-- functions exactly as they were before the migration (from
-- 20261118120000_search_sort_order.sql and 20261114130000_batch_ranges.sql),
-- so default calls can be compared with them (AC-17).
-- Spec: docs/specs/0063-mocktails-only-mode/index.md

begin;

create function pg_temp.search_recipes_old(
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
           search_recipes_old.sort_order = 'az' as az
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

create function pg_temp.fetch_recipe_detail_old(p_id uuid, p_locale text default 'en'::text)
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
    r.name as base_name
  from public.recipes r
  left join public.recipe_translations rt
    on rt.recipe_id = r.id and rt.locale = (select locale from resolved_locale)
  where r.id = p_id
    and r.deleted_at is null;
$$;

do $check$
declare
  v_report text := '';
  v_ok boolean;
  v_n integer;
  v_safe integer;
  v_vodka uuid;
  v_ice uuid;
  v_na_spirit uuid;
  v_unknown uuid;
  v_optional uuid;
  v_clean uuid;
  v_query text;
  v_locale text;
  v_sort text;
  v_status text;
  v_offset integer;
begin
  -- 1. Default unchanged: search_recipes without the flag returns the same
  -- rows in the same order as the function before the migration (AC-17).
  v_ok := true;
  foreach v_query in array array['', 'lime', 'margarita', 'vodka', 'sour', 'xyzq', '莫吉托'] loop
    foreach v_locale in array array['en', 'es', 'zh', 'ru'] loop
      foreach v_sort in array array['popular', 'az'] loop
        foreach v_status in array array['', 'alcoholic', 'non_alcoholic'] loop
          foreach v_offset in array array[0, 20] loop
            v_ok := v_ok and (
              select coalesce(array_agg(row(o.*)::text), '{}')
              from pg_temp.search_recipes_old(v_query, nullif(v_status, ''), 20, v_offset, v_locale, v_sort) o
            ) = (
              select coalesce(array_agg(row(n.*)::text), '{}')
              from public.search_recipes(v_query, nullif(v_status, ''), 20, v_offset, v_locale, v_sort) n
            );
          end loop;
        end loop;
      end loop;
    end loop;
  end loop;
  v_report := v_report || format(E'\n%s search_recipes default matches the old function AC-17',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 2. Default unchanged: fetch_recipe_detail returns the same columns as
  -- before for every recipe, in two locales, plus only mocktail_safe (AC-17).
  select count(*) = 0 into v_ok
  from public.recipes r
  cross join unnest(array['en', 'es']) as l(loc)
  where (
    select to_jsonb(o) from pg_temp.fetch_recipe_detail_old(r.id, l.loc) o
  ) is distinct from (
    select to_jsonb(n) - 'mocktail_safe' from public.fetch_recipe_detail(r.id, l.loc) n
  );
  v_report := v_report || format(E'\n%s fetch_recipe_detail matches the old function apart from mocktail_safe AC-17',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 3. mocktail_safe agrees with the view for every live recipe (AC-6).
  select count(*) = 0 into v_ok
  from public.recipes r
  where r.deleted_at is null
    and (select d.mocktail_safe from public.fetch_recipe_detail(r.id, 'en') d)
      is distinct from exists (select 1 from public.mocktail_safe_recipes ms where ms.id = r.id);
  v_report := v_report || format(E'\n%s fetch_recipe_detail.mocktail_safe matches the view AC-6',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 4. Fancy White Russian is alcoholic and not mocktail safe (AC-4).
  select r.alcoholic_status = 'alcoholic'
    and not exists (select 1 from public.mocktail_safe_recipes ms where ms.id = r.id)
  into v_ok
  from public.recipes r
  where r.id = '9cc015b9-0e31-46d8-8550-1b8bce459068';
  v_report := v_report || format(E'\n%s Fancy White Russian is alcoholic and hidden AC-4',
    case when coalesce(v_ok, false) then 'PASS' else 'FAIL' end);

  -- 5. Fail closed (AC-4): seeded recipes, rolled back below.
  insert into public.ingredients (name, category) values ('Chk0063 Vodka', 'spirit') returning id into v_vodka;
  insert into public.ingredients (name, is_staple) values ('Chk0063 Ice', true) returning id into v_ice;
  insert into public.recipes (name, instructions, source_id, alcoholic_status)
  values ('Chk0063 Mislabeled', 'x', 'chk0063-1', 'non_alcoholic') returning id into v_na_spirit;
  insert into public.recipes (name, instructions, source_id, alcoholic_status)
  values ('Chk0063 Unknown', 'x', 'chk0063-2', 'unknown') returning id into v_unknown;
  insert into public.recipes (name, instructions, source_id, alcoholic_status)
  values ('Chk0063 Optional', 'x', 'chk0063-3', 'optional') returning id into v_optional;
  insert into public.recipes (name, instructions, source_id, alcoholic_status)
  values ('Chk0063 Clean', 'x', 'chk0063-4', 'non_alcoholic') returning id into v_clean;
  insert into public.recipe_ingredients (recipe_id, ingredient_id, sort_order) values
    (v_na_spirit, v_vodka, 1),
    (v_clean, v_ice, 1);

  select count(*) = 0 into v_ok
  from public.mocktail_safe_recipes ms
  where ms.id in (v_na_spirit, v_unknown, v_optional);
  v_ok := v_ok and exists (select 1 from public.mocktail_safe_recipes ms where ms.id = v_clean);
  v_report := v_report || format(E'\n%s spirit, unknown, and optional recipes are never mocktail safe AC-4',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 6. Paging (AC-5): flagged pages hold only safe recipes, fill to the
  -- page size, and together list every safe recipe exactly once.
  select count(*) into v_safe from public.mocktail_safe_recipes;
  select count(*) into v_n
  from public.search_recipes('', null, 20, 0, 'en', 'popular', true) s;
  v_ok := v_n = least(20, v_safe);
  select count(*) = 0 into v_ok
  from (
    select s.id from public.search_recipes('', null, 50, 0, 'en', 'az', true) s
    union all
    select s.id from public.search_recipes('', null, 50, 50, 'en', 'az', true) s
  ) p
  where p.id not in (select ms.id from public.mocktail_safe_recipes ms);
  v_ok := v_ok and (
    select count(distinct p.id) = v_safe and count(*) = v_safe
    from (
      select s.id from public.search_recipes('', null, 50, 0, 'en', 'az', true) s
      union all
      select s.id from public.search_recipes('', null, 50, 50, 'en', 'az', true) s
    ) p
  ) and v_n = least(20, v_safe);
  v_report := v_report || format(E'\n%s flagged search pages hold %s safe recipes, page of 20 is full AC-5',
    case when v_ok then 'PASS' else 'FAIL' end, v_safe);

  -- 7. A query naming alcohol finds nothing unsafe in the mode (AC-5).
  select count(*) = 0 into v_ok
  from (
    select s.id from public.search_recipes('vodka', null, 50, 0, 'en', 'popular', true) s
    union all
    select s.id from public.search_recipes('margarita', 'alcoholic', 50, 0, 'es', 'az', true) s
  ) p
  where p.id not in (select ms.id from public.mocktail_safe_recipes ms);
  v_report := v_report || format(E'\n%s flagged search never returns an unsafe recipe AC-5',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 8. Staples (AC-7): no visible ingredient is a spirit or liqueur.
  select count(*) = 0 into v_ok
  from public.mocktail_visible_ingredients v
  join public.ingredients i on i.id = v.id
  where i.category in ('spirit', 'liqueur');
  v_ok := v_ok and exists (select 1 from public.mocktail_visible_ingredients v where v.id = v_ice)
    and not exists (select 1 from public.mocktail_visible_ingredients v where v.id = v_vodka);
  v_report := v_report || format(E'\n%s visible ingredients hold staples and no spirit or liqueur AC-7',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 9. Grants: anon reads both views and calls both functions.
  execute 'set local role anon';
  select count(*) into v_n from public.mocktail_safe_recipes;
  v_ok := v_n > 0;
  select count(*) into v_n from public.mocktail_visible_ingredients;
  v_ok := v_ok and v_n > 0;
  select count(*) into v_n from public.search_recipes('', null, 20, 0, 'en', 'popular', true);
  v_ok := v_ok and v_n > 0;
  select count(*) into v_n
  from public.fetch_recipe_detail('9cc015b9-0e31-46d8-8550-1b8bce459068', 'en') d
  where d.mocktail_safe = false;
  v_ok := v_ok and v_n = 1;
  execute 'reset role';
  v_report := v_report || format(E'\n%s anon reads the views and calls both functions',
    case when v_ok then 'PASS' else 'FAIL' end);

  raise exception E'mocktails only check report (rolled back):%', v_report;
end;
$check$;

rollback;
