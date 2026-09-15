-- Recipe difficulty score and taste profile.
--
-- Difficulty is a Haiku classified enum column on recipes, mirroring spec
-- 0022's ingredients.category pattern (nullable, check constrained, gated by
-- a source_name_hash so reclassification only happens when inputs change).
--
-- Taste profile reuses the existing tags/recipe_tags catalog instead of a new
-- table: tags gains a "kind" discriminator ('catalog' for TheCocktailDB's
-- existing tags, 'taste' for the fixed taste vocabulary below), so taste tags
-- are filterable independently of catalog tags but ride the same join table,
-- RLS, and tag_translations infrastructure for free.

-- difficulty ------------------------------------------------------------------

alter table public.recipes
  add column difficulty text;

alter table public.recipes
  add constraint recipes_difficulty_check
  check (difficulty is null or difficulty in ('easy', 'medium', 'hard'));

comment on column public.recipes.difficulty is
  'Haiku classified difficulty, one of easy/medium/hard. Null until classified by the backfill script or ongoing import classification step.';

alter table public.recipes
  add column difficulty_source_name_hash text;

comment on column public.recipes.difficulty_source_name_hash is
  'sha256 of the instructions text last classified. Null until first classified. Compared against the current instructions'' hash to decide whether reclassification is needed.';

-- taste profile (tags.kind) ----------------------------------------------------

alter table public.tags
  add column kind text not null default 'catalog';

alter table public.tags
  add constraint tags_kind_check
  check (kind in ('catalog', 'taste'));

-- normalized_name is already globally unique; scope taste tags to their own
-- fixed vocabulary via a partial index so a taste tag can never collide with
-- an unrelated catalog tag of the same name.
comment on column public.tags.kind is
  'Distinguishes TheCocktailDB catalog tags (default) from the fixed taste profile vocabulary (sweet/sour/bitter/boozy/refreshing/fruity/spicy/creamy) applied by Haiku classification.';

create index tags_kind_idx on public.tags (kind);

-- recipes_localized view: expose difficulty alongside the existing columns --

create or replace view public.recipes_localized
with (security_invoker = true)
as
select
  r.id,
  coalesce(rt.name, r.name) as name,
  coalesce(rt.instructions, r.instructions) as instructions,
  r.image_url,
  r.region,
  coalesce(rt.glass, r.glass) as glass,
  r.alcoholic_status,
  r.difficulty,
  r.source_id,
  r.deleted_at,
  r.created_at,
  r.updated_at
from public.recipes r
left join public.recipe_translations rt
  on rt.recipe_id = r.id
  and rt.locale = nullif(current_setting('request.locale', true), '');

-- fetch_recipe_detail: surface difficulty and taste tags -----------------------
-- Return type shape changed (two new columns), so the existing function must
-- be dropped before it can be recreated.

drop function if exists public.fetch_recipe_detail(uuid, text);

create function public.fetch_recipe_detail(
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
  difficulty text,
  taste_tags text[],
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
    r.difficulty,
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
            'category', i.category
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
