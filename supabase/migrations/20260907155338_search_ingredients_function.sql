-- search_ingredients: powers the pantry add picker.
-- Spec: docs/specs/0005-guest-pantry.md

create or replace function public.search_ingredients(
  query text default '',
  result_limit int default 20
)
returns table (
  id uuid,
  name text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with name_matches as (
    select i.id, i.name,
           extensions.similarity(i.name, query) as rank
    from public.ingredients i
    where query <> ''
      and i.name operator(extensions.%) query
  ),
  browse_all as (
    select i.id, i.name,
           0::real as rank
    from public.ingredients i
    where query = ''
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
$$;

revoke all on function public.search_ingredients(text, int) from public;
grant execute on function public.search_ingredients(text, int) to anon, authenticated;
