-- Fix: the function's RETURNS TABLE output column "id" collided with the
-- CTE column references (select id from tier5_exact) inside later CTEs,
-- since PL/pgSQL resolves a bare "id" to the OUT parameter first. Fully
-- qualifies every CTE's own columns with a t_ prefix so no reference is
-- ambiguous against the OUT parameters.

drop function if exists public.search_bartender(text, uuid, uuid[]);

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
    select 'bar_recipe'::text as t_kind, br.id as t_id, br.name as t_name, 1 as t_tier,
           extensions.similarity(br.name, query) as t_score
    from public.bar_menu_items bmi
    join public.bar_recipes br on br.id = bmi.bar_recipe_id
    where v_bar_id is not null and bmi.bar_id = v_bar_id and br.deleted_at is null
    order by t_score desc, br.name asc, br.id asc
    limit 10
  ),
  tier2_house as (
    select 'bar_recipe'::text as t_kind, br.id as t_id, br.name as t_name, 2 as t_tier,
           extensions.similarity(br.name, query) as t_score
    from public.bar_recipes br
    where v_bar_id is not null and br.bar_id = v_bar_id and br.deleted_at is null
      and not exists (select 1 from public.bar_menu_items bmi where bmi.bar_recipe_id = br.id)
    order by t_score desc, br.name asc, br.id asc
    limit 10
  ),
  tier3_pinned as (
    select
      case when pv.recipe_id is not null then 'recipe' else 'bar_recipe' end as t_kind,
      coalesce(pv.recipe_id, pv.bar_recipe_id) as t_id,
      coalesce(r.name, br.name) as t_name,
      3 as t_tier,
      1.0::real as t_score
    from public.pinned_recipes_visible pv
    left join public.recipes r on r.id = pv.recipe_id and r.deleted_at is null
    left join public.bar_recipes br on br.id = pv.bar_recipe_id and br.deleted_at is null
    where pv.user_id = auth.uid() and coalesce(r.id, br.id) is not null
    order by pv.sort_order asc
    limit 10
  ),
  tier4_recent as (
    select 'recipe'::text as t_kind, r.id as t_id, r.name as t_name, 4 as t_tier, 1.0::real as t_score
    from unnest(coalesce(recent_recipe_ids, '{}'::uuid[])) with ordinality as t(id, ord)
    join public.recipes r on r.id = t.id and r.deleted_at is null
    order by t.ord asc
    limit 10
  ),
  tier5_exact as (
    select 'recipe'::text as t_kind, r.id as t_id, r.name as t_name, 5 as t_tier, 1.0::real as t_score
    from public.recipes r
    where r.deleted_at is null
      and lower(regexp_replace(r.name, '[[:punct:]]', '', 'g')) =
          lower(regexp_replace(trim(query), '[[:punct:]]', '', 'g'))
    order by r.name asc, r.id asc
    limit 10
  ),
  tier6_fuzzy as (
    select 'recipe'::text as t_kind, sr.id as t_id, sr.name as t_name, 6 as t_tier,
           extensions.similarity(sr.name, query) as t_score
    from public.search_recipes(query, null, 50, 0) sr
    where sr.id not in (select tier5_exact.t_id from tier5_exact)
    order by t_score desc, sr.name asc, sr.id asc
    limit 10
  ),
  tier7_alias_ingredient as (
    select 'recipe'::text as t_kind, r.id as t_id, r.name as t_name, 7 as t_tier, ra_score.score as t_score
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
    where r.id not in (select tier5_exact.t_id from tier5_exact)
      and r.id not in (select tier6_fuzzy.t_id from tier6_fuzzy)
    order by ra_score.score desc, r.name asc, r.id asc
    limit 10
  )
  select t_kind, t_id, t_name, t_tier, t_score from tier1_menu
  union all
  select t_kind, t_id, t_name, t_tier, t_score from tier2_house
  union all
  select t_kind, t_id, t_name, t_tier, t_score from tier3_pinned
  union all
  select t_kind, t_id, t_name, t_tier, t_score from tier4_recent
  union all
  select t_kind, t_id, t_name, t_tier, t_score from tier5_exact
  union all
  select t_kind, t_id, t_name, t_tier, t_score from tier6_fuzzy
  union all
  select t_kind, t_id, t_name, t_tier, t_score from tier7_alias_ingredient;
end;
$$;

revoke all on function public.search_bartender(text, uuid, uuid[]) from public;
revoke execute on function public.search_bartender(text, uuid, uuid[]) from anon;
grant execute on function public.search_bartender(text, uuid, uuid[]) to authenticated;
