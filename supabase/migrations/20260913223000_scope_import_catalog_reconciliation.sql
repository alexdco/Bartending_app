-- import_catalog's reconciliation sweep marked ANY recipe not present in the
-- current TheCocktailDB payload as removed, with no scoping to TheCocktailDB's
-- own id space. Once custom recipes (source_id prefixed "custom:", see
-- import_custom_recipes) exist in the same table, this would soft delete
-- every one of them on the next scheduled sync. Scope the sweep to
-- non-"custom:" source_ids only -- custom recipes are managed exclusively by
-- import_custom_recipes and must never be touched here.

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
      source_id, name, instructions, image_url, glass, alcoholic_status, deleted_at
    )
    values (
      drink ->> 'sourceId',
      drink ->> 'name',
      drink ->> 'instructions',
      drink ->> 'imageUrl',
      drink ->> 'glass',
      drink ->> 'alcoholicStatus',
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

    for ingredient in select * from jsonb_array_elements(drink -> 'ingredients')
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
