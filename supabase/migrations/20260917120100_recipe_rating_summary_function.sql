-- recipe_rating_summary: average and count for a recipe, public read (no
-- session required, matching recipes' own public select policy). Ratings on
-- a since soft deleted recipe are excluded.

create or replace function public.recipe_rating_summary(p_recipe_id uuid)
returns table (
  average real,
  count int
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    avg(ra.score)::real as average,
    count(*)::int as count
  from public.ratings ra
  join public.recipes r on r.id = ra.recipe_id and r.deleted_at is null
  where ra.recipe_id = p_recipe_id;
$$;

revoke all on function public.recipe_rating_summary(uuid) from public;
grant execute on function public.recipe_rating_summary(uuid) to anon, authenticated;
