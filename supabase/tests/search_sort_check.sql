-- Hand run database checks for spec 0061 (search sort control), build task 1.
-- Paste into the Supabase SQL editor after applying
-- 20261118120000_search_sort_order.sql.
--
-- Runs inside begin ... rollback. The DO block always ends by raising an
-- exception, so every seeded recipe, translation, and ingredient is rolled
-- back. The exception message IS the report: a PASS/FAIL line per check.
-- pg_temp.search_recipes_old is the five argument function exactly as
-- 20261114180000_merge_aliases.sql left it, so Popular can be compared with
-- the pre 0061 order (AC-3).
-- Spec: docs/specs/0061-search-sort-control/index.md

begin;

create function pg_temp.search_recipes_old(
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
  )
  select c.id, c.name, c.image_url, c.alcoholic_status, c.base_name
  from combined c
  order by c.match_bucket asc, c.rank desc, c.fame_score desc nulls last, c.name asc, c.id asc
  limit least(greatest(page_limit, 1), 50)
  offset greatest(page_offset, 0);
$function$;

-- Every id the function returns for these inputs, page by page (page size 50),
-- in order. use_old reads the pre 0061 function instead.
create function pg_temp.all_ids(
  q text, status text, loc text, sort text, use_old boolean default false
)
returns uuid[]
language plpgsql
as $all$
declare
  v_ids uuid[] := '{}';
  v_page uuid[];
  v_offset int := 0;
begin
  loop
    if use_old then
      select coalesce(array_agg(o.id), '{}') into v_page
      from pg_temp.search_recipes_old(q, status, 50, v_offset, loc) o;
    else
      select coalesce(array_agg(s.id), '{}') into v_page
      from public.search_recipes(q, status, 50, v_offset, loc, sort) s;
    end if;
    exit when cardinality(v_page) = 0;
    v_ids := v_ids || v_page;
    v_offset := v_offset + 50;
  end loop;
  return v_ids;
end;
$all$;

-- The ids from keep that appear in ids, in the order they appear.
create function pg_temp.only_ids(ids uuid[], keep uuid[])
returns uuid[]
language sql
as $only$
  select coalesce(array_agg(t.x order by t.ord), '{}')
  from unnest(ids) with ordinality as t(x, ord)
  where t.x = any(keep);
$only$;

-- The same ids, sorted, so two results can be compared as sets.
create function pg_temp.as_set(ids uuid[])
returns uuid[]
language sql
as $set$
  select coalesce(array_agg(x order by x), '{}') from unnest(ids) x;
$set$;

do $check$
declare
  v_report text := '';
  v_ok boolean;
  v_n int;
  v_live int;
  v_ids uuid[];
  v_rickey uuid; v_splash uuid; v_aardvark uuid; v_cordial uuid;
  v_yo uuid; v_ye uuid; v_zh uuid;
  v_ambar uuid; v_bellini uuid;
  v_eagle uuid; v_eclair uuid; v_fizz uuid;
  v_kana uuid; v_latin uuid;
  v_seeded uuid[];
begin
  -- 1. Collations and signature
  select count(*) into v_n from pg_collation
  where collname in ('en-x-icu', 'es-x-icu', 'pt-x-icu', 'fr-x-icu', 'ru-x-icu',
                     'hi-x-icu', 'ja-x-icu', 'ko-x-icu', 'zh-Hans-x-icu');
  v_ok := v_n = 9;
  v_report := v_report || format(E'\n%s nine ICU collations exist AC-6',
    case when v_ok then 'PASS' else 'FAIL' end);

  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'search_recipes';
  v_ok := v_n = 1;
  v_report := v_report || format(E'\n%s exactly one public.search_recipes',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 2. Seed. Names carry "Qzv" so no live recipe matches the test query.
  insert into public.recipes (name, instructions, source_id, alcoholic_status)
  values ('Qzvlime Rickey', 'x', 'chk0061-1', 'alcoholic') returning id into v_rickey;
  insert into public.recipes (name, instructions, source_id, alcoholic_status)
  values ('Absinthe Qzvlime Splash', 'x', 'chk0061-2', 'alcoholic') returning id into v_splash;
  insert into public.recipes (name, instructions, source_id, alcoholic_status)
  values ('Aardvark Check', 'x', 'chk0061-3', 'alcoholic') returning id into v_aardvark;
  insert into public.ingredients (name) values ('Qzvlime') returning id into v_cordial;
  insert into public.recipe_ingredients (recipe_id, ingredient_id, sort_order)
  values (v_aardvark, v_cordial, 1);

  insert into public.recipes (name, instructions, source_id) values ('Check Ru Yo', 'x', 'chk0061-4') returning id into v_yo;
  insert into public.recipes (name, instructions, source_id) values ('Check Ru Ye', 'x', 'chk0061-5') returning id into v_ye;
  insert into public.recipes (name, instructions, source_id) values ('Check Ru Zh', 'x', 'chk0061-6') returning id into v_zh;
  insert into public.recipe_translations (recipe_id, locale, name, instructions, source_name_hash) values
    (v_yo, 'ru', 'Ёрш', 'x', 'chk'),
    (v_ye, 'ru', 'Ежевика', 'x', 'chk'),
    (v_zh, 'ru', 'Жасмин', 'x', 'chk');

  insert into public.recipes (name, instructions, source_id) values ('Check Es Ambar', 'x', 'chk0061-7') returning id into v_ambar;
  insert into public.recipes (name, instructions, source_id) values ('Check Es Bellini', 'x', 'chk0061-8') returning id into v_bellini;
  insert into public.recipe_translations (recipe_id, locale, name, instructions, source_name_hash) values
    (v_ambar, 'es', 'Ámbar', 'x', 'chk'),
    (v_bellini, 'es', 'Bellini', 'x', 'chk');

  insert into public.recipes (name, instructions, source_id) values ('Eagle Qzv', 'x', 'chk0061-9') returning id into v_eagle;
  insert into public.recipes (name, instructions, source_id) values ('Éclair Qzv', 'x', 'chk0061-10') returning id into v_eclair;
  insert into public.recipes (name, instructions, source_id) values ('Fizz Qzv', 'x', 'chk0061-11') returning id into v_fizz;

  insert into public.recipes (name, instructions, source_id) values ('Check Ja Kana', 'x', 'chk0061-12') returning id into v_kana;
  insert into public.recipes (name, instructions, source_id) values ('Zzz Qzv Latin', 'x', 'chk0061-13') returning id into v_latin;
  insert into public.recipe_translations (recipe_id, locale, name, instructions, source_name_hash) values
    (v_kana, 'ja', 'ジンチェック', 'x', 'chk');

  v_seeded := array[v_rickey, v_splash, v_aardvark, v_yo, v_ye, v_zh, v_ambar, v_bellini,
                    v_eagle, v_eclair, v_fizz, v_kana, v_latin];

  -- 3. Popular is the pre 0061 order (AC-3, AC-14)
  v_ok := pg_temp.all_ids('', null, 'en', 'popular') = pg_temp.all_ids('', null, 'en', null, true)
      and pg_temp.all_ids('lime', null, 'en', 'popular') = pg_temp.all_ids('lime', null, 'en', null, true)
      and pg_temp.all_ids('gin', 'alcoholic', 'ru', 'popular') = pg_temp.all_ids('gin', 'alcoholic', 'ru', null, true)
      and pg_temp.all_ids('qzvlime', null, 'ja', 'popular') = pg_temp.all_ids('qzvlime', null, 'ja', null, true);
  v_report := v_report || format(E'\n%s Popular matches the old function AC-3',
    case when v_ok then 'PASS' else 'FAIL' end);

  select coalesce(array_agg(s.id), '{}') into v_ids
  from public.search_recipes(query => 'lime', status_filter => null, page_limit => 20, page_offset => 0, locale => 'en') s;
  v_ok := v_ids = (select coalesce(array_agg(o.id), '{}')
                   from pg_temp.search_recipes_old('lime', null, 20, 0, 'en') o);
  v_report := v_report || format(E'\n%s five named args (no sort_order) still give Popular AC-14',
    case when v_ok then 'PASS' else 'FAIL' end);

  v_ok := pg_temp.all_ids('', null, 'en', 'zzz') = pg_temp.all_ids('', null, 'en', null, true)
      and pg_temp.all_ids('', null, 'en', 'AZ') = pg_temp.all_ids('', null, 'en', null, true);
  v_report := v_report || format(E'\n%s unknown sort values read as Popular AC-14',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 4. A to Z browse (AC-4)
  v_ok := pg_temp.as_set(pg_temp.all_ids('', null, 'en', 'az'))
        = pg_temp.as_set(pg_temp.all_ids('', null, 'en', 'popular'));
  v_report := v_report || format(E'\n%s A to Z browse returns the Popular set AC-4',
    case when v_ok then 'PASS' else 'FAIL' end);

  select coalesce(bool_and(r.alcoholic_status = 'non_alcoholic'), false) into v_ok
  from unnest(pg_temp.all_ids('', 'non_alcoholic', 'en', 'az')) x
  join public.recipes r on r.id = x;
  v_report := v_report || format(E'\n%s A to Z keeps the status filter AC-4',
    case when v_ok then 'PASS' else 'FAIL' end);

  v_ok := pg_temp.only_ids(pg_temp.all_ids('', null, 'en', 'az'), array[v_eagle, v_eclair, v_fizz])
        = array[v_eagle, v_eclair, v_fizz];
  v_report := v_report || format(E'\n%s en: Eagle, Éclair, Fizz (accent sorts among E) AC-6',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 5. Match groups stay first in A to Z (AC-5)
  v_ok := pg_temp.only_ids(pg_temp.all_ids('qzvlime', null, 'en', 'az'), v_seeded)
        = array[v_splash, v_rickey, v_aardvark];
  v_report := v_report || format(E'\n%s qzvlime A to Z: Absinthe Qzvlime Splash, Qzvlime Rickey, then ingredient only Aardvark AC-5',
    case when v_ok then 'PASS' else 'FAIL' end);

  v_ok := pg_temp.as_set(pg_temp.all_ids('lime', null, 'en', 'az'))
        = pg_temp.as_set(pg_temp.all_ids('lime', null, 'en', 'popular'));
  v_report := v_report || format(E'\n%s lime: A to Z returns the Popular set AC-5',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 6. Locale alphabets (AC-6)
  v_ok := pg_temp.only_ids(pg_temp.all_ids('', null, 'ru', 'az'), array[v_yo, v_ye, v_zh])
        = array[v_ye, v_yo, v_zh];
  v_report := v_report || format(E'\n%s ru: Ежевика, Ёрш, Жасмин AC-6',
    case when v_ok then 'PASS' else 'FAIL' end);

  v_ok := pg_temp.only_ids(pg_temp.all_ids('', null, 'es', 'az'), array[v_ambar, v_bellini])
        = array[v_ambar, v_bellini];
  v_report := v_report || format(E'\n%s es: Ámbar before Bellini AC-6',
    case when v_ok then 'PASS' else 'FAIL' end);

  v_ok := pg_temp.only_ids(pg_temp.all_ids('', null, 'ja', 'az'), array[v_kana, v_latin])
        = array[v_latin, v_kana];
  v_report := v_report || format(E'\n%s ja: untranslated Latin name before kana AC-6',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 7. Paging: every live recipe exactly once, in each order (AC-7)
  select count(*) into v_live from public.recipes where deleted_at is null;
  v_ok := true;
  v_ids := pg_temp.all_ids('', null, 'en', 'az');
  v_ok := v_ok and cardinality(v_ids) = v_live and cardinality(pg_temp.as_set(v_ids)) = v_live
    and (select count(distinct x) from unnest(v_ids) x) = v_live;
  v_ids := pg_temp.all_ids('', null, 'zh', 'az');
  v_ok := v_ok and cardinality(v_ids) = v_live
    and (select count(distinct x) from unnest(v_ids) x) = v_live;
  v_ids := pg_temp.all_ids('', null, 'en', 'popular');
  v_ok := v_ok and cardinality(v_ids) = v_live
    and (select count(distinct x) from unnest(v_ids) x) = v_live;
  v_report := v_report || format(E'\n%s paging returns every live recipe exactly once AC-7',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 8. Grants: anon can call the six argument function (Risks)
  execute 'set local role anon';
  select count(*) into v_n from public.search_recipes('qzvlime', null, 20, 0, 'en', 'az');
  execute 'reset role';
  v_ok := v_n >= 3;
  v_report := v_report || format(E'\n%s anon calls search_recipes with sort_order',
    case when v_ok then 'PASS' else 'FAIL' end);

  raise exception E'search sort check report (rolled back):%', v_report;
end;
$check$;

rollback;
