-- Popularity columns and fame order (spec 0038, AC-1, AC-2, AC-4).
-- Spec: docs/specs/0038-empty-states-ux-accessibility/index.md
--
-- 1. Codify the recipes popularity columns. They exist live (spec 0010) but
--    no migration created them, so a fresh database or branch lacked them.
--    Every statement is guarded, so on BartendingAppWeb this part is a no op.
-- 2. Commit apply_region_proposals from its live definition
--    (pg_get_functiondef), amended: a fame score is required for every
--    proposal and may come with a null region; popularity_rank is still
--    computed only over rows with a region. Service role only.
-- 3. search_recipes: fame breaks ties before name, so the empty query browse
--    order is most famous first (unscored last). Signature and return table
--    unchanged, so create or replace, no drop.
-- 4. classic_recipes (new): the highest fame live recipes for the home
--    classics row.

-- 1. Columns, check, indexes --------------------------------------------------

alter table public.recipes add column if not exists region text;
alter table public.recipes add column if not exists fame_score smallint;
alter table public.recipes add column if not exists popularity_rank integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.recipes'::regclass and conname = 'recipes_fame_score_check'
  ) then
    alter table public.recipes
      add constraint recipes_fame_score_check check (fame_score >= 0 and fame_score <= 100);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.recipes'::regclass and conname = 'recipes_region_check'
  ) then
    alter table public.recipes
      add constraint recipes_region_check check (
        region is null or region = any (array[
          'Mexican', 'Cuban', 'Caribbean', 'American', 'British',
          'Italian', 'French', 'Asian', 'International/Global'
        ])
      );
  end if;
end;
$$;

create index if not exists recipes_region_idx
  on public.recipes (region) where region is not null;

create unique index if not exists recipes_region_popularity_rank_key
  on public.recipes (region, popularity_rank)
  where region is not null and popularity_rank is not null;

comment on column public.recipes.fame_score is
  'LLM judged fame, 0 to 100, set for every recipe by the reviewed apply step (spec 0038). Null means not tagged yet; region may be null.';
comment on column public.recipes.popularity_rank is
  'Rank by fame_score within region, top 10 only. Null whenever region is null (spec 0010).';

-- 2. apply_region_proposals ----------------------------------------------------

create or replace function public.apply_region_proposals(proposals jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_regions text[];
  bad_count int;
begin
  perform pg_advisory_xact_lock(hashtext('apply_region_proposals'));

  -- Spec 0038: every proposal carries a fame score from 0 to 100; region is
  -- optional. Reject the whole payload before any write.
  select count(*) into bad_count
  from jsonb_to_recordset(proposals) as p(id uuid, region text, fame_score int)
  where p.fame_score is null or p.fame_score < 0 or p.fame_score > 100;

  if bad_count > 0 then
    raise exception 'apply_region_proposals: % proposal(s) have a missing or out of range fame_score', bad_count
      using errcode = '22023';
  end if;

  -- Step 1: null out region/fame_score/popularity_rank for every recipe in
  -- this payload, so a corrected rerun cleanly replaces a prior apply and the
  -- partial unique index on (region, popularity_rank) never sees a transient
  -- collision from the rewrite below. Regions this payload moves recipes out
  -- of are collected first so their ranks are recomputed too.
  select array_agg(distinct r.region) into affected_regions
  from public.recipes r
  join jsonb_to_recordset(proposals) as p(id uuid, region text, fame_score int)
    on p.id = r.id
  where r.region is not null;

  update public.recipes r
  set region = null, fame_score = null, popularity_rank = null
  from jsonb_to_recordset(proposals) as p(id uuid, region text, fame_score int)
  where r.id = p.id;

  -- Step 2: write the new region/fame_score from the reviewed proposals. A
  -- null region with a fame score is valid (spec 0038).
  update public.recipes r
  set region = p.region, fame_score = p.fame_score
  from jsonb_to_recordset(proposals) as p(id uuid, region text, fame_score int)
  where r.id = p.id;

  -- Step 3: recompute popularity_rank deterministically from fame_score,
  -- top 10 per region, ties broken by name then id; only rows with a region
  -- get a rank, scoped to regions touched by this payload (old or new).
  select array_agg(distinct x.region) into affected_regions
  from (
    select unnest(coalesce(affected_regions, '{}'::text[])) as region
    union
    select p.region
    from jsonb_to_recordset(proposals) as p(id uuid, region text, fame_score int)
    where p.region is not null
  ) x;

  if affected_regions is not null then
    update public.recipes r
    set popularity_rank = null
    where r.region = any(affected_regions)
      and r.popularity_rank is not null;

    with ranked as (
      select r.id,
             row_number() over (
               partition by r.region
               order by r.fame_score desc, r.name asc, r.id asc
             ) as rn
      from public.recipes r
      where r.region = any(affected_regions)
        and r.fame_score is not null
        and r.deleted_at is null
    )
    update public.recipes r
    set popularity_rank = ranked.rn
    from ranked
    where r.id = ranked.id
      and ranked.rn <= 10;
  end if;
end;
$$;

revoke execute on function public.apply_region_proposals(jsonb) from public, anon, authenticated;
grant execute on function public.apply_region_proposals(jsonb) to service_role;

-- 3. search_recipes: fame tiebreak ----------------------------------------------

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
           ) as rank,
           r.fame_score
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
           extensions.word_similarity(query, r.name) as rank,
           r.fame_score
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
           r.fame_score
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
           r.fame_score
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
  order by c.match_bucket asc, c.rank desc, c.fame_score desc nulls last, c.name asc, c.id asc
  limit least(greatest(page_limit, 1), 50)
  offset greatest(page_offset, 0);
$$;

revoke all on function public.search_recipes(text, text, int, int, text) from public;
grant execute on function public.search_recipes(text, text, int, int, text) to anon, authenticated;

-- 4. classic_recipes ------------------------------------------------------------

create or replace function public.classic_recipes(
  page_limit int default 10,
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
  )
  select r.id,
         coalesce(rt.name, r.name) as name,
         r.image_url,
         r.alcoholic_status
  from public.recipes r
  left join public.recipe_translations rt
    on rt.recipe_id = r.id and rt.locale = (select locale from resolved_locale)
  where r.deleted_at is null
    and r.fame_score is not null
  order by r.fame_score desc, coalesce(rt.name, r.name) asc, r.id asc
  limit least(greatest(page_limit, 1), 50);
$$;

revoke all on function public.classic_recipes(int, text) from public;
grant execute on function public.classic_recipes(int, text) to anon, authenticated;
