-- Catalog freshness rules (spec 0056), slice 1: the lock.
--
-- 1. recipes.admin_locked_at: set when an admin save changes an import owned
--    field (AC-1) or an admin delete (AC-3) of a source = 'catalog' recipe.
--    Null means the import owns the recipe.
-- 2. import_catalog and import_custom_recipes leave a locked recipe's
--    content columns, ingredients, catalog tags, and deleted_at alone (AC-2)
--    and return a jsonb report with lockedSkipped (AC-13). The return type
--    changes from void to jsonb, so both are dropped and recreated with their
--    grants. Bodies are copied from 20261114130000_batch_ranges.sql with only
--    the lock lines added.
-- 3. admin_upsert_recipe (same signature as 20261114140000) reads the row
--    for update and takes the lock when an import owned field changed.
-- 4. admin_delete_recipe takes the lock on catalog rows and refuses to delete
--    a merge target.
-- Rollback: see the spec's Migration plan.
-- Spec: docs/specs/0056-catalog-freshness-rules/index.md

-- 1. admin_locked_at ---------------------------------------------------------
alter table public.recipes
  add column admin_locked_at timestamptz;

comment on column public.recipes.admin_locked_at is
  'When an admin took this catalog recipe over (an edit to an import owned field, or a delete). While set, import_catalog and import_custom_recipes never write its content, ingredients, catalog tags, or deleted_at (spec 0056). Cleared only by admin_reset_recipe_to_source.';

-- 2. import_catalog ----------------------------------------------------------
drop function if exists public.import_catalog(jsonb, jsonb, text[]);

create function public.import_catalog(
  drinks jsonb,
  merges jsonb default '[]'::jsonb,
  staple_names text[] default '{}'::text[]
)
returns jsonb
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
  recipe_locked_at timestamptz;
  recipe_stored_name text;
  ingredient_row_id uuid;
  tag_row_id uuid;
  from_row_id uuid;
  to_row_id uuid;
  seen_source_ids text[] := array[]::text[];
  merged_source_ids text[] := array[]::text[];
  normalized_staples text[];
  locked_skipped jsonb := '[]'::jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('import_catalog'));

  -- Step 1: upsert drinks. Instructions are written on first insert, and on
  -- later runs only when the overrides file replaces them. A locked row
  -- (spec 0056 AC-2) keeps its content columns and deleted_at; the
  -- on conflict branch reads the committed admin_locked_at under the row
  -- lock, so an admin save that commits first always wins.
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
    set name = case
          when public.recipes.admin_locked_at is not null then public.recipes.name
          else excluded.name
        end,
        instructions = case
          when public.recipes.admin_locked_at is not null then public.recipes.instructions
          when coalesce((drink ->> 'instructionsOverride')::boolean, false)
            then excluded.instructions
          else public.recipes.instructions
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
          else excluded.image_source_url
        end,
        glass = case
          when public.recipes.admin_locked_at is not null then public.recipes.glass
          else excluded.glass
        end,
        alcoholic_status = case
          when public.recipes.admin_locked_at is not null then public.recipes.alcoholic_status
          else excluded.alcoholic_status
        end,
        iba = case
          when public.recipes.admin_locked_at is not null then public.recipes.iba
          else excluded.iba
        end,
        deleted_at = case
          when public.recipes.admin_locked_at is not null then public.recipes.deleted_at
          else null
        end,
        updated_at = now()
    returning id, admin_locked_at, name
      into recipe_row_id, recipe_locked_at, recipe_stored_name;

    -- The child row steps branch on the value the upsert returned, not an
    -- earlier read.
    if recipe_locked_at is not null then
      locked_skipped := locked_skipped || jsonb_build_array(
        jsonb_build_object('sourceId', drink ->> 'sourceId', 'name', recipe_stored_name)
      );
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

    for ingredient in select * from jsonb_array_elements(drink -> 'ingredients')
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

  return jsonb_build_object('lockedSkipped', locked_skipped);
end;
$$;

revoke execute on function public.import_catalog(jsonb, jsonb, text[]) from public, anon, authenticated;
grant execute on function public.import_catalog(jsonb, jsonb, text[]) to service_role;

-- 3. import_custom_recipes ---------------------------------------------------
drop function if exists public.import_custom_recipes(jsonb);

create function public.import_custom_recipes(recipes jsonb)
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
  ingredient_row_id uuid;
  tag_row_id uuid;
  locked_skipped jsonb := '[]'::jsonb;
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
        updated_at = now()
    returning id, admin_locked_at, name
      into recipe_row_id, recipe_locked_at, recipe_stored_name;

    if recipe_locked_at is not null then
      locked_skipped := locked_skipped || jsonb_build_array(
        jsonb_build_object('sourceId', recipe ->> 'sourceId', 'name', recipe_stored_name)
      );
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

  return jsonb_build_object('lockedSkipped', locked_skipped);
end;
$$;

revoke execute on function public.import_custom_recipes(jsonb) from public, anon, authenticated;
grant execute on function public.import_custom_recipes(jsonb) to service_role;

-- 4. admin_upsert_recipe takes the lock (AC-1) ------------------------------
-- Same signature as 20261114140000_recipe_method_source.sql, so
-- create or replace keeps its grants. Only the lock lines are new.
create or replace function public.admin_upsert_recipe(
  p_recipe_id uuid,
  p_name text,
  p_instructions text,
  p_glass text,
  p_alcoholic_status text,
  p_region text,
  p_ingredients jsonb,
  p_tags jsonb,
  p_flavor_profile text[] default null,
  p_set_method boolean default false,
  p_method text default null
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
  stored public.recipes%rowtype;
  stored_ingredients jsonb;
  input_ingredients jsonb;
  stored_tags text[];
  input_tags text[];
  import_owned_changed boolean;
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

  -- recipes_method_check also rejects an unknown method; this gives the
  -- admin form a readable message first.
  if p_set_method
    and p_method is not null
    and p_method not in ('shake', 'stir', 'build', 'blend', 'layer')
  then
    raise exception 'method must be one of shake, stir, build, blend, layer';
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
    -- Spec 0056 AC-1: read the stored row under the row lock before any
    -- write, so the comparison never sees content an import is changing.
    select * into stored
    from public.recipes r
    where r.id = p_recipe_id
    for update;

    if not found then
      raise exception 'recipe not found: %', p_recipe_id;
    end if;

    if stored.source = 'catalog' and stored.admin_locked_at is null then
      -- Each side is normalized the way the form normalizes before sending:
      -- ingredient names to ingredients.normalized_name, measures trimmed
      -- with blank as null, list order by position (the import numbers from
      -- 1, the form from 0), glass by lower(btrim()), tags as a set.
      select coalesce(
        jsonb_agg(
          jsonb_build_array(
            i.normalized_name,
            nullif(btrim(ri.measure), ''),
            ri.amount_value,
            ri.amount_max_value,
            ri.amount_unit
          )
          order by ri.sort_order, i.normalized_name
        ),
        '[]'::jsonb
      )
      into stored_ingredients
      from public.recipe_ingredients ri
      join public.ingredients i on i.id = ri.ingredient_id
      where ri.recipe_id = p_recipe_id;

      select coalesce(
        jsonb_agg(
          jsonb_build_array(
            lower(btrim(regexp_replace(e ->> 'name', '\s+', ' ', 'g'))),
            nullif(btrim(e ->> 'measure'), ''),
            (e ->> 'amount_value')::numeric,
            (e ->> 'amount_max_value')::numeric,
            e ->> 'amount_unit'
          )
          order by ord
        ),
        '[]'::jsonb
      )
      into input_ingredients
      from jsonb_array_elements(p_ingredients) with ordinality as x(e, ord);

      select coalesce(array_agg(t.normalized_name order by t.normalized_name), '{}')
      into stored_tags
      from public.recipe_tags rtags
      join public.tags t on t.id = rtags.tag_id and t.kind = 'catalog'
      where rtags.recipe_id = p_recipe_id;

      -- A name that matches an existing taste tag is skipped by the tag loop
      -- below, so it is no catalog tag change either.
      select coalesce(array_agg(n order by n), '{}')
      into input_tags
      from (
        select distinct lower(btrim(regexp_replace(e ->> 'name', '\s+', ' ', 'g'))) as n
        from jsonb_array_elements(coalesce(p_tags, '[]'::jsonb)) as e
        where nullif(btrim(e ->> 'name'), '') is not null
      ) names
      where not exists (
        select 1 from public.tags t
        where t.normalized_name = names.n and t.kind <> 'catalog'
      );

      import_owned_changed :=
        btrim(stored.name) is distinct from btrim(p_name)
        or nullif(lower(btrim(stored.glass)), '') is distinct from nullif(lower(btrim(p_glass)), '')
        or stored.alcoholic_status is distinct from p_alcoholic_status
        or (
          stored.source_id ~ '^custom:'
          and btrim(stored.instructions) is distinct from btrim(p_instructions)
        )
        or stored_ingredients is distinct from input_ingredients
        or stored_tags is distinct from input_tags;
    else
      import_owned_changed := false;
    end if;

    update public.recipes
    set name = p_name,
        instructions = p_instructions,
        glass = p_glass,
        alcoholic_status = p_alcoholic_status,
        region = p_region,
        admin_locked_at = case
          when import_owned_changed then now()
          else admin_locked_at
        end,
        updated_at = now()
    where id = p_recipe_id
    returning id into recipe_row_id;
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
    -- unknown unit or a half set pair, and _amount_max_check rejects a max
    -- that is not above the value, failing the whole save atomically.
    insert into public.recipe_ingredients (
      recipe_id, ingredient_id, measure, sort_order, amount_value, amount_max_value, amount_unit
    )
    values (
      recipe_row_id,
      ingredient_row_id,
      ingredient ->> 'measure',
      (ingredient -> 'sortOrder')::int,
      (ingredient ->> 'amount_value')::numeric,
      (ingredient ->> 'amount_max_value')::numeric,
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

  -- Spec 0054 AC-11: only when the caller asks. A chosen method is an admin
  -- pick the classifier never overwrites; blank clears both columns, leaving
  -- the recipe free for the classifier's next run.
  if p_set_method then
    update public.recipes
    set method = p_method,
        method_source = case when p_method is null then null else 'admin' end
    where id = recipe_row_id;
  end if;

  return recipe_row_id;
end;
$$;

-- 5. admin_delete_recipe takes the lock (AC-3) ------------------------------
create or replace function public.admin_delete_recipe(p_recipe_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.user_preferences up
    where up.user_id = auth.uid()
      and up.is_admin
  ) then
    raise exception 'not authorized';
  end if;

  -- import_catalog raises when a merge target is not live, so deleting one
  -- would break every later import.
  if exists (
    select 1 from public.recipes r
    where r.merged_into_recipe_id = p_recipe_id
  ) then
    raise exception 'this recipe is a merge target in catalogOverrides.json';
  end if;

  update public.recipes
  set deleted_at = now(),
      admin_locked_at = case
        when source = 'catalog' then coalesce(admin_locked_at, now())
        else admin_locked_at
      end
  where id = p_recipe_id
    and deleted_at is null;
end;
$$;
