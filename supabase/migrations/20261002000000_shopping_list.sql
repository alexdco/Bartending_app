-- Shopping list (spec 0031), build plan step 1: shopping_list_items table,
-- same shape and RLS as pantry_items, plus the atomic buy_shopping_list_item
-- function that moves a row from the shopping list into the pantry.

-- shopping_list_items -----------------------------------------------------

create table public.shopping_list_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (user_id, ingredient_id)
);

create index shopping_list_items_ingredient_id_idx on public.shopping_list_items (ingredient_id);

alter table public.shopping_list_items enable row level security;

-- owner scoped, no public read, no update policy (nothing to update; see
-- pantry_items' own comment for why an update policy is deliberately absent)

create policy shopping_list_items_select on public.shopping_list_items
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy shopping_list_items_insert on public.shopping_list_items
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy shopping_list_items_delete on public.shopping_list_items
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- fetch_shopping_list_items -------------------------------------------------
--
-- Mirrors fetch_pantry_items: locale aware ingredient name, owner scoped via
-- auth.uid() inside the function (security invoker, so RLS still applies).

create function public.fetch_shopping_list_items(
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
  where sli.user_id = (select auth.uid());
$$;

revoke all on function public.fetch_shopping_list_items(text) from public;
grant execute on function public.fetch_shopping_list_items(text) to authenticated;

-- buy_shopping_list_item -----------------------------------------------------
--
-- AC-4: moves one ingredient from the shopping list into the pantry,
-- atomically, in one call. security invoker: RLS on both tables still
-- applies, so the caller can only ever affect their own rows, the same
-- pattern spec 0026's submit_quiz_attempt established for a multi step
-- write PostgREST cannot express in one request. The shopping list row not
-- existing is still a success (AC-7's no op rule): deletes 0 rows, inserts
-- into the pantry with on conflict do nothing, same as a normal pantry add.

create function public.buy_shopping_list_item(p_ingredient_id uuid)
returns public.pantry_items
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.pantry_items;
begin
  delete from public.shopping_list_items
  where user_id = (select auth.uid()) and ingredient_id = p_ingredient_id;

  insert into public.pantry_items (user_id, ingredient_id)
  values ((select auth.uid()), p_ingredient_id)
  on conflict (user_id, ingredient_id) do nothing
  returning * into result;

  if result.user_id is null then
    select * into result
    from public.pantry_items
    where user_id = (select auth.uid()) and ingredient_id = p_ingredient_id;
  end if;

  return result;
end;
$$;

revoke all on function public.buy_shopping_list_item(uuid) from public;
grant execute on function public.buy_shopping_list_item(uuid) to authenticated;
