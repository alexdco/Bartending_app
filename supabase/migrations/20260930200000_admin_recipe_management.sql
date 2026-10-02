-- Admin recipe management: lets the site's one admin create, edit, and soft
-- delete recipes directly, independent of the TheCocktailDB import job.
-- Spec: docs/specs/0030-admin-recipe-management.md

-- source column -------------------------------------------------------------
--
-- 'catalog' for every existing and future import job row (both import_catalog
-- and import_custom_recipes write catalog-sourced recipes); 'admin' only for
-- a recipe created through this feature. An edit never changes this value
-- (AC-3); only admin_upsert_recipe's create path sets it.

alter table public.recipes
  add column source text not null default 'catalog'
    check (source in ('catalog', 'admin'));

-- is_admin scoped write policies ---------------------------------------------
--
-- Mirrors spec 0028's comments_delete policy shape. Existing public SELECT
-- policies and the import job's service role access (which bypasses RLS
-- entirely) are unchanged. No DELETE policy: the only delete path is
-- admin_delete_recipe's own is_admin check, which performs a soft UPDATE,
-- never a hard DELETE.

create policy recipes_admin_insert on public.recipes
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.user_preferences up
      where up.user_id = (select auth.uid())
        and up.is_admin
    )
  );

create policy recipes_admin_update on public.recipes
  for update
  to authenticated
  using (
    exists (
      select 1 from public.user_preferences up
      where up.user_id = (select auth.uid())
        and up.is_admin
    )
  )
  with check (
    exists (
      select 1 from public.user_preferences up
      where up.user_id = (select auth.uid())
        and up.is_admin
    )
  );

create policy ingredients_admin_insert on public.ingredients
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.user_preferences up
      where up.user_id = (select auth.uid())
        and up.is_admin
    )
  );

create policy ingredients_admin_update on public.ingredients
  for update
  to authenticated
  using (
    exists (
      select 1 from public.user_preferences up
      where up.user_id = (select auth.uid())
        and up.is_admin
    )
  )
  with check (
    exists (
      select 1 from public.user_preferences up
      where up.user_id = (select auth.uid())
        and up.is_admin
    )
  );

create policy recipe_ingredients_admin_insert on public.recipe_ingredients
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.user_preferences up
      where up.user_id = (select auth.uid())
        and up.is_admin
    )
  );

create policy recipe_ingredients_admin_update on public.recipe_ingredients
  for update
  to authenticated
  using (
    exists (
      select 1 from public.user_preferences up
      where up.user_id = (select auth.uid())
        and up.is_admin
    )
  )
  with check (
    exists (
      select 1 from public.user_preferences up
      where up.user_id = (select auth.uid())
        and up.is_admin
    )
  );

create policy recipe_ingredients_admin_delete on public.recipe_ingredients
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.user_preferences up
      where up.user_id = (select auth.uid())
        and up.is_admin
    )
  );

create policy tags_admin_insert on public.tags
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.user_preferences up
      where up.user_id = (select auth.uid())
        and up.is_admin
    )
  );

create policy tags_admin_update on public.tags
  for update
  to authenticated
  using (
    exists (
      select 1 from public.user_preferences up
      where up.user_id = (select auth.uid())
        and up.is_admin
    )
  )
  with check (
    exists (
      select 1 from public.user_preferences up
      where up.user_id = (select auth.uid())
        and up.is_admin
    )
  );

create policy recipe_tags_admin_insert on public.recipe_tags
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.user_preferences up
      where up.user_id = (select auth.uid())
        and up.is_admin
    )
  );

create policy recipe_tags_admin_update on public.recipe_tags
  for update
  to authenticated
  using (
    exists (
      select 1 from public.user_preferences up
      where up.user_id = (select auth.uid())
        and up.is_admin
    )
  )
  with check (
    exists (
      select 1 from public.user_preferences up
      where up.user_id = (select auth.uid())
        and up.is_admin
    )
  );

create policy recipe_tags_admin_delete on public.recipe_tags
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.user_preferences up
      where up.user_id = (select auth.uid())
        and up.is_admin
    )
  );

-- admin_upsert_recipe ---------------------------------------------------------
--
-- Transactional multi table save (AC-8): resolves or creates each ingredient
-- and tag by normalized_name (relying on the DB-generated column and its
-- unique constraint, same as import_catalog/import_custom_recipes), then
-- fully replaces the recipe's recipe_ingredients/recipe_tags rows to match
-- the submitted list. Called via RPC under the admin's own session; checks
-- is_admin itself (defense in depth alongside the RLS policies above) and
-- raises on a missing required field so the save fails atomically (AC-8).
--
-- p_recipe_id null means create: a new recipe row is inserted with a
-- synthetic source_id ('admin-<uuid>', never colliding with TheCocktailDB's
-- numeric ids or the "custom:" prefix) and source set to 'admin'. A given
-- p_recipe_id means edit: the existing row is updated in place and its
-- source/source_id are left untouched (AC-3).

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

    insert into public.recipe_ingredients (recipe_id, ingredient_id, measure, sort_order)
    values (
      recipe_row_id,
      ingredient_row_id,
      ingredient ->> 'measure',
      (ingredient -> 'sortOrder')::int
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

grant execute on function public.admin_upsert_recipe(
  uuid, text, text, text, text, text, text, jsonb, jsonb
) to authenticated;

-- admin_delete_recipe ----------------------------------------------------------
--
-- Soft delete only (sets deleted_at), matching spec 0002's existing
-- restrict-on-delete rule for recipes -> favorites: an existing favorites
-- row referencing the recipe is left untouched (AC-5). Checks is_admin
-- itself; a missing recipe_id is a no-op, not an error.

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

  update public.recipes
  set deleted_at = now()
  where id = p_recipe_id
    and deleted_at is null;
end;
$$;

grant execute on function public.admin_delete_recipe(uuid) to authenticated;
