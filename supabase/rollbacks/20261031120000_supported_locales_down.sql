-- Rollback for 20261031120000_supported_locales.sql (spec 0045, migration A).
-- Kept outside supabase/migrations so the CLI never applies it. Run by hand in
-- the SQL editor only for a full revert; Portuguese is unlaunched until build
-- step 9, so a bad phase is normally fixed forward instead.

begin;

-- 1. Delete the pt translation rows.
delete from public.recipe_ingredient_translations where locale = 'pt';
delete from public.recipe_translations where locale = 'pt';
delete from public.ingredient_translations where locale = 'pt';
delete from public.tag_translations where locale = 'pt';
update public.user_preferences set locale = null where locale = 'pt';

-- 2. Drop the trigger and the trigger function.
drop trigger recipe_translations_set_name_search on public.recipe_translations;
drop function public.recipe_translations_set_name_search();

-- 3. Drop the plain name_search column (drops its index too).
alter table public.recipe_translations drop column name_search;

-- 4. Restore the generated column and its index.
alter table public.recipe_translations
  add column name_search tsvector generated always as (to_tsvector('spanish', name)) stored;
create index recipe_translations_name_search_idx
  on public.recipe_translations using gin (name_search);

-- 5. Foreign keys back to the original checks, under their original names.
alter table public.recipe_translations
  drop constraint recipe_translations_locale_fkey,
  drop constraint recipe_translations_locale_check,
  add constraint recipe_translations_locale_check check (locale in ('es'));
alter table public.ingredient_translations
  drop constraint ingredient_translations_locale_fkey,
  drop constraint ingredient_translations_locale_check,
  add constraint ingredient_translations_locale_check check (locale in ('es'));
alter table public.tag_translations
  drop constraint tag_translations_locale_fkey,
  drop constraint tag_translations_locale_check,
  add constraint tag_translations_locale_check check (locale in ('es'));
alter table public.recipe_ingredient_translations
  drop constraint recipe_ingredient_translations_locale_fkey,
  drop constraint recipe_ingredient_translations_locale_check,
  add constraint recipe_ingredient_translations_locale_check check (locale in ('es'));
alter table public.user_preferences
  drop constraint user_preferences_locale_fkey,
  add constraint user_preferences_locale_check check (locale is null or locale in ('en', 'es'));

-- 6. Restore fetch_recipe_detail from 20261029120000.
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
  ingredients jsonb,
  is_cocktaildb_recipe boolean,
  drink_style text,
  drink_style_note text,
  bartender_tip text,
  presentation_tip text
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
    coalesce(rt.presentation_tip, r.presentation_tip) as presentation_tip
  from public.recipes r
  left join public.recipe_translations rt
    on rt.recipe_id = r.id and rt.locale = (select locale from resolved_locale)
  where r.id = p_id
    and r.deleted_at is null;
$$;

-- 7. Drop the helpers, then supported_locales.
drop function public.locale_search_config(text);
drop function public.resolve_locale(text);
drop table public.supported_locales;

commit;
