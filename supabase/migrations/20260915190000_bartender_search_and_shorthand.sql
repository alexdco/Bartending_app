-- Bartender Mode: ranked search with shorthand and ingredient list matching.
--
-- See spec 0023-bartender-mode/0023-search-and-shorthand.md. Two mechanisms,
-- one merged ranked result:
--   1. recipe_aliases: a curated/generated alias table for name shorthand
--      ("old f" -> Old Fashioned), matched by trigram similarity.
--   2. search_recipes_by_ingredients: an F1 scored ingredient overlap RPC
--      for ingredient list queries ("gin campari vermouth" -> Negroni).
-- search_bartender merges both plus the existing search_recipes (tier 6)
-- with the bar/pin/recent tiers into one deterministically ordered result.

-- recipe_aliases --------------------------------------------------------------

create table public.recipe_aliases (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  alias text not null,
  source text not null,
  created_at timestamptz not null default now()
);

alter table public.recipe_aliases
  add constraint recipe_aliases_source_check
  check (source in ('generated', 'manual'));

comment on table public.recipe_aliases is
  'Bartender shorthand/nickname for a catalog recipe (e.g. "old f" for Old Fashioned), seeded by a Haiku classification pass and human correctable. Matched by trigram similarity in search_bartender.';

create index recipe_aliases_alias_trgm_idx
  on public.recipe_aliases using gin (alias extensions.gin_trgm_ops);

create index recipe_aliases_recipe_id_idx on public.recipe_aliases (recipe_id);

-- search_recipes_by_ingredients ------------------------------------------------
--
-- F1 scored ingredient overlap: precision = matched / recipe's ingredient
-- count, recall = matched / query token count. Excludes zero overlap
-- recipes entirely rather than scoring them 0 and showing them (spec's key
-- invariant). Matching uses the same pg_trgm similarity operator and
-- implicit threshold (session default 0.3) as the existing search_recipes /
-- search_ingredients functions, so "gin" doesn't spuriously match unrelated
-- near misses.

create function public.search_recipes_by_ingredients(ingredient_tokens text[])
returns table (
  id uuid,
  name text,
  score real
)
language sql
stable
security invoker
set search_path = ''
as $$
  with matched_ingredients as (
    select distinct ri.recipe_id, i.id as ingredient_id
    from unnest(ingredient_tokens) as token
    join public.ingredients i on i.name operator(extensions.%) token
    join public.recipe_ingredients ri on ri.ingredient_id = i.id
  ),
  recipe_totals as (
    select ri.recipe_id, count(*) as total_count
    from public.recipe_ingredients ri
    group by ri.recipe_id
  ),
  scored as (
    select
      mi.recipe_id,
      count(distinct mi.ingredient_id) as matched_count,
      rt.total_count
    from matched_ingredients mi
    join recipe_totals rt on rt.recipe_id = mi.recipe_id
    group by mi.recipe_id, rt.total_count
  )
  select
    r.id,
    r.name,
    (
      2.0 * (s.matched_count::real / s.total_count::real)
        * (s.matched_count::real / greatest(array_length(ingredient_tokens, 1), 1)::real)
    ) / nullif(
      (s.matched_count::real / s.total_count::real)
        + (s.matched_count::real / greatest(array_length(ingredient_tokens, 1), 1)::real),
      0
    ) as score
  from scored s
  join public.recipes r on r.id = s.recipe_id
  where r.deleted_at is null
    and s.matched_count > 0
  order by score desc, r.name asc, r.id asc;
$$;

revoke all on function public.search_recipes_by_ingredients(text[]) from public;
grant execute on function public.search_recipes_by_ingredients(text[]) to authenticated;

-- search_bartender --------------------------------------------------------------
--
-- Merges 7 tiers into one deterministically ordered result: (1) current
-- bar's menu, (2) current bar's other house recipes, (3) pinned, (4) recently
-- viewed, (5) exact catalog name match, (6) fuzzy/trigram catalog match
-- (reusing search_recipes), (7) alias/ingredient-overlap match. Each tier
-- capped at 10. auth.uid() is the only source of caller identity (no user_id
-- param), and bar_id is re-verified against bar_members inside the function
-- body regardless of what the caller passes.

create function public.search_bartender(
  query text,
  bar_id uuid default null,
  recent_recipe_ids uuid[] default '{}'::uuid[]
)
returns table (
  kind text,
  id uuid,
  name text,
  tier int,
  score real
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_bar_id uuid;
  v_tokens text[];
begin
  if trim(query) = '' then
    raise exception 'query must not be empty' using errcode = '22023';
  end if;

  -- The bar_id param only names which bar to check; it grants nothing by
  -- itself. A bar the caller doesn't belong to yields simply no tier 1/2
  -- rows, not an error, matching AC-4's "absent, not errored" requirement.
  if bar_id is not null and exists (
    select 1 from public.bar_members where bar_members.bar_id = search_bartender.bar_id
      and user_id = auth.uid()
  ) then
    v_bar_id := bar_id;
  else
    v_bar_id := null;
  end if;

  v_tokens := (select array_agg(token) from unnest(string_to_array(trim(query), ' ')) as token where token <> '');

  return query
  with
  tier1_menu as (
    select 'bar_recipe'::text as kind, br.id, br.name, 1 as tier,
           extensions.similarity(br.name, query) as score
    from public.bar_menu_items bmi
    join public.bar_recipes br on br.id = bmi.bar_recipe_id
    where v_bar_id is not null and bmi.bar_id = v_bar_id and br.deleted_at is null
    order by score desc, br.name asc, br.id asc
    limit 10
  ),
  tier2_house as (
    select 'bar_recipe'::text as kind, br.id, br.name, 2 as tier,
           extensions.similarity(br.name, query) as score
    from public.bar_recipes br
    where v_bar_id is not null and br.bar_id = v_bar_id and br.deleted_at is null
      and not exists (select 1 from public.bar_menu_items bmi where bmi.bar_recipe_id = br.id)
    order by score desc, br.name asc, br.id asc
    limit 10
  ),
  tier3_pinned as (
    select
      case when pv.recipe_id is not null then 'recipe' else 'bar_recipe' end as kind,
      coalesce(pv.recipe_id, pv.bar_recipe_id) as id,
      coalesce(r.name, br.name) as name,
      3 as tier,
      1.0::real as score
    from public.pinned_recipes_visible pv
    left join public.recipes r on r.id = pv.recipe_id and r.deleted_at is null
    left join public.bar_recipes br on br.id = pv.bar_recipe_id and br.deleted_at is null
    where pv.user_id = auth.uid() and coalesce(r.id, br.id) is not null
    order by pv.sort_order asc
    limit 10
  ),
  tier4_recent as (
    select 'recipe'::text as kind, r.id, r.name, 4 as tier, 1.0::real as score
    from unnest(coalesce(recent_recipe_ids, '{}'::uuid[])) with ordinality as t(id, ord)
    join public.recipes r on r.id = t.id and r.deleted_at is null
    order by t.ord asc
    limit 10
  ),
  tier5_exact as (
    select 'recipe'::text as kind, r.id, r.name, 5 as tier, 1.0::real as score
    from public.recipes r
    where r.deleted_at is null
      and lower(regexp_replace(r.name, '[[:punct:]]', '', 'g')) =
          lower(regexp_replace(trim(query), '[[:punct:]]', '', 'g'))
    order by r.name asc, r.id asc
    limit 10
  ),
  tier6_fuzzy as (
    select 'recipe'::text as kind, sr.id, sr.name, 6 as tier,
           extensions.similarity(sr.name, query) as score
    from public.search_recipes(query, null, 50, 0) sr
    where sr.id not in (select id from tier5_exact)
    order by score desc, sr.name asc, sr.id asc
    limit 10
  ),
  tier7_alias_ingredient as (
    select 'recipe'::text as kind, r.id, r.name, 7 as tier, ra_score.score
    from (
      select ra.recipe_id, max(extensions.similarity(ra.alias, query)) as score
      from public.recipe_aliases ra
      where ra.alias operator(extensions.%) query
      group by ra.recipe_id
      union all
      select sbi.id as recipe_id, sbi.score
      from public.search_recipes_by_ingredients(coalesce(v_tokens, '{}'::text[])) sbi
      where v_tokens is not null and array_length(v_tokens, 1) > 1
    ) ra_score
    join public.recipes r on r.id = ra_score.recipe_id and r.deleted_at is null
    where r.id not in (select id from tier5_exact)
      and r.id not in (select id from tier6_fuzzy)
    order by ra_score.score desc, r.name asc, r.id asc
    limit 10
  )
  select * from tier1_menu
  union all
  select * from tier2_house
  union all
  select * from tier3_pinned
  union all
  select * from tier4_recent
  union all
  select * from tier5_exact
  union all
  select * from tier6_fuzzy
  union all
  select * from tier7_alias_ingredient;
end;
$$;

revoke all on function public.search_bartender(text, uuid, uuid[]) from public;
revoke execute on function public.search_bartender(text, uuid, uuid[]) from anon;
grant execute on function public.search_bartender(text, uuid, uuid[]) to authenticated;
