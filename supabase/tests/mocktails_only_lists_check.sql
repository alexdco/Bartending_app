-- Hand run database checks for spec 0063 (mocktails only mode), migration 2.
-- Paste into the Supabase SQL editor after applying
-- 20261119150000_mocktails_only_lists.sql.
--
-- Runs inside begin ... rollback. The DO block always ends by raising an
-- exception, so every seeded pantry and shopping list row is rolled back.
-- The exception message IS the report: a PASS/FAIL line per check.
-- The pg_temp.*_old functions are the ten functions exactly as they were
-- before the migration (bodies checked by md5 against the live functions on
-- 2026-11-19), so default calls can be compared with them (AC-17).
-- User scoped functions run as the users with the most pantry, favorite, and
-- shopping list rows, through the request.jwt.claims setting.
-- Spec: docs/specs/0063-mocktails-only-mode/index.md

begin;

create function pg_temp.match_recipes_to_pantry_old(
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

create function pg_temp.recommend_recipes_old(
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

create function pg_temp.classic_recipes_old(
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

create function pg_temp.popular_recipes_by_region_old(
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

create function pg_temp.list_popular_regions_old()
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

create function pg_temp.fetch_favorite_recipes_old(
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

create function pg_temp.fetch_recipes_by_ids_old(
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

create function pg_temp.search_ingredients_old(
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

create function pg_temp.fetch_pantry_items_old(
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

create function pg_temp.fetch_shopping_list_items_old(
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

do $check$
declare
  v_report text := '';
  v_ok boolean;
  v_match boolean;
  v_rec boolean;
  v_fav boolean;
  v_pantry_set boolean;
  v_pantry_order boolean;
  v_shop boolean;
  v_n integer;
  v_user uuid;
  v_users uuid[];
  v_locale text;
  v_offset integer;
  v_ratio real;
  v_query text;
  v_region text;
  v_staples boolean;
  v_ids uuid[];
  v_unsafe uuid;
  v_vodka uuid;
begin
  -- Users with the most pantry, favorite, and shopping list rows, so the
  -- user scoped functions are compared on real data. auth.uid() reads the
  -- sub claim set here.
  select array_agg(u) into v_users
  from (
    select u from (
      (select pi.user_id as u from public.pantry_items pi group by pi.user_id order by count(*) desc limit 3)
      union
      (select f.user_id from public.favorites f group by f.user_id order by count(*) desc limit 3)
      union
      (select s.user_id from public.shopping_list_items s group by s.user_id order by count(*) desc limit 2)
    ) x
  ) y;
  v_report := v_report || format(E'\nINFO comparing user scoped functions for %s users', coalesce(array_length(v_users, 1), 0));

  -- Recently viewed style ids: live, deleted, safe, and unsafe recipes mixed.
  select array_agg(r.id order by md5(r.id::text)) into v_ids
  from (select id from public.recipes order by md5(id::text) limit 40) r;

  -- 1. Default unchanged (AC-17): every function called without the flag
  -- returns the same rows as the function before it, reported one line per
  -- function. Ordered functions must match in the same order.
  -- fetch_pantry_items has no ORDER BY (before or after), so its row order is
  -- whatever the plan gives and is not a contract; it must match as a set,
  -- and its order is reported as INFO only.

  v_match := true; v_rec := true; v_fav := true;
  v_pantry_set := true; v_pantry_order := true; v_shop := true;
  foreach v_user in array coalesce(v_users, '{}') loop
    perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    foreach v_locale in array array['en', 'es', 'ja'] loop
      foreach v_offset in array array[0, 20] loop
        foreach v_ratio in array array[0.25, 0.5]::real[] loop
          v_match := v_match and (
            select coalesce(array_agg(row(o.*)::text), '{}') from pg_temp.match_recipes_to_pantry_old(v_ratio, 20, v_offset, v_locale) o
          ) = (
            select coalesce(array_agg(row(n.*)::text), '{}') from public.match_recipes_to_pantry(v_ratio, 20, v_offset, v_locale) n
          );
        end loop;
        v_rec := v_rec and (
          select coalesce(array_agg(row(o.*)::text), '{}') from pg_temp.recommend_recipes_old(v_ids[1:5], v_ids[6], 20, v_offset, v_locale) o
        ) = (
          select coalesce(array_agg(row(n.*)::text), '{}') from public.recommend_recipes(v_ids[1:5], v_ids[6], 20, v_offset, v_locale) n
        );
        v_rec := v_rec and (
          select coalesce(array_agg(row(o.*)::text), '{}') from pg_temp.recommend_recipes_old('{}', null, 20, v_offset, v_locale) o
        ) = (
          select coalesce(array_agg(row(n.*)::text), '{}') from public.recommend_recipes('{}', null, 20, v_offset, v_locale) n
        );
        v_fav := v_fav and (
          select coalesce(array_agg(row(o.*)::text), '{}') from pg_temp.fetch_favorite_recipes_old(v_locale, 20, v_offset) o
        ) = (
          select coalesce(array_agg(row(n.*)::text), '{}') from public.fetch_favorite_recipes(v_locale, 20, v_offset) n
        );
      end loop;
      v_pantry_set := v_pantry_set and (
        select coalesce(array_agg(row(o.*)::text order by row(o.*)::text), '{}') from pg_temp.fetch_pantry_items_old(v_locale) o
      ) = (
        select coalesce(array_agg(row(n.*)::text order by row(n.*)::text), '{}') from public.fetch_pantry_items(v_locale) n
      );
      v_pantry_order := v_pantry_order and (
        select coalesce(array_agg(row(o.*)::text), '{}') from pg_temp.fetch_pantry_items_old(v_locale) o
      ) = (
        select coalesce(array_agg(row(n.*)::text), '{}') from public.fetch_pantry_items(v_locale) n
      );
      v_shop := v_shop and (
        select coalesce(array_agg(row(o.*)::text), '{}') from pg_temp.fetch_shopping_list_items_old(v_locale) o
      ) = (
        select coalesce(array_agg(row(n.*)::text), '{}') from public.fetch_shopping_list_items(v_locale) n
      );
    end loop;
  end loop;
  v_report := v_report
    || format(E'\n%s match_recipes_to_pantry default matches the old function AC-17', case when v_match then 'PASS' else 'FAIL' end)
    || format(E'\n%s recommend_recipes default matches the old function AC-17', case when v_rec then 'PASS' else 'FAIL' end)
    || format(E'\n%s fetch_favorite_recipes default matches the old function AC-17', case when v_fav then 'PASS' else 'FAIL' end)
    || format(E'\n%s fetch_pantry_items default returns the same rows as the old function AC-17', case when v_pantry_set then 'PASS' else 'FAIL' end)
    || format(E'\nINFO fetch_pantry_items row order %s the old function (no ORDER BY, not a contract)', case when v_pantry_order then 'matches' else 'differs from' end)
    || format(E'\n%s fetch_shopping_list_items default matches the old function AC-17', case when v_shop then 'PASS' else 'FAIL' end);

  v_ok := true;
  foreach v_locale in array array['en', 'es', 'zh', 'ru'] loop
    v_ok := v_ok and (
      select coalesce(array_agg(row(o.*)::text), '{}') from pg_temp.classic_recipes_old(10, v_locale) o
    ) = (
      select coalesce(array_agg(row(n.*)::text), '{}') from public.classic_recipes(10, v_locale) n
    ) and (
      select coalesce(array_agg(row(o.*)::text), '{}') from pg_temp.classic_recipes_old(50, v_locale) o
    ) = (
      select coalesce(array_agg(row(n.*)::text), '{}') from public.classic_recipes(50, v_locale) n
    ) and (
      select coalesce(array_agg(row(o.*)::text), '{}') from pg_temp.fetch_recipes_by_ids_old(v_ids, v_locale) o
    ) = (
      select coalesce(array_agg(row(n.*)::text), '{}') from public.fetch_recipes_by_ids(v_ids, v_locale) n
    );
    for v_region in select o.region_name from pg_temp.list_popular_regions_old() o loop
      v_ok := v_ok and (
        select coalesce(array_agg(row(o.*)::text), '{}') from pg_temp.popular_recipes_by_region_old(v_region, v_locale) o
      ) = (
        select coalesce(array_agg(row(n.*)::text), '{}') from public.popular_recipes_by_region(v_region, v_locale) n
      );
    end loop;
    foreach v_query in array array['', 'lime', 'vod', 'syrup', 'xyzq', 'ライム', '柠檬'] loop
      foreach v_staples in array array[false, true] loop
        v_ok := v_ok and (
          select coalesce(array_agg(row(o.*)::text), '{}') from pg_temp.search_ingredients_old(v_query, 20, v_locale, v_staples) o
        ) = (
          select coalesce(array_agg(row(n.*)::text), '{}') from public.search_ingredients(v_query, 20, v_locale, v_staples) n
        );
      end loop;
    end loop;
  end loop;
  v_ok := v_ok and (
    select coalesce(array_agg(row(o.*)::text), '{}') from pg_temp.list_popular_regions_old() o
  ) = (
    select coalesce(array_agg(row(n.*)::text), '{}') from public.list_popular_regions() n
  );
  v_report := v_report || format(E'\n%s classics, popular, regions, recently viewed, ingredient search defaults match the old functions AC-17',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 2. Flagged recipe lists hold only mocktail safe recipes (AC-5).
  v_ok := true;
  foreach v_user in array coalesce(v_users, '{}') loop
    perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    select v_ok and count(*) = 0 into v_ok
    from (
      select m.id from public.match_recipes_to_pantry(0.5, 50, 0, 'en', true) m
      union all
      select r.id from public.recommend_recipes(v_ids[1:5], v_ids[6], 50, 0, 'en', true) r
      union all
      select r.id from public.recommend_recipes('{}', null, 50, 0, 'en', true) r
      union all
      select f.id from public.fetch_favorite_recipes('en', 50, 0, true) f
    ) p
    where p.id not in (select ms.id from public.mocktail_safe_recipes ms);
  end loop;
  select v_ok and count(*) = 0 into v_ok
  from (
    select c.id from public.classic_recipes(50, 'en', true) c
    union all
    select b.id from public.fetch_recipes_by_ids(v_ids, 'en', true) b
    union all
    select p.id
    from public.list_popular_regions() lr
    cross join lateral public.popular_recipes_by_region(lr.region_name, 'en', true) p
  ) p
  where p.id not in (select ms.id from public.mocktail_safe_recipes ms);
  v_report := v_report || format(E'\n%s flagged match, recommend, favorites, classics, recently viewed, popular hold only safe recipes AC-5',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 3. Limits apply after the filter (AC-5): a flagged classics row fills to
  -- the page size when enough safe classics exist, and recently viewed keeps
  -- every safe id in order.
  select count(*) into v_n
  from public.recipes r
  where r.deleted_at is null and r.fame_score is not null
    and r.id in (select ms.id from public.mocktail_safe_recipes ms);
  v_ok := (select count(*) from public.classic_recipes(10, 'en', true)) = least(10, v_n);
  v_ok := v_ok and (
    select coalesce(array_agg(b.id), '{}') from public.fetch_recipes_by_ids(v_ids, 'en', true) b
  ) = (
    select coalesce(array_agg(t.id order by t.ord), '{}')
    from unnest(v_ids) with ordinality t(id, ord)
    where t.id in (select ms.id from public.mocktail_safe_recipes ms)
  );
  v_report := v_report || format(E'\n%s flagged classics fill to 10 (%s safe classics) and recently viewed keeps every safe id AC-5',
    case when v_ok then 'PASS' else 'FAIL' end, v_n);

  -- 4. Regions (AC-5): the flagged list is exactly the regions that still
  -- have a safe popular recipe, in the same order.
  v_ok := (
    select coalesce(array_agg(f.region_name), '{}') from public.list_popular_regions(true) f
  ) = (
    select coalesce(array_agg(lr.region_name), '{}')
    from public.list_popular_regions() lr
    where exists (select 1 from public.popular_recipes_by_region(lr.region_name, 'en', true))
  );
  select count(*) into v_n from public.list_popular_regions(true);
  v_report := v_report || format(E'\n%s flagged regions (%s) are exactly those with a safe popular recipe AC-5',
    case when v_ok then 'PASS' else 'FAIL' end, v_n);

  -- 5. Ingredients (AC-7): flagged ingredient search returns only visible
  -- ingredients, and never a spirit or liqueur.
  select count(*) = 0 into v_ok
  from (
    select s.id from public.search_ingredients('', 50, 'en', false, true) s
    union all
    select s.id from public.search_ingredients('', 50, 'en', true, true) s
    union all
    select s.id from public.search_ingredients('vodka', 50, 'en', false, true) s
    union all
    select s.id from public.search_ingredients('rum', 50, 'es', false, true) s
    union all
    select s.id from public.search_ingredients('ウォッカ', 50, 'ja', false, true) s
  ) p
  left join public.ingredients i on i.id = p.id
  where p.id not in (select v.id from public.mocktail_visible_ingredients v)
     or i.category in ('spirit', 'liqueur');
  v_report := v_report || format(E'\n%s flagged ingredient search returns only visible ingredients AC-7',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 6. Pantry and shopping list (AC-7), seeded and rolled back: a vodka row
  -- shows without the flag, is hidden with it, stays stored, and does not
  -- count as owned when matching.
  select i.id into v_vodka
  from public.ingredients i
  where i.category = 'spirit' and i.name ilike 'vodka'
  limit 1;
  v_user := v_users[1];
  if v_vodka is null or v_user is null then
    v_report := v_report || E'\nFAIL no vodka ingredient or no user to seed with AC-7';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    insert into public.pantry_items (user_id, ingredient_id) values (v_user, v_vodka) on conflict do nothing;
    insert into public.shopping_list_items (user_id, ingredient_id) values (v_user, v_vodka) on conflict do nothing;
    v_ok := exists (select 1 from public.fetch_pantry_items('en') p where p.ingredient_id = v_vodka)
      and not exists (select 1 from public.fetch_pantry_items('en', true) p where p.ingredient_id = v_vodka)
      and exists (select 1 from public.fetch_shopping_list_items('en') s where s.ingredient_id = v_vodka)
      and not exists (select 1 from public.fetch_shopping_list_items('en', true) s where s.ingredient_id = v_vodka)
      and exists (select 1 from public.pantry_items pi where pi.user_id = v_user and pi.ingredient_id = v_vodka);
    select v_ok and count(*) = 0 into v_ok
    from (
      select p.ingredient_id from public.fetch_pantry_items('en', true) p
      union all
      select s.ingredient_id from public.fetch_shopping_list_items('en', true) s
    ) x
    where x.ingredient_id not in (select v.id from public.mocktail_visible_ingredients v);
    v_report := v_report || format(E'\n%s vodka is hidden from the flagged pantry and shopping list but stays stored AC-7',
      case when v_ok then 'PASS' else 'FAIL' end);
  end if;

  -- 7. Recommend candidates are filtered even when the current or recent ids
  -- point at an unsafe recipe (AC-5).
  select r.id into v_unsafe
  from public.recipes r
  where r.deleted_at is null and r.alcoholic_status = 'alcoholic'
  order by r.fame_score desc nulls last
  limit 1;
  select count(*) = 0 into v_ok
  from public.recommend_recipes(array[v_unsafe], v_unsafe, 50, 0, 'en', true) r
  where r.id not in (select ms.id from public.mocktail_safe_recipes ms);
  v_report := v_report || format(E'\n%s flagged more like this from an unsafe recipe returns only safe recipes AC-5',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 8. Grants: anon can call every public flagged function. A call that
  -- lacks execute raises 42501 and lands in the handler. Row counts are not
  -- checked: classics and popular are empty on live (no recipe has a
  -- fame_score or popularity_rank yet, seen 2026-11-20), so an empty list is
  -- correct there. The lime search must still find a visible ingredient.
  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  begin
    perform count(*) from public.list_popular_regions(true);
    perform count(*) from public.popular_recipes_by_region('x', 'en', true);
    perform count(*) from public.classic_recipes(10, 'en', true);
    perform count(*) from public.fetch_recipes_by_ids(v_ids, 'en', true);
    select count(*) into v_n from public.search_ingredients('lime', 20, 'en', false, true);
    v_ok := v_n > 0;
  exception when insufficient_privilege then
    v_ok := false;
  end;
  execute 'reset role';
  v_report := v_report || format(E'\n%s anon calls the flagged catalog functions',
    case when v_ok then 'PASS' else 'FAIL' end);

  raise exception E'mocktails only lists check report (rolled back):%', v_report;
end;
$check$;

rollback;
