create or replace function public.search_recipes(
  query text default '',
  status_filter text default null,
  page_limit int default 20,
  page_offset int default 0
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
  with name_matches as (
    select r.id, r.name, r.image_url, r.alcoholic_status,
           0 as match_bucket,
           ts_rank(r.name_search, websearch_to_tsquery('english', query)) as rank
    from public.recipes r
    where r.deleted_at is null
      and query <> ''
      and r.name_search @@ websearch_to_tsquery('english', query)
      and (status_filter is null or r.alcoholic_status = status_filter)
  ),
  ingredient_matches as (
    select distinct r.id, r.name, r.image_url, r.alcoholic_status,
           1 as match_bucket,
           0::real as rank
    from public.recipes r
    join public.recipe_ingredients ri on ri.recipe_id = r.id
    join public.ingredients i on i.id = ri.ingredient_id
    where r.deleted_at is null
      and query <> ''
      and i.name operator(extensions.%) query
      and r.id not in (select nm.id from name_matches nm)
      and (status_filter is null or r.alcoholic_status = status_filter)
  ),
  browse_all as (
    select r.id, r.name, r.image_url, r.alcoholic_status,
           0 as match_bucket,
           0::real as rank
    from public.recipes r
    where r.deleted_at is null
      and query = ''
      and (status_filter is null or r.alcoholic_status = status_filter)
  ),
  combined as (
    select * from name_matches
    union all
    select * from ingredient_matches
    union all
    select * from browse_all
  )
  select c.id, c.name, c.image_url, c.alcoholic_status
  from combined c
  order by c.match_bucket asc, c.rank desc, c.name asc, c.id asc
  limit least(greatest(page_limit, 1), 50)
  offset greatest(page_offset, 0);
$$;

revoke all on function public.search_recipes(text, text, int, int) from public;
grant execute on function public.search_recipes(text, text, int, int) to anon, authenticated;
