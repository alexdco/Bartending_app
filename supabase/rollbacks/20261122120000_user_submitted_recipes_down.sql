-- Rollback for 20261122120000_user_submitted_recipes.sql (spec 0064,
-- migration slice 1). Kept outside supabase/migrations so the CLI never
-- applies it. Run by hand in the SQL editor only for a full revert.
-- It restores admin_upsert_recipe (from 20261114190000_fame_on_arrival.sql)
-- and fetch_recipe_detail (from 20261119140000_mocktails_only_search_detail.sql)
-- exactly as before, then drops everything slice 1 added.
-- Roll back the web deploy first. It fails while any recipe has
-- source = 'community' (the restored source check rejects it): delete or
-- reassign those recipes first if you really mean to revert.

begin;

-- admin_upsert_recipe, previous body (same signature, grants kept) ----------
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
  p_method text default null,
  p_set_fame_score boolean default false,
  p_fame_score smallint default null
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
  old_region text;
  old_fame_score smallint;
  rank_changed boolean;
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

  -- Spec 0056 AC-10: a whole number from 0 to 100, or null (the next import
  -- scores it). smallint already rules out fractions.
  if p_set_fame_score
    and p_fame_score is not null
    and (p_fame_score < 0 or p_fame_score > 100)
  then
    raise exception 'fame score must be a whole number from 0 to 100';
  end if;

  perform pg_advisory_xact_lock(hashtext('admin_upsert_recipe'));

  if p_recipe_id is null then
    insert into public.recipes (
      source_id, source, name, instructions, glass, alcoholic_status, region, fame_score
    )
    values (
      'admin-' || gen_random_uuid()::text,
      'admin',
      p_name,
      p_instructions,
      p_glass,
      p_alcoholic_status,
      p_region,
      case when p_set_fame_score then p_fame_score end
    )
    returning id into recipe_row_id;

    rank_changed := p_region is not null
      or (p_set_fame_score and p_fame_score is not null);
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

    -- AC-10: the old region is read before the write, so both the region a
    -- recipe leaves and the one it joins are reranked.
    old_region := stored.region;
    old_fame_score := stored.fame_score;
    rank_changed := p_region is distinct from old_region
      or (p_set_fame_score and p_fame_score is distinct from old_fame_score);

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
        fame_score = case when p_set_fame_score then p_fame_score else fame_score end,
        -- Cleared here so moving regions never collides with a rank already
        -- held in the new region; recompute_popularity_ranks sets it again.
        popularity_rank = case when rank_changed then null else popularity_rank end,
        admin_locked_at = case
          when import_owned_changed then now()
          else admin_locked_at
        end,
        -- AC-5: any save of a row that is locked after this save acknowledges
        -- the latest upstream version.
        source_hash = case
          when admin_locked_at is not null or import_owned_changed then latest_source_hash
          else source_hash
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

  if rank_changed then
    perform public.recompute_popularity_ranks(array_remove(array[old_region, p_region], null));
  end if;

  return recipe_row_id;
end;
$$;

-- fetch_recipe_detail, previous shape --------------------------------------
drop function public.fetch_recipe_detail(uuid, text);

create function public.fetch_recipe_detail(p_id uuid, p_locale text default 'en'::text)
returns table (
  id uuid,
  name text,
  instructions text,
  image_url text,
  alcoholic_status text,
  glass text,
  difficulty text,
  method text,
  straining text,
  taste_tags text[],
  is_favorited boolean,
  ingredients jsonb,
  is_cocktaildb_recipe boolean,
  drink_style text,
  drink_style_note text,
  bartender_tip text,
  presentation_tip text,
  base_name text,
  mocktail_safe boolean
)
language sql
stable
set search_path = ''
as $$
  with resolved_locale as (
    select public.resolve_locale(p_locale) as locale
  )
  select
    r.id,
    coalesce(rt.name, r.name) as name,
    coalesce(rt.instructions, r.instructions) as instructions,
    r.image_url,
    r.alcoholic_status,
    coalesce(rt.glass, r.glass) as glass,
    r.difficulty,
    r.method,
    r.straining,
    coalesce(
      (
        select array_agg(coalesce(tt.name, t.name) order by t.normalized_name)
        from public.recipe_tags rtags
        join public.tags t on t.id = rtags.tag_id and t.kind = 'taste'
        left join public.tag_translations tt
          on tt.tag_id = t.id and tt.locale = (select locale from resolved_locale)
        where rtags.recipe_id = r.id
      ),
      array[]::text[]
    ) as taste_tags,
    exists (
      select 1 from public.favorites f
      where f.recipe_id = r.id and f.user_id = auth.uid()
    ) as is_favorited,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'ingredient_id', ri.ingredient_id,
            'name', coalesce(it.name, i.name),
            'measure', coalesce(rit.measure, ri.measure),
            'sort_order', ri.sort_order,
            'amount_value', ri.amount_value,
            'amount_max_value', ri.amount_max_value,
            'amount_unit', ri.amount_unit,
            'category', i.category,
            'is_staple', i.is_staple,
            'allergens', i.allergens
          )
          order by ri.sort_order
        )
        from public.recipe_ingredients ri
        join public.ingredients i on i.id = ri.ingredient_id
        left join public.ingredient_translations it
          on it.ingredient_id = i.id and it.locale = (select locale from resolved_locale)
        left join public.recipe_ingredient_translations rit
          on rit.recipe_id = ri.recipe_id
          and rit.ingredient_id = ri.ingredient_id
          and rit.locale = (select locale from resolved_locale)
        where ri.recipe_id = r.id
      ),
      '[]'::jsonb
    ) as ingredients,
    (r.source = 'catalog' and r.source_id !~ '^custom:') as is_cocktaildb_recipe,
    r.drink_style,
    coalesce(rt.drink_style_note, r.drink_style_note) as drink_style_note,
    coalesce(rt.bartender_tip, r.bartender_tip) as bartender_tip,
    coalesce(rt.presentation_tip, r.presentation_tip) as presentation_tip,
    r.name as base_name,
    -- Spec 0063 AC-6: the one definition of mocktail safe, from the view.
    r.id in (select ms.id from public.mocktail_safe_recipes ms) as mocktail_safe
  from public.recipes r
  left join public.recipe_translations rt
    on rt.recipe_id = r.id and rt.locale = (select locale from resolved_locale)
  where r.id = p_id
    and r.deleted_at is null;
$$;

revoke execute on function public.fetch_recipe_detail(uuid, text) from public;
grant execute on function public.fetch_recipe_detail(uuid, text)
  to anon, authenticated, service_role;

-- Slice 1 objects -------------------------------------------------------------
drop function public.recipe_submitted_by_name(uuid);
drop function public.admin_approve_recipe_submission(
  uuid, timestamptz, uuid, text, text, text, text, text, jsonb, jsonb, text[], boolean, text, boolean, smallint, text, text
);
drop function public.admin_fetch_recipe_submission(uuid);
drop function public.admin_list_recipe_submissions(text, timestamptz, uuid, int);
drop function public.fetch_my_recipe_submission(uuid);
drop function public.fetch_my_recipe_submissions(timestamptz, uuid, int, text);
drop function public.save_recipe_submission(uuid, text, jsonb, text, text, text, text, text, text, text);
drop function public._upsert_recipe_core(
  text, text, uuid, uuid, uuid, text, text, text, text, text, jsonb, jsonb, text[], boolean, text, boolean, smallint
);

drop table public.recipe_submission_usage;
drop table public.recipe_submissions;
drop function public.recipe_submissions_touch_updated_at();
drop function public.normalize_recipe_submission_ingredients(jsonb);
drop function public.recipe_submission_ingredients_valid(jsonb);

alter table public.user_preferences drop column submissions_blocked_at;

drop index public.recipes_submitted_by_idx;
alter table public.recipes drop constraint recipes_submitted_by_community_check;
alter table public.recipes drop column submitted_by;
alter table public.recipes drop constraint recipes_source_check;
alter table public.recipes
  add constraint recipes_source_check check (source in ('catalog', 'admin'));

notify pgrst, 'reload schema';

commit;
