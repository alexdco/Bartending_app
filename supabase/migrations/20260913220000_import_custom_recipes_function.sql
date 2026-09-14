-- Custom (non-TheCocktailDB) recipes: a second, additive entry point into the
-- same recipes/ingredients/tags tables the TheCocktailDB import job writes to.
--
-- Deliberately does NOT do the reconciliation sweep import_catalog does
-- (marking unseen source_ids as removed) -- that sweep is scoped to whatever
-- source_ids are in *its* payload (the full TheCocktailDB catalog) and would
-- soft delete every custom recipe on the next sync if it ran here too, or if
-- custom recipes were included in that payload. Custom recipes must use a
-- source_id outside TheCocktailDB's id space; the custom import script
-- enforces a "custom:" prefix so the two id spaces can never collide.

create or replace function public.import_custom_recipes(recipes jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipe jsonb;
  ingredient jsonb;
  tag jsonb;
  recipe_row_id uuid;
  ingredient_row_id uuid;
  tag_row_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('import_custom_recipes'));

  for recipe in select * from jsonb_array_elements(recipes)
  loop
    if (recipe ->> 'sourceId') !~ '^custom:' then
      raise exception 'custom recipe sourceId must start with "custom:": %', recipe ->> 'sourceId';
    end if;

    insert into public.recipes (
      source_id, name, instructions, image_url, glass, alcoholic_status, deleted_at
    )
    values (
      recipe ->> 'sourceId',
      recipe ->> 'name',
      recipe ->> 'instructions',
      recipe ->> 'imageUrl',
      recipe ->> 'glass',
      recipe ->> 'alcoholicStatus',
      null
    )
    on conflict (source_id) do update
    set name = excluded.name,
        instructions = excluded.instructions,
        image_url = excluded.image_url,
        glass = excluded.glass,
        alcoholic_status = excluded.alcoholic_status,
        deleted_at = null,
        updated_at = now()
    returning id into recipe_row_id;

    delete from public.recipe_ingredients where recipe_id = recipe_row_id;
    delete from public.recipe_tags where recipe_id = recipe_row_id;

    for ingredient in select * from jsonb_array_elements(recipe -> 'ingredients')
    loop
      insert into public.ingredients (name)
      values (ingredient ->> 'ingredientName')
      on conflict (normalized_name) do update
      set name = excluded.name
      returning id into ingredient_row_id;

      insert into public.recipe_ingredients (recipe_id, ingredient_id, measure, sort_order)
      values (
        recipe_row_id,
        ingredient_row_id,
        ingredient ->> 'measure',
        (ingredient ->> 'sortOrder')::int
      )
      on conflict (recipe_id, ingredient_id) do nothing;
    end loop;

    for tag in select * from jsonb_array_elements(recipe -> 'tags')
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
end;
$$;

revoke execute on function public.import_custom_recipes(jsonb) from public, anon, authenticated;
