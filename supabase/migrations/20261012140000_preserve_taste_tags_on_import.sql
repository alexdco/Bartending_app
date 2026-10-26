-- Preserve flavor profile (taste) tags across catalog and custom reimports,
-- and seed the fixed taste vocabulary with its Spanish names.
--
-- import_catalog and import_custom_recipes both cleared every recipe_tags row
-- for a recipe before re-linking the payload's tags. Taste tags (tags.kind =
-- 'taste', written by classify-recipes) are never in that payload, so every
-- reimport silently erased the recipe's flavor profile, and the hash gated
-- classifier would not restore it because the instructions had not changed.
-- Both functions now delete only catalog kind links. Bodies are otherwise
-- unchanged from 20261012120000_catalog_cleanup.sql and
-- 20260914000000_recipe_ingredient_unit_conversion.sql.

-- 1. import_catalog -----------------------------------------------------------

create or replace function public.import_catalog(
  drinks jsonb,
  merges jsonb default '[]'::jsonb,
  staple_names text[] default '{}'::text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  drink jsonb;
  ingredient jsonb;
  tag jsonb;
  merge_entry jsonb;
  recipe_row_id uuid;
  ingredient_row_id uuid;
  tag_row_id uuid;
  from_row_id uuid;
  to_row_id uuid;
  seen_source_ids text[] := array[]::text[];
  merged_source_ids text[] := array[]::text[];
  normalized_staples text[];
begin
  perform pg_advisory_xact_lock(hashtext('import_catalog'));

  -- Step 1: upsert drinks. Instructions are written on first insert, and on
  -- later runs only when the overrides file replaces them.
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
        instructions = case
          when coalesce((drink ->> 'instructionsOverride')::boolean, false)
            then excluded.instructions
          else public.recipes.instructions
        end,
        image_url = excluded.image_url,
        glass = excluded.glass,
        alcoholic_status = excluded.alcoholic_status,
        iba = excluded.iba,
        deleted_at = null,
        updated_at = now()
    returning id into recipe_row_id;

    delete from public.recipe_ingredients where recipe_id = recipe_row_id;
    -- Only catalog tags come from the payload; taste tags belong to the
    -- classify-recipes backfill and must survive a reimport.
    delete from public.recipe_tags rtags
    using public.tags t
    where rtags.recipe_id = recipe_row_id
      and t.id = rtags.tag_id
      and t.kind = 'catalog';

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

  -- Step 2: reconcile soft deletes. Only TheCocktailDB rows: custom recipes
  -- ("custom:" ids) and admin recipes (source 'admin') are never in this
  -- payload, so they must never be hidden by its absence.
  update public.recipes
  set deleted_at = now()
  where source = 'catalog'
    and source_id !~ '^custom:'
    and source_id <> all (seen_source_ids)
    and deleted_at is null;

  -- Steps 3 to 5: resolve merges after the upsert, so a target that is new
  -- this run works. One hop only; the import validates there are no chains.
  for merge_entry in select * from jsonb_array_elements(merges)
  loop
    select r.id into from_row_id
    from public.recipes r
    where r.source_id = merge_entry ->> 'fromSourceId';

    if from_row_id is null then
      continue;
    end if;

    select r.id into to_row_id
    from public.recipes r
    where r.source_id = merge_entry ->> 'toSourceId'
      and r.deleted_at is null;

    if to_row_id is null then
      raise exception 'merge target % is not a live recipe', merge_entry ->> 'toSourceId';
    end if;

    merged_source_ids := array_append(merged_source_ids, merge_entry ->> 'fromSourceId');

    update public.recipes
    set merged_into_recipe_id = to_row_id
    where id = from_row_id
      and merged_into_recipe_id is distinct from to_row_id;

    -- A user who already holds the target keeps that one row.
    delete from public.favorites f
    where f.recipe_id = from_row_id
      and exists (
        select 1 from public.favorites g
        where g.user_id = f.user_id and g.recipe_id = to_row_id
      );

    update public.favorites set recipe_id = to_row_id where recipe_id = from_row_id;

    delete from public.pinned_recipes p
    where p.recipe_id = from_row_id
      and exists (
        select 1 from public.pinned_recipes q
        where q.user_id = p.user_id and q.recipe_id = to_row_id
      );

    -- An update never fires the 20 pin insert trigger, so a user at the
    -- limit doesn't abort the import.
    update public.pinned_recipes set recipe_id = to_row_id where recipe_id = from_row_id;
  end loop;

  -- Step 4: clear pointers no longer named in the overrides file.
  update public.recipes
  set merged_into_recipe_id = null
  where source = 'catalog'
    and merged_into_recipe_id is not null
    and source_id <> all (merged_source_ids);

  -- Step 6: staple flags, matched on the same normalization as
  -- ingredients.normalized_name.
  normalized_staples := array(
    select lower(btrim(regexp_replace(s, '\s+', ' ', 'g')))
    from unnest(staple_names) as s
  );

  update public.ingredients
  set is_staple = (normalized_name = any (normalized_staples))
  where is_staple is distinct from (normalized_name = any (normalized_staples));

  -- Step 7: staples never live in a pantry or shopping list.
  delete from public.pantry_items pi
  using public.ingredients i
  where i.id = pi.ingredient_id and i.is_staple;

  delete from public.shopping_list_items sli
  using public.ingredients i
  where i.id = sli.ingredient_id and i.is_staple;
end;
$$;

revoke execute on function public.import_catalog(jsonb, jsonb, text[]) from public, anon, authenticated;
grant execute on function public.import_catalog(jsonb, jsonb, text[]) to service_role;

-- 2. import_custom_recipes ----------------------------------------------------

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
    -- Only catalog tags come from the payload; taste tags belong to the
    -- classify-recipes backfill and must survive a reimport.
    delete from public.recipe_tags rtags
    using public.tags t
    where rtags.recipe_id = recipe_row_id
      and t.id = rtags.tag_id
      and t.kind = 'catalog';

    for ingredient in select * from jsonb_array_elements(recipe -> 'ingredients')
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

-- 3. Taste vocabulary ---------------------------------------------------------
-- Mirrors TASTE_TAGS in packages/shared/src/recipeClassification.ts. Seeding
-- here means the Spanish names exist before the first classify run, instead
-- of waiting on the catalog translation script.

insert into public.tags (name, kind)
values
  ('sweet', 'taste'),
  ('sour', 'taste'),
  ('bitter', 'taste'),
  ('boozy', 'taste'),
  ('refreshing', 'taste'),
  ('fruity', 'taste'),
  ('spicy', 'taste'),
  ('creamy', 'taste')
on conflict (normalized_name) do update
set kind = 'taste';

insert into public.tag_translations (tag_id, locale, name)
select t.id, 'es', v.es_name
from (
  values
    ('sweet', 'dulce'),
    ('sour', 'ácido'),
    ('bitter', 'amargo'),
    ('boozy', 'fuerte'),
    ('refreshing', 'refrescante'),
    ('fruity', 'afrutado'),
    ('spicy', 'picante'),
    ('creamy', 'cremoso')
) as v (normalized_name, es_name)
join public.tags t on t.normalized_name = v.normalized_name and t.kind = 'taste'
on conflict (tag_id, locale) do update
set name = excluded.name;
