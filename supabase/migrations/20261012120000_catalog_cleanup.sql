-- Recipe catalog cleanup through a curated overrides file.
-- Spec: docs/specs/0036-recipe-catalog-cleanup/index.md
--
-- Adds merge pointers on hidden duplicates and a staple flag on ingredients,
-- replaces import_catalog with a 3 argument version that records merges,
-- moves favorites and pins, flags staples, and only writes instructions when
-- the overrides file asks for it. Pantry matching treats staples as present,
-- ingredient search hides them unless asked, and the recipe detail payload
-- carries the flag. Backward compatible until the import runs: no row is
-- hidden and no ingredient is a staple yet.

-- 1. Columns ------------------------------------------------------------------

alter table public.recipes
  add column merged_into_recipe_id uuid null
    references public.recipes (id) on delete set null,
  add constraint recipes_merged_into_not_self
    check (merged_into_recipe_id <> id);

comment on column public.recipes.merged_into_recipe_id is
  'Set only on a soft deleted duplicate: the kept recipe its old links redirect to. Written by import_catalog from catalogOverrides.json (spec 0036).';

alter table public.ingredients
  add column is_staple boolean not null default false;

comment on column public.ingredients.is_staple is
  'Always on hand (Ice, Water): counted as present by pantry matching and never offered to the pantry or shopping list. Written by import_catalog (spec 0036).';

-- 2. import_catalog -----------------------------------------------------------

drop function if exists public.import_catalog(jsonb);

create function public.import_catalog(
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
    delete from public.recipe_tags where recipe_id = recipe_row_id;

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

-- 3. resolve_recipe_redirect --------------------------------------------------

-- Security definer so it can see a soft deleted row (recipes_select hides
-- them) while exposing only the kept recipe's id. A crude hidden recipe has
-- no pointer, so it returns null and leaks nothing.
create function public.resolve_recipe_redirect(p_recipe_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select target.id
  from public.recipes hidden
  join public.recipes target on target.id = hidden.merged_into_recipe_id
  where hidden.id = p_recipe_id
    and hidden.deleted_at is not null
    and target.deleted_at is null;
$$;

revoke execute on function public.resolve_recipe_redirect(uuid) from public;
grant execute on function public.resolve_recipe_redirect(uuid) to anon, authenticated, service_role;

-- 4. match_recipes_to_pantry: staples count as present ------------------------

create or replace function public.match_recipes_to_pantry(
  max_ratio real default 0.25,
  page_limit integer default 20,
  page_offset integer default 0,
  locale text default 'en'::text
)
returns table (
  id uuid,
  name text,
  image_url text,
  alcoholic_status text,
  missing_ratio real,
  missing_ingredients jsonb
)
language plpgsql
stable
set search_path = ''
as $$
declare
  resolved_locale text;
begin
  if auth.uid() is null then
    raise exception 'no active session' using errcode = '28000';
  end if;

  resolved_locale := case when locale in ('es') then locale else null end;

  return query
  with recipe_totals as (
    -- total_count still counts every line, so "x of y" describes the whole
    -- recipe; a recipe made only of staples is excluded below.
    select
      ri.recipe_id,
      count(*) as total_count,
      count(*) filter (where not i.is_staple) as non_staple_count
    from public.recipe_ingredients ri
    join public.ingredients i on i.id = ri.ingredient_id
    group by ri.recipe_id
  ),
  recipe_missing as (
    select
      ri.recipe_id,
      count(*) filter (where pi.ingredient_id is null and not i.is_staple) as missing_count,
      jsonb_agg(
        jsonb_build_object('id', i.id, 'name', coalesce(it.name, i.name))
        order by coalesce(it.name, i.name) asc
      ) filter (where pi.ingredient_id is null and not i.is_staple) as missing_ingredients
    from public.recipe_ingredients ri
    join public.ingredients i on i.id = ri.ingredient_id
    left join public.ingredient_translations it
      on it.ingredient_id = i.id and it.locale = resolved_locale
    left join public.pantry_items pi
      on pi.ingredient_id = ri.ingredient_id
      and pi.user_id = auth.uid()
    group by ri.recipe_id
  ),
  scored as (
    select
      r.id,
      coalesce(rt.name, r.name) as name,
      r.image_url,
      r.alcoholic_status,
      (rm.missing_count::real / rt2.total_count::real) as missing_ratio,
      coalesce(rm.missing_ingredients, '[]'::jsonb) as missing_ingredients
    from public.recipes r
    left join public.recipe_translations rt
      on rt.recipe_id = r.id and rt.locale = resolved_locale
    join recipe_totals rt2 on rt2.recipe_id = r.id
    join recipe_missing rm on rm.recipe_id = r.id
    where r.deleted_at is null
      and rt2.non_staple_count > 0
      and (
        (rm.missing_count::real / rt2.total_count::real) <= max_ratio
        or rm.missing_count = 1
      )
  )
  select s.id, s.name, s.image_url, s.alcoholic_status, s.missing_ratio, s.missing_ingredients
  from scored s
  order by s.missing_ratio asc, s.name asc, s.id asc
  limit least(greatest(page_limit, 1), 50)
  offset greatest(page_offset, 0);
end;
$$;

-- 5. search_ingredients: staples hidden unless asked --------------------------

drop function if exists public.search_ingredients(text, integer, text);

create function public.search_ingredients(
  query text default ''::text,
  result_limit integer default 20,
  locale text default 'en'::text,
  include_staples boolean default false
)
returns table (id uuid, name text)
language sql
stable
set search_path = ''
as $$
  with resolved_locale as (
    select case when locale in ('es') then locale else null end as locale
  ),
  name_matches as (
    select i.id,
           coalesce(it.name, i.name) as name,
           greatest(
             extensions.similarity(i.name, query),
             coalesce(extensions.similarity(it.name, query), 0)
           ) as rank
    from public.ingredients i
    left join public.ingredient_translations it
      on it.ingredient_id = i.id and it.locale = (select locale from resolved_locale)
    where query <> ''
      and (include_staples or not i.is_staple)
      and (i.name operator(extensions.%) query or it.name operator(extensions.%) query)
  ),
  browse_all as (
    select i.id,
           coalesce(it.name, i.name) as name,
           0::real as rank
    from public.ingredients i
    left join public.ingredient_translations it
      on it.ingredient_id = i.id and it.locale = (select locale from resolved_locale)
    where query = ''
      and (include_staples or not i.is_staple)
  ),
  combined as (
    select * from name_matches
    union all
    select * from browse_all
  )
  select c.id, c.name
  from combined c
  order by c.rank desc, c.name asc, c.id asc
  limit least(greatest(result_limit, 1), 50);
$$;

grant execute on function public.search_ingredients(text, integer, text, boolean) to anon, authenticated, service_role;

-- 6. fetch_recipe_detail: each ingredient carries is_staple -------------------

create or replace function public.fetch_recipe_detail(p_id uuid, p_locale text default 'en'::text)
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
  ingredients jsonb
)
language sql
stable
set search_path = ''
as $$
  with resolved_locale as (
    select case when p_locale in ('es') then p_locale else null end as locale
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
            'amount_unit', ri.amount_unit,
            'category', i.category,
            'is_staple', i.is_staple
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
    ) as ingredients
  from public.recipes r
  left join public.recipe_translations rt
    on rt.recipe_id = r.id and rt.locale = (select locale from resolved_locale)
  where r.id = p_id
    and r.deleted_at is null;
$$;

-- 7. pinned_recipes_visible: hide pins on soft deleted recipes ---------------

create or replace view public.pinned_recipes_visible
with (security_invoker = true)
as
select p.id, p.user_id, p.recipe_id, p.bar_recipe_id, p.sort_order, p.pinned_at
from public.pinned_recipes p
where (
    p.recipe_id is not null
    and exists (
      select 1 from public.recipes r
      where r.id = p.recipe_id and r.deleted_at is null
    )
  )
  or exists (
    select 1
    from public.bar_recipes br
    join public.bar_members bm on bm.bar_id = br.bar_id and bm.user_id = p.user_id
    where br.id = p.bar_recipe_id and br.deleted_at is null
  );

-- 8. Staple row cleanup (0 rows today; runs again inside every import) -------

delete from public.pantry_items pi
using public.ingredients i
where i.id = pi.ingredient_id and i.is_staple;

delete from public.shopping_list_items sli
using public.ingredients i
where i.id = sli.ingredient_id and i.is_staple;
