-- Quick Build Mode: fetch_bar_recipe_detail RPC.
--
-- Mirrors fetch_recipe_detail's shape/aggregation style for a house recipe.
-- Requires membership in the recipe's bar_id (RLS-equivalent check inside
-- the function body); returns nothing for a non member rather than another
-- bar's data. See spec 0023-bartender-mode/0023-quick-build-mode.md.

create function public.fetch_bar_recipe_detail(p_bar_recipe_id uuid)
returns table (
  id uuid,
  bar_id uuid,
  base_recipe_id uuid,
  name text,
  method text,
  straining text,
  instructions text,
  glass text,
  ice text,
  garnish text,
  ingredients jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    br.id,
    br.bar_id,
    br.base_recipe_id,
    br.name,
    br.method,
    br.straining,
    br.instructions,
    br.glass,
    br.ice,
    br.garnish,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'ingredient_id', bri.ingredient_id,
            'name', i.name,
            'amount_value', bri.amount_value,
            'amount_unit', bri.amount_unit,
            'sort_order', bri.sort_order
          )
          order by bri.sort_order
        )
        from public.bar_recipe_ingredients bri
        join public.ingredients i on i.id = bri.ingredient_id
        where bri.bar_recipe_id = br.id
      ),
      '[]'::jsonb
    ) as ingredients
  from public.bar_recipes br
  where br.id = p_bar_recipe_id
    and br.deleted_at is null
    and exists (
      select 1 from public.bar_members bm
      where bm.bar_id = br.bar_id and bm.user_id = (select auth.uid())
    );
$$;

revoke all on function public.fetch_bar_recipe_detail(uuid) from public;
revoke execute on function public.fetch_bar_recipe_detail(uuid) from anon;
grant execute on function public.fetch_bar_recipe_detail(uuid) to authenticated;
