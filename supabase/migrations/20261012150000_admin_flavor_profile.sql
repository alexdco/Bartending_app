-- Admin editable flavor profile.
--
-- The admin recipe form gains a Flavor profile picker over the fixed taste
-- vocabulary (tags.kind = 'taste', seeded by
-- 20261012140000_preserve_taste_tags_on_import.sql, which must run first).
--
-- 1. recipes.flavor_profile_locked: set when an admin saves a flavor profile,
--    so classify-recipes stops overwriting it. The classifier still writes
--    difficulty for a locked recipe; it only skips the taste tags.
-- 2. admin_upsert_recipe gains p_flavor_profile (text[], default null):
--      null  -> leave the recipe's taste tags and lock untouched (the admin
--               didn't touch the picker, so a new recipe still gets AI tags)
--      array -> replace the taste tags with exactly these and lock them
--    p_tags now only manages catalog tags: it no longer clears taste links,
--    and a free text tag that matches a taste tag's name is ignored.
--    Everything else is unchanged from
--    20261011140100_admin_upsert_recipe_parsed_amounts.sql.

-- 1. Lock column ----------------------------------------------------------------

alter table public.recipes
  add column flavor_profile_locked boolean not null default false;

comment on column public.recipes.flavor_profile_locked is
  'True once an admin has saved this recipe''s flavor profile (taste tags). classify-recipes skips taste tags for locked recipes.';

-- 2. admin_upsert_recipe --------------------------------------------------------
-- A new parameter changes the signature, so the old overload must be dropped
-- or PostgREST would see two candidates.

drop function if exists public.admin_upsert_recipe(
  uuid, text, text, text, text, text, text, jsonb, jsonb
);

create function public.admin_upsert_recipe(
  p_recipe_id uuid,
  p_name text,
  p_instructions text,
  p_image_url text,
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

  -- Validated before any write so an unknown flavor fails the save cleanly.
  if p_flavor_profile is not null then
    foreach flavor in array p_flavor_profile
    loop
      if not exists (
        select 1 from public.tags t
        where t.kind = 'taste'
          and t.normalized_name = lower(btrim(flavor))
      ) then
        raise exception 'unknown flavor: %', flavor;
      end if;
    end loop;
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

    insert into public.recipe_tags (recipe_id, tag_id)
    select recipe_row_id, t.id
    from public.tags t
    where t.kind = 'taste'
      and t.normalized_name in (select lower(btrim(f)) from unnest(p_flavor_profile) as f)
    on conflict (recipe_id, tag_id) do nothing;

    update public.recipes
    set flavor_profile_locked = true
    where id = recipe_row_id;
  end if;

  return recipe_row_id;
end;
$$;

revoke all on function public.admin_upsert_recipe(
  uuid, text, text, text, text, text, text, jsonb, jsonb, text[]
) from public, anon;

grant execute on function public.admin_upsert_recipe(
  uuid, text, text, text, text, text, text, jsonb, jsonb, text[]
) to authenticated;
