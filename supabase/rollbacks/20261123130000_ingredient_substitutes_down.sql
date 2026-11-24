-- Rollback for 20261123130000_ingredient_substitutes.sql (spec 0065 task 1).
--
-- Restores fetch_bar_service_data to its three column shape (menu,
-- house_recipes, stock_86, no alcohol_free) with the same grants, then drops
-- the swap tables and ingredients.substitutes_reviewed_at. Reviewed swaps and
-- their translations are lost; rerun the apply SQL after reapplying.
begin;

drop function if exists public.fetch_bar_service_data(uuid);

create function public.fetch_bar_service_data(p_bar_id uuid)
returns table (
  menu jsonb,
  house_recipes jsonb,
  stock_86 jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.jwt() ->> 'is_anonymous') = 'true'
    or not exists (
      select 1 from public.bar_members
      where bar_id = p_bar_id and user_id = auth.uid()
    )
  then
    raise exception 'not a member of this bar' using errcode = '42501';
  end if;

  return query
  select
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', bmi.id,
            'bar_recipe_id', bmi.bar_recipe_id,
            'name', br.name,
            'sort_order', bmi.sort_order,
            'active', bmi.active
          )
          order by bmi.sort_order
        )
        from public.bar_menu_items bmi
        join public.bar_recipes br on br.id = bmi.bar_recipe_id
        where bmi.bar_id = p_bar_id and br.deleted_at is null
      ),
      '[]'::jsonb
    ) as menu,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', br.id,
            'base_recipe_id', br.base_recipe_id,
            'name', br.name,
            'method', br.method,
            'straining', br.straining,
            'instructions', br.instructions,
            'glass', br.glass,
            'ice', br.ice,
            'garnish', br.garnish,
            'ingredients', coalesce(
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
            )
          )
          order by br.name
        )
        from public.bar_recipes br
        where br.bar_id = p_bar_id and br.deleted_at is null
      ),
      '[]'::jsonb
    ) as house_recipes,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('ingredient_id', bis.ingredient_id, 'is_86d', bis.is_86d)
        )
        from public.bar_ingredient_stock bis
        where bis.bar_id = p_bar_id and bis.is_86d = true
      ),
      '[]'::jsonb
    ) as stock_86;
end;
$$;

revoke all on function public.fetch_bar_service_data(uuid) from public;
revoke execute on function public.fetch_bar_service_data(uuid) from anon;
grant execute on function public.fetch_bar_service_data(uuid) to authenticated;

drop table if exists public.ingredient_substitute_translations;
drop table if exists public.ingredient_substitutes;

alter table public.ingredients drop column if exists substitutes_reviewed_at;

notify pgrst, 'reload schema';

commit;
