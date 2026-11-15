-- Catalog freshness rules (spec 0056), slice 4: custom recipe parity and
-- reset.
--
-- 1. import_custom_recipes writes source_hash and latest_source_hash the same
--    way import_catalog does (AC-5) and adds changedUpstream to its report
--    (AC-13). Same signature and return type as 20261114150000_catalog_lock.sql,
--    so create or replace keeps its grants. Only the hash lines are new.
-- 2. admin_reset_recipe_to_source clears a catalog recipe's lock, so the next
--    import rewrites its import owned content from source and, when it is
--    still in source, brings a deleted one back (AC-6, AC-14).
-- Needs 20261114160000_catalog_source_hash.sql first.
-- Rollback: drop function public.admin_reset_recipe_to_source(uuid), and
-- restore import_custom_recipes from 20261114150000_catalog_lock.sql.
-- Spec: docs/specs/0056-catalog-freshness-rules/index.md

-- 1. import_custom_recipes ---------------------------------------------------
create or replace function public.import_custom_recipes(recipes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipe jsonb;
  ingredient jsonb;
  tag jsonb;
  recipe_row_id uuid;
  recipe_locked_at timestamptz;
  recipe_stored_name text;
  recipe_source_hash text;
  recipe_latest_source_hash text;
  ingredient_row_id uuid;
  tag_row_id uuid;
  locked_skipped jsonb := '[]'::jsonb;
  changed_upstream jsonb := '[]'::jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('import_custom_recipes'));

  for recipe in select * from jsonb_array_elements(recipes)
  loop
    if (recipe ->> 'sourceId') !~ '^custom:' then
      raise exception 'custom recipe sourceId must start with "custom:": %', recipe ->> 'sourceId';
    end if;

    insert into public.recipes (
      source_id, name, instructions, image_url, image_origin, glass, alcoholic_status, deleted_at,
      source_hash, latest_source_hash
    )
    values (
      recipe ->> 'sourceId',
      recipe ->> 'name',
      recipe ->> 'instructions',
      recipe ->> 'imageUrl',
      coalesce(
        recipe ->> 'imageOrigin',
        case when recipe ->> 'imageUrl' is not null then 'external_hotlink' end
      ),
      recipe ->> 'glass',
      recipe ->> 'alcoholicStatus',
      null,
      recipe ->> 'sourceHash',
      recipe ->> 'sourceHash'
    )
    on conflict (source_id) do update
    set name = case
          when public.recipes.admin_locked_at is not null then public.recipes.name
          else excluded.name
        end,
        instructions = case
          when public.recipes.admin_locked_at is not null then public.recipes.instructions
          else excluded.instructions
        end,
        -- AC-6 (spec 0041): an admin uploaded (or admin removed) image is never touched.
        image_url = case
          when public.recipes.image_origin = 'admin_upload' then public.recipes.image_url
          else excluded.image_url
        end,
        image_origin = case
          when public.recipes.image_origin = 'admin_upload' then public.recipes.image_origin
          else excluded.image_origin
        end,
        image_source_url = case
          when public.recipes.image_origin = 'admin_upload' then public.recipes.image_source_url
          else null
        end,
        glass = case
          when public.recipes.admin_locked_at is not null then public.recipes.glass
          else excluded.glass
        end,
        alcoholic_status = case
          when public.recipes.admin_locked_at is not null then public.recipes.alcoholic_status
          else excluded.alcoholic_status
        end,
        deleted_at = case
          when public.recipes.admin_locked_at is not null then public.recipes.deleted_at
          else null
        end,
        -- AC-5: a locked row keeps its baseline once it has one.
        source_hash = case
          when public.recipes.admin_locked_at is not null
            and public.recipes.source_hash is not null
            then public.recipes.source_hash
          else excluded.source_hash
        end,
        latest_source_hash = excluded.latest_source_hash,
        updated_at = now()
    returning id, admin_locked_at, name, source_hash, latest_source_hash
      into recipe_row_id, recipe_locked_at, recipe_stored_name,
        recipe_source_hash, recipe_latest_source_hash;

    if recipe_locked_at is not null then
      locked_skipped := locked_skipped || jsonb_build_array(
        jsonb_build_object('sourceId', recipe ->> 'sourceId', 'name', recipe_stored_name)
      );

      if recipe_source_hash is distinct from recipe_latest_source_hash then
        changed_upstream := changed_upstream || jsonb_build_array(
          jsonb_build_object('sourceId', recipe ->> 'sourceId', 'name', recipe_stored_name)
        );
      end if;

      continue;
    end if;

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
        recipe_id, ingredient_id, measure, sort_order, amount_value, amount_max_value, amount_unit
      )
      values (
        recipe_row_id,
        ingredient_row_id,
        ingredient ->> 'measure',
        (ingredient ->> 'sortOrder')::int,
        (ingredient ->> 'amountValue')::numeric,
        (ingredient ->> 'amountMaxValue')::numeric,
        ingredient ->> 'amountUnit'
      )
      on conflict (recipe_id, ingredient_id) do update
      set measure = excluded.measure,
          amount_value = excluded.amount_value,
          amount_max_value = excluded.amount_max_value,
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

  return jsonb_build_object('lockedSkipped', locked_skipped, 'changedUpstream', changed_upstream);
end;
$$;

-- 2. admin_reset_recipe_to_source (AC-6, AC-14) -----------------------------
create function public.admin_reset_recipe_to_source(p_recipe_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_source text;
begin
  if not exists (
    select 1 from public.user_preferences up
    where up.user_id = auth.uid()
      and up.is_admin
  ) then
    raise exception 'not authorized';
  end if;

  select r.source into stored_source
  from public.recipes r
  where r.id = p_recipe_id
  for update;

  if not found then
    raise exception 'recipe not found';
  end if;

  if stored_source <> 'catalog' then
    raise exception 'only catalog recipes can be reset';
  end if;

  -- Only the lock is cleared. The next import rewrites the import owned
  -- content and both hashes, and clears deleted_at when the recipe is still
  -- in source. A TheCocktailDB recipe's instructions are never restored: the
  -- import writes those only through an override.
  update public.recipes
  set admin_locked_at = null,
      updated_at = now()
  where id = p_recipe_id;
end;
$$;

revoke all on function public.admin_reset_recipe_to_source(uuid) from public, anon;
grant execute on function public.admin_reset_recipe_to_source(uuid) to authenticated;
