-- Shopping list follow ups (scope feature 43): fetch_shopping_list_items had
-- no order by, so items could come back in a different order on each fetch.
-- Oldest first, with ingredient_id as the tie breaker for rows added in the
-- same instant, so a newly added item lands at the bottom, exactly where the
-- client's optimistic add already puts it. The body is otherwise unchanged.

create or replace function public.fetch_shopping_list_items(
  p_locale text default 'en'
)
returns table (
  ingredient_id uuid,
  name text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    sli.ingredient_id,
    coalesce(it.name, i.name) as name
  from public.shopping_list_items sli
  join public.ingredients i on i.id = sli.ingredient_id
  left join public.ingredient_translations it
    on it.ingredient_id = i.id
    and it.locale = (case when p_locale in ('es') then p_locale else null end)
  where sli.user_id = (select auth.uid())
  order by sli.created_at, sli.ingredient_id;
$$;

revoke all on function public.fetch_shopping_list_items(text) from public;
grant execute on function public.fetch_shopping_list_items(text) to authenticated;
