-- Extends recommend_recipes with the user's own 4 and 5 star ratings as a
-- weighted ingredient source (5 star = 1.0, 4 star = 0.6; 1 to 3 star
-- contributes nothing), and excludes any rated recipe (any score) from that
-- user's own candidates and fallback list, the same way favorites are
-- excluded today.

create or replace function public.recommend_recipes(
  recent_recipe_ids uuid[] default '{}'::uuid[],
  current_recipe_id uuid default null,
  page_limit int default 20,
  page_offset int default 0
)
returns table (
  id uuid,
  name text,
  image_url text,
  alcoholic_status text,
  score real
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  capped_recent_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'no active session' using errcode = '28000';
  end if;

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
      r.name,
      r.image_url,
      r.alcoholic_status,
      (sum(coalesce(iw.weight, 0)) / rt.total_count::real) as score
    from public.recipes r
    join recipe_totals rt on rt.recipe_id = r.id
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
    group by r.id, r.name, r.image_url, r.alcoholic_status, rt.total_count
    having sum(coalesce(iw.weight, 0)) > 0
  ),
  scored_page as (
    select s.id, s.name, s.image_url, s.alcoholic_status, s.score
    from scored s
    order by s.score desc, s.name asc, s.id asc
    limit least(greatest(page_limit, 1), 50)
    offset greatest(page_offset, 0)
  ),
  fallback_page as (
    select r.id, r.name, r.image_url, r.alcoholic_status, 0::real as score
    from public.recipes r
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
$$;

revoke all on function public.recommend_recipes(uuid[], uuid, int, int) from public;
grant execute on function public.recommend_recipes(uuid[], uuid, int, int) to anon, authenticated;
