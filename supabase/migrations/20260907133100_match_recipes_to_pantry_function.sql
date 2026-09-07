create or replace function public.match_recipes_to_pantry(
  max_ratio real default 0.25,
  page_limit int default 20,
  page_offset int default 0
)
returns table (
  id uuid,
  name text,
  image_url text,
  alcoholic_status text,
  missing_ratio real,
  missing_ingredients jsonb
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'no active session' using errcode = '28000';
  end if;

  return query
  with recipe_totals as (
    select ri.recipe_id, count(*) as total_count
    from public.recipe_ingredients ri
    group by ri.recipe_id
  ),
  recipe_missing as (
    select
      ri.recipe_id,
      count(*) filter (where pi.ingredient_id is null) as missing_count,
      jsonb_agg(
        jsonb_build_object('id', i.id, 'name', i.name)
        order by i.name asc
      ) filter (where pi.ingredient_id is null) as missing_ingredients
    from public.recipe_ingredients ri
    join public.ingredients i on i.id = ri.ingredient_id
    left join public.pantry_items pi
      on pi.ingredient_id = ri.ingredient_id
      and pi.user_id = auth.uid()
    group by ri.recipe_id
  ),
  scored as (
    select
      r.id,
      r.name,
      r.image_url,
      r.alcoholic_status,
      (rm.missing_count::real / rt.total_count::real) as missing_ratio,
      coalesce(rm.missing_ingredients, '[]'::jsonb) as missing_ingredients
    from public.recipes r
    join recipe_totals rt on rt.recipe_id = r.id
    join recipe_missing rm on rm.recipe_id = r.id
    where r.deleted_at is null
      and (
        (rm.missing_count::real / rt.total_count::real) <= max_ratio
        or rm.missing_count = 1
      )
  )
  select s.id, s.name, s.image_url, s.alcoholic_status, s.missing_ratio, s.missing_ingredients
  from scored s
  order by s.missing_ratio asc, s.name asc, s.id asc
  limit least(greatest(page_limit, 1), 50)
  offset greatest(page_offset, 0);
end;
$$;

revoke all on function public.match_recipes_to_pantry(real, int, int) from public;
grant execute on function public.match_recipes_to_pantry(real, int, int) to anon, authenticated;
