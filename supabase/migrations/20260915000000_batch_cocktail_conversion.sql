-- Batch cocktail conversion (spec 0022): adds a Haiku classified category to
-- ingredients (spirit/liqueur/citrus/other) so the batch tool can offer
-- "alcohol only" / "everything except citrus" presets, and surfaces it on
-- fetch_recipe_detail alongside the existing amount_value/amount_unit.

alter table public.ingredients
  add column category text;

alter table public.ingredients
  add constraint ingredients_category_check
  check (category is null or category in ('spirit', 'liqueur', 'citrus', 'other'));

comment on column public.ingredients.category is
  'Haiku classified ingredient category, one of spirit/liqueur/citrus/other. Null until classified by the import job or the one time backfill script (AC-9).';

create or replace function public.fetch_recipe_detail(
  p_id uuid,
  p_locale text default 'en'
)
returns table (
  id uuid,
  name text,
  instructions text,
  image_url text,
  alcoholic_status text,
  glass text,
  is_favorited boolean,
  ingredients jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  with resolved_locale as (
    select case when p_locale in ('es') then p_locale else null end as locale
  )
  select
    r.id,
    coalesce(rt.name, r.name) as name,
    coalesce(rt.instructions, r.instructions) as instructions,
    r.image_url,
    r.alcoholic_status,
    coalesce(rt.glass, r.glass) as glass,
    exists (
      select 1 from public.favorites f
      where f.recipe_id = r.id and f.user_id = auth.uid()
    ) as is_favorited,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'ingredient_id', ri.ingredient_id,
            'name', coalesce(it.name, i.name),
            'measure', coalesce(rit.measure, ri.measure),
            'sort_order', ri.sort_order,
            'amount_value', ri.amount_value,
            'amount_unit', ri.amount_unit,
            'category', i.category
          )
          order by ri.sort_order
        )
        from public.recipe_ingredients ri
        join public.ingredients i on i.id = ri.ingredient_id
        left join public.ingredient_translations it
          on it.ingredient_id = i.id and it.locale = (select locale from resolved_locale)
        left join public.recipe_ingredient_translations rit
          on rit.recipe_id = ri.recipe_id
          and rit.ingredient_id = ri.ingredient_id
          and rit.locale = (select locale from resolved_locale)
        where ri.recipe_id = r.id
      ),
      '[]'::jsonb
    ) as ingredients
  from public.recipes r
  left join public.recipe_translations rt
    on rt.recipe_id = r.id and rt.locale = (select locale from resolved_locale)
  where r.id = p_id
    and r.deleted_at is null;
$$;

revoke all on function public.fetch_recipe_detail(uuid, text) from public;
grant execute on function public.fetch_recipe_detail(uuid, text) to anon, authenticated;
