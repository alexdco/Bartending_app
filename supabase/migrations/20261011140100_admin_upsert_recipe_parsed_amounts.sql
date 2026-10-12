-- Admin save keeps parsed amounts (spec 0035 AC-8): admin_upsert_recipe
-- deletes and reinserts a recipe's recipe_ingredients rows, and used to
-- write only measure, so every admin save wiped amount_value/amount_unit
-- and broke the unit toggle and batch panel. Each ingredient in the payload
-- now carries amount_value and amount_unit, parsed client side by the same
-- shared parser the import job uses, and they are written here. An older
-- client that doesn't send them stores null for both, as before. Everything
-- else is unchanged from 20260930200000_admin_recipe_management.sql.
-- Spec: docs/specs/0035-batch-calculator-correctness/index.md

create or replace function public.admin_upsert_recipe(
  p_recipe_id uuid,
  p_name text,
  p_instructions text,
  p_image_url text,
  p_glass text,
  p_alcoholic_status text,
  p_region text,
  p_ingredients jsonb,
  p_tags jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipe_row_id uuid;
  ingredient jsonb;
  tag jsonb;
  ingredient_row_id uuid;
  tag_row_id uuid;
  ingredient_count int;
begin
  if not exists (
    select 1 from public.user_preferences up
    where up.user_id = auth.uid()
      and up.is_admin
  ) then
    raise exception 'not authorized';
  end if;

  if p_name is null or btrim(p_name) = '' then
    raise exception 'name is required';
  end if;

  if length(p_name) > 200 then
    raise exception 'name must be 200 characters or fewer';
  end if;

  if p_instructions is null or btrim(p_instructions) = '' then
    raise exception 'instructions are required';
  end if;

  if length(p_instructions) > 10000 then
    raise exception 'instructions must be 10,000 characters or fewer';
  end if;

  if p_alcoholic_status is null
    or p_alcoholic_status not in ('alcoholic', 'non_alcoholic', 'optional', 'unknown')
  then
    raise exception 'alcoholic_status must be one of alcoholic, non_alcoholic, optional, unknown';
  end if;

  select coalesce(jsonb_array_length(p_ingredients), 0) into ingredient_count;

  if ingredient_count = 0 then
    raise exception 'at least one ingredient is required';
  end if;

  perform pg_advisory_xact_lock(hashtext('admin_upsert_recipe'));

  if p_recipe_id is null then
    insert into public.recipes (
      source_id, source, name, instructions, image_url, glass, alcoholic_status, region
    )
    values (
      'admin-' || gen_random_uuid()::text,
      'admin',
      p_name,
      p_instructions,
      p_image_url,
      p_glass,
      p_alcoholic_status,
      p_region
    )
    returning id into recipe_row_id;
  else
    update public.recipes
    set name = p_name,
        instructions = p_instructions,
        image_url = p_image_url,
        glass = p_glass,
        alcoholic_status = p_alcoholic_status,
        region = p_region,
        updated_at = now()
    where id = p_recipe_id
    returning id into recipe_row_id;

    if recipe_row_id is null then
      raise exception 'recipe not found: %', p_recipe_id;
    end if;
  end if;

  delete from public.recipe_ingredients where recipe_id = recipe_row_id;
  delete from public.recipe_tags where recipe_id = recipe_row_id;

  for ingredient in select * from jsonb_array_elements(p_ingredients)
  loop
    if (ingredient ->> 'name') is null or btrim(ingredient ->> 'name') = '' then
      raise exception 'ingredient name is required';
    end if;

    insert into public.ingredients (name)
    values (ingredient ->> 'name')
    on conflict (normalized_name) do update
    set name = excluded.name
    returning id into ingredient_row_id;

    -- recipe_ingredients_amount_unit_check and _amount_pair_check reject an
    -- unknown unit or a half set pair, failing the whole save atomically.
    insert into public.recipe_ingredients (
      recipe_id, ingredient_id, measure, sort_order, amount_value, amount_unit
    )
    values (
      recipe_row_id,
      ingredient_row_id,
      ingredient ->> 'measure',
      (ingredient -> 'sortOrder')::int,
      (ingredient ->> 'amount_value')::numeric,
      ingredient ->> 'amount_unit'
    )
    on conflict (recipe_id, ingredient_id) do nothing;
  end loop;

  for tag in select * from jsonb_array_elements(coalesce(p_tags, '[]'::jsonb))
  loop
    if (tag ->> 'name') is null or btrim(tag ->> 'name') = '' then
      continue;
    end if;

    insert into public.tags (name)
    values (tag ->> 'name')
    on conflict (normalized_name) do update
    set name = excluded.name
    returning id into tag_row_id;

    insert into public.recipe_tags (recipe_id, tag_id)
    values (recipe_row_id, tag_row_id)
    on conflict (recipe_id, tag_id) do nothing;
  end loop;

  return recipe_row_id;
end;
$$;
