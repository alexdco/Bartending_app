-- Multi language support (spec 0020), build plan step 5: replace the
-- recipes_localized/ingredients_localized views (dead: nothing ever
-- populated request.locale, so they always resolved to English, see
-- docs/specs/0020-multi-language-support/index.md's Correction) with
-- security invoker Postgres functions that take locale as an explicit
-- parameter, matching the pattern build plan step 4 already used for
-- search_recipes and the other four locale aware reads.

drop view if exists public.recipes_localized;
drop view if exists public.ingredients_localized;

-- fetch_recipe_detail --------------------------------------------------------
--
-- Replaces fetchRecipeDetail's .from("recipes").select(...) embed. Ingredient
-- matching/identity stays keyed on ingredient_id; only display strings
-- (name, instructions, glass, ingredient name, measure) are localized.

create or replace function public.fetch_recipe_detail(
  p_id uuid,
  p_locale text default 'en'
)
returns table (
  id uuid,
  name text,
  instructions text,
  image_url text,
  alcoholic_status text,
  glass text,
  is_favorited boolean,
  ingredients jsonb
)
language sql
stable
security invoker
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
            'sort_order', ri.sort_order
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

revoke all on function public.fetch_recipe_detail(uuid, text) from public;
grant execute on function public.fetch_recipe_detail(uuid, text) to anon, authenticated;

-- fetch_pantry_items ----------------------------------------------------------
--
-- Replaces fetchPantryItems's .from("pantry_items").select(...) embed.

create or replace function public.fetch_pantry_items(
  p_locale text default 'en'
)
returns table (
  ingredient_id uuid,
  name text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    pi.ingredient_id,
    coalesce(it.name, i.name) as name
  from public.pantry_items pi
  join public.ingredients i on i.id = pi.ingredient_id
  left join public.ingredient_translations it
    on it.ingredient_id = i.id
    and it.locale = (case when p_locale in ('es') then p_locale else null end)
  where pi.user_id = auth.uid();
$$;

revoke all on function public.fetch_pantry_items(text) from public;
grant execute on function public.fetch_pantry_items(text) to authenticated;

-- fetch_favorite_recipes -------------------------------------------------------
--
-- Replaces fetchFavoriteRecipes's .from("favorites").select(...) embed.

create or replace function public.fetch_favorite_recipes(
  p_locale text default 'en',
  p_page_limit int default 20,
  p_page_offset int default 0
)
returns table (
  id uuid,
  name text,
  image_url text,
  alcoholic_status text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    r.id,
    coalesce(rt.name, r.name) as name,
    r.image_url,
    r.alcoholic_status
  from public.favorites f
  join public.recipes r on r.id = f.recipe_id
  left join public.recipe_translations rt
    on rt.recipe_id = r.id
    and rt.locale = (case when p_locale in ('es') then p_locale else null end)
  where f.user_id = auth.uid()
  order by f.created_at desc
  limit least(greatest(p_page_limit, 1), 50)
  offset greatest(p_page_offset, 0);
$$;

revoke all on function public.fetch_favorite_recipes(text, int, int) from public;
grant execute on function public.fetch_favorite_recipes(text, int, int) to authenticated;

-- fetch_recipes_by_ids ---------------------------------------------------------
--
-- Replaces fetchRecipesByIds's .from("recipes").select(...) embed (the
-- homepage's recently viewed carousel). Preserves the given id order.

create or replace function public.fetch_recipes_by_ids(
  p_ids uuid[],
  p_locale text default 'en'
)
returns table (
  id uuid,
  name text,
  image_url text,
  alcoholic_status text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    r.id,
    coalesce(rt.name, r.name) as name,
    r.image_url,
    r.alcoholic_status
  from unnest(p_ids) with ordinality as t(id, ord)
  join public.recipes r on r.id = t.id and r.deleted_at is null
  left join public.recipe_translations rt
    on rt.recipe_id = r.id
    and rt.locale = (case when p_locale in ('es') then p_locale else null end)
  order by t.ord;
$$;

revoke all on function public.fetch_recipes_by_ids(uuid[], text) from public;
grant execute on function public.fetch_recipes_by_ids(uuid[], text) to anon, authenticated;
