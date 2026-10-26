-- Self hosted recipe images, slice 1 (spec 0041).
--
-- Recipe images move into a public `recipe-images` bucket as content hashed
-- hero and card WebP pairs. Each recipe records where its image came from
-- (image_origin), so neither import ever overwrites an image the admin
-- uploaded or removed. The admin sets an image through
-- admin_set_recipe_image, which checks both files exist; admin_upsert_recipe
-- no longer takes an image URL.

-- 1. Image columns ------------------------------------------------------------

alter table public.recipes
  add column image_origin text
    constraint recipes_image_origin_check
    check (image_origin in ('catalog_copy', 'admin_upload', 'external_hotlink')),
  add column image_source_url text;

-- Every existing image is a hotlink today (TheCocktailDB, or a URL the admin
-- pasted). Catalog rows on TheCocktailDB record the thumb they came from.
update public.recipes
set image_origin = 'external_hotlink'
where image_url is not null;

update public.recipes
set image_source_url = image_url
where source = 'catalog'
  and image_url like 'https://www.thecocktaildb.com/%';

-- AC-15: an image always has an origin; no image means never set, or the
-- admin removed it on purpose.
alter table public.recipes
  add constraint recipes_image_origin_consistency_check
  check (
    (image_url is not null and image_origin is not null)
    or (image_url is null and (image_origin is null or image_origin = 'admin_upload'))
  );

-- 2. Storage bucket and policies ----------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-images', 'recipe-images', true, 2097152, array['image/webp'])
on conflict (id) do nothing;

-- Admins write only under recipes/<recipe uuid>/<16 hex>-(hero|card).webp.
-- catalog/ has no policy, so only the service role (the import job) writes
-- there. Public URLs never go through these policies.
create policy recipe_images_storage_insert on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'recipe-images'
    and (select public.is_current_user_admin())
    and name ~ '^recipes/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{16}-(hero|card)\.webp$'
  );

-- The Storage API's remove() deletes with a returning clause, which needs the
-- row to pass a select policy too.
create policy recipe_images_storage_select on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'recipe-images'
    and (select public.is_current_user_admin())
    and name ~ '^recipes/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{16}-(hero|card)\.webp$'
  );

create policy recipe_images_storage_delete on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'recipe-images'
    and (select public.is_current_user_admin())
    and name ~ '^recipes/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{16}-(hero|card)\.webp$'
  );

-- No update policy: stored files are immutable.

-- 3. admin_set_recipe_image ---------------------------------------------------

-- Sets (or, with null, removes) a recipe's image to an uploaded hero whose
-- card sibling also exists, so a typo or a foreign URL can never be saved.
create or replace function public.admin_set_recipe_image(
  p_recipe_id uuid,
  p_hero_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_prefix text;
  v_file_count int;
begin
  if not public.is_current_user_admin() then
    raise exception 'not admin';
  end if;

  if not exists (select 1 from public.recipes r where r.id = p_recipe_id) then
    raise exception 'recipe not found';
  end if;

  if p_hero_url is null then
    update public.recipes
    set image_url = null,
        image_origin = 'admin_upload',
        image_source_url = null,
        updated_at = now()
    where id = p_recipe_id;
    return;
  end if;

  v_prefix := 'recipes/' || p_recipe_id::text || '/';
  v_hash := substring(
    p_hero_url
    from '^https?://[^/]+/storage/v1/object/public/recipe-images/'
      || v_prefix
      || '([0-9a-f]{16})-hero\.webp$'
  );

  if v_hash is null then
    raise exception 'invalid image url';
  end if;

  select count(*) into v_file_count
  from storage.objects o
  where o.bucket_id = 'recipe-images'
    and o.name in (v_prefix || v_hash || '-hero.webp', v_prefix || v_hash || '-card.webp');

  if v_file_count <> 2 then
    raise exception 'image files missing';
  end if;

  update public.recipes
  set image_url = p_hero_url,
      image_origin = 'admin_upload',
      image_source_url = null,
      updated_at = now()
  where id = p_recipe_id;
end;
$$;

revoke execute on function public.admin_set_recipe_image(uuid, text) from public, anon;
grant execute on function public.admin_set_recipe_image(uuid, text) to authenticated;

-- 4. Import guards -----------------------------------------------------------
--
-- Bodies unchanged from 20261012140000_preserve_taste_tags_on_import.sql except
-- the three image columns, which neither import touches on an admin_upload row.

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
      source_id, name, instructions, image_url, image_origin, image_source_url,
      glass, alcoholic_status, iba, deleted_at
    )
    values (
      drink ->> 'sourceId',
      drink ->> 'name',
      drink ->> 'instructions',
      drink ->> 'imageUrl',
      -- The job decides the origin; a payload without one is a hotlink.
      coalesce(
        drink ->> 'imageOrigin',
        case when drink ->> 'imageUrl' is not null then 'external_hotlink' end
      ),
      drink ->> 'imageSourceUrl',
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
        -- AC-6: an admin uploaded (or admin removed) image is never touched.
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
          else excluded.image_source_url
        end,
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
      source_id, name, instructions, image_url, image_origin, glass, alcoholic_status, deleted_at
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
      null
    )
    on conflict (source_id) do update
    set name = excluded.name,
        instructions = excluded.instructions,
        -- AC-6: an admin uploaded (or admin removed) image is never touched.
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

-- 5. admin_upsert_recipe without p_image_url ---------------------------------
--
-- The image is set separately by admin_set_recipe_image (a new recipe has no
-- id to build its storage path from until this returns). The signature
-- changes, so drop and recreate. Body otherwise unchanged from
-- 20261012160000_admin_flavor_profile_free_text.sql.

drop function public.admin_upsert_recipe(uuid, text, text, text, text, text, text, jsonb, jsonb, text[]);

create or replace function public.admin_upsert_recipe(
  p_recipe_id uuid,
  p_name text,
  p_instructions text,
  p_glass text,
  p_alcoholic_status text,
  p_region text,
  p_ingredients jsonb,
  p_tags jsonb,
  p_flavor_profile text[] default null
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
  flavor text;
  ingredient_row_id uuid;
  tag_row_id uuid;
  tag_row_kind text;
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

  if p_flavor_profile is not null then
    foreach flavor in array p_flavor_profile
    loop
      if length(btrim(flavor)) > 50 then
        raise exception 'flavor must be 50 characters or fewer: %', flavor;
      end if;
    end loop;
  end if;

  perform pg_advisory_xact_lock(hashtext('admin_upsert_recipe'));

  if p_recipe_id is null then
    insert into public.recipes (
      source_id, source, name, instructions, glass, alcoholic_status, region
    )
    values (
      'admin-' || gen_random_uuid()::text,
      'admin',
      p_name,
      p_instructions,
      p_glass,
      p_alcoholic_status,
      p_region
    )
    returning id into recipe_row_id;
  else
    update public.recipes
    set name = p_name,
        instructions = p_instructions,
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

  delete from public.recipe_tags rtags
  using public.tags t
  where rtags.recipe_id = recipe_row_id
    and t.id = rtags.tag_id
    and t.kind = 'catalog';

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
    returning id, kind into tag_row_id, tag_row_kind;

    -- Flavor profile is managed only through p_flavor_profile.
    if tag_row_kind <> 'catalog' then
      continue;
    end if;

    insert into public.recipe_tags (recipe_id, tag_id)
    values (recipe_row_id, tag_row_id)
    on conflict (recipe_id, tag_id) do nothing;
  end loop;

  if p_flavor_profile is not null then
    delete from public.recipe_tags rtags
    using public.tags t
    where rtags.recipe_id = recipe_row_id
      and t.id = rtags.tag_id
      and t.kind = 'taste';

    foreach flavor in array p_flavor_profile
    loop
      if flavor is null or btrim(flavor) = '' then
        continue;
      end if;

      -- A new flavor becomes a new taste tag. An existing taste tag keeps its
      -- stored spelling. A catalog tag of the same name is promoted to taste
      -- (names are unique across kinds), as the vocabulary seed did for
      -- Fruity and Refreshing.
      insert into public.tags (name, kind)
      values (btrim(flavor), 'taste')
      on conflict (normalized_name) do update
      set kind = 'taste'
      returning id into tag_row_id;

      insert into public.recipe_tags (recipe_id, tag_id)
      values (recipe_row_id, tag_row_id)
      on conflict (recipe_id, tag_id) do nothing;
    end loop;

    update public.recipes
    set flavor_profile_locked = true
    where id = recipe_row_id;
  end if;

  return recipe_row_id;
end;
$$;

revoke all on function public.admin_upsert_recipe(
  uuid, text, text, text, text, text, jsonb, jsonb, text[]
) from public, anon;

grant execute on function public.admin_upsert_recipe(
  uuid, text, text, text, text, text, jsonb, jsonb, text[]
) to authenticated;
