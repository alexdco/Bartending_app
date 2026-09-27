-- CocktailDB import updates:
--
-- 1. import_catalog no longer overwrites recipes.instructions on reimport.
--    Instructions text is left alone once a recipe already exists (a human
--    or a later feature may have edited it); new recipes still get their
--    instructions set on first insert.
--
-- 2. Import TheCocktailDB's strIBA field as recipes.iba, nullable, mirroring
--    the existing region/difficulty columns. Blank/missing source values
--    import as null rather than an empty string.

alter table public.recipes
  add column iba text;

comment on column public.recipes.iba is
  'TheCocktailDB strIBA field (e.g. "Cocktail Classics"). Null when the source drink has no IBA designation.';

create or replace function public.import_catalog(drinks jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  drink jsonb;
  ingredient jsonb;
  tag jsonb;
  recipe_row_id uuid;
  ingredient_row_id uuid;
  tag_row_id uuid;
  seen_source_ids text[] := array[]::text[];
begin
  perform pg_advisory_xact_lock(hashtext('import_catalog'));

  for drink in select * from jsonb_array_elements(drinks)
  loop
    seen_source_ids := array_append(seen_source_ids, drink ->> 'sourceId');

    insert into public.recipes (
      source_id, name, instructions, image_url, glass, alcoholic_status, iba, deleted_at
    )
    values (
      drink ->> 'sourceId',
      drink ->> 'name',
      drink ->> 'instructions',
      drink ->> 'imageUrl',
      drink ->> 'glass',
      drink ->> 'alcoholicStatus',
      drink ->> 'iba',
      null
    )
    on conflict (source_id) do update
    set name = excluded.name,
        image_url = excluded.image_url,
        glass = excluded.glass,
        alcoholic_status = excluded.alcoholic_status,
        iba = excluded.iba,
        deleted_at = null,
        updated_at = now()
    returning id into recipe_row_id;

    delete from public.recipe_ingredients where recipe_id = recipe_row_id;
    delete from public.recipe_tags where recipe_id = recipe_row_id;

    for ingredient in select * from jsonb_array_elements(drink -> 'ingredients')
    loop
      insert into public.ingredients (name)
      values (ingredient ->> 'ingredientName')
      on conflict (normalized_name) do update
      set name = excluded.name
      returning id into ingredient_row_id;

      insert into public.recipe_ingredients (
        recipe_id, ingredient_id, measure, sort_order, amount_value, amount_unit
      )
      values (
        recipe_row_id,
        ingredient_row_id,
        ingredient ->> 'measure',
        (ingredient ->> 'sortOrder')::int,
        (ingredient ->> 'amountValue')::numeric,
        ingredient ->> 'amountUnit'
      )
      on conflict (recipe_id, ingredient_id) do update
      set measure = excluded.measure,
          amount_value = excluded.amount_value,
          amount_unit = excluded.amount_unit;
    end loop;

    for tag in select * from jsonb_array_elements(drink -> 'tags')
    loop
      insert into public.tags (name)
      values (tag ->> 'tagName')
      on conflict (normalized_name) do update
      set name = excluded.name
      returning id into tag_row_id;

      insert into public.recipe_tags (recipe_id, tag_id)
      values (recipe_row_id, tag_row_id)
      on conflict (recipe_id, tag_id) do nothing;
    end loop;
  end loop;

  update public.recipes
  set deleted_at = now()
  where source_id <> all (seen_source_ids)
    and source_id !~ '^custom:'
    and deleted_at is null;
end;
$$;

revoke execute on function public.import_catalog(jsonb) from public, anon, authenticated;
