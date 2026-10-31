-- Language agnostic locales, migration A (spec 0045, build step 1).
--
-- 1. supported_locales: the database's only list of languages, each with its
--    text search config. Seeded en, es, pt. Read by anon and authenticated
--    (the security invoker read functions and helpers read it as the caller);
--    only migrations and the service role write it.
-- 2. The five inline locale checks (names read from pg_constraint on the live
--    database) are replaced by foreign keys to supported_locales, plus
--    check (locale <> 'en') on the four translation tables (English lives on
--    the base rows, never as a translation row).
-- 3. recipe_translations.name_search changes from a column generated with the
--    'spanish' config to a plain tsvector set by a trigger from the row's own
--    locale config. Backfilled here, and its GIN index is recreated.
-- 4. Helpers: resolve_locale (a supported non English code, else null for the
--    English base row) and locale_search_config (that locale's config, else
--    english). They replace every case when ... in ('es') in function bodies.
-- 5. fetch_recipe_detail reads its locale through resolve_locale. Body
--    otherwise unchanged from 20261029120000_recipe_style_tips_allergens.sql.
--
-- Rollback: supabase/rollbacks/20261031120000_supported_locales_down.sql.
-- If a locale's text_search_config ever changes, recompute its rows with
--   update public.recipe_translations set name = name where locale = '<code>';

-- 1. supported_locales -------------------------------------------------------

create table public.supported_locales (
  code text primary key,
  text_search_config regconfig not null
);

comment on table public.supported_locales is
  'The only list of supported locales in the database (spec 0045). Mirrors SUPPORTED_LOCALES in packages/shared, checked by the locale parity test.';

insert into public.supported_locales (code, text_search_config) values
  ('en', 'english'),
  ('es', 'spanish'),
  ('pt', 'portuguese');

alter table public.supported_locales enable row level security;

create policy "Supported locales are readable by everyone"
  on public.supported_locales
  for select
  to anon, authenticated
  using (true);

revoke insert, update, delete, truncate on public.supported_locales from anon, authenticated;

-- 2. Checks become foreign keys ----------------------------------------------

alter table public.recipe_translations
  drop constraint recipe_translations_locale_check,
  add constraint recipe_translations_locale_check check (locale <> 'en'),
  add constraint recipe_translations_locale_fkey
    foreign key (locale) references public.supported_locales (code);

alter table public.ingredient_translations
  drop constraint ingredient_translations_locale_check,
  add constraint ingredient_translations_locale_check check (locale <> 'en'),
  add constraint ingredient_translations_locale_fkey
    foreign key (locale) references public.supported_locales (code);

alter table public.tag_translations
  drop constraint tag_translations_locale_check,
  add constraint tag_translations_locale_check check (locale <> 'en'),
  add constraint tag_translations_locale_fkey
    foreign key (locale) references public.supported_locales (code);

alter table public.recipe_ingredient_translations
  drop constraint recipe_ingredient_translations_locale_check,
  add constraint recipe_ingredient_translations_locale_check check (locale <> 'en'),
  add constraint recipe_ingredient_translations_locale_fkey
    foreign key (locale) references public.supported_locales (code);

alter table public.user_preferences
  drop constraint user_preferences_locale_check,
  add constraint user_preferences_locale_fkey
    foreign key (locale) references public.supported_locales (code);

-- 3. name_search from the row's own locale config ----------------------------

create or replace function public.recipe_translations_set_name_search()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  cfg regconfig;
begin
  select sl.text_search_config into cfg
  from public.supported_locales sl
  where sl.code = new.locale;

  if cfg is null then
    raise exception 'no text search config for locale %', new.locale
      using errcode = '22023';
  end if;

  new.name_search := to_tsvector(cfg, new.name);
  return new;
end;
$$;

alter table public.recipe_translations drop column name_search;

alter table public.recipe_translations add column name_search tsvector;

create trigger recipe_translations_set_name_search
  before insert or update of name, locale on public.recipe_translations
  for each row execute function public.recipe_translations_set_name_search();

-- Backfill through the trigger. updated_at is left as it was, since the
-- translated text itself does not change.
alter table public.recipe_translations disable trigger recipe_translations_set_updated_at;
update public.recipe_translations set name = name;
alter table public.recipe_translations enable trigger recipe_translations_set_updated_at;

create index recipe_translations_name_search_idx
  on public.recipe_translations using gin (name_search);

-- 4. Helpers -----------------------------------------------------------------

create or replace function public.resolve_locale(p_locale text)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select sl.code
  from public.supported_locales sl
  where sl.code = p_locale
    and sl.code <> 'en';
$$;

comment on function public.resolve_locale(text) is
  'A supported non English locale code, else null (use the English base row). Spec 0045.';

create or replace function public.locale_search_config(p_locale text)
returns regconfig
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (
      select sl.text_search_config
      from public.supported_locales sl
      where sl.code = public.resolve_locale(p_locale)
    ),
    'pg_catalog.english'::regconfig
  );
$$;

comment on function public.locale_search_config(text) is
  'The text search config for resolve_locale(p_locale), else english. Spec 0045.';

grant execute on function public.resolve_locale(text) to anon, authenticated;
grant execute on function public.locale_search_config(text) to anon, authenticated;

-- 5. fetch_recipe_detail -----------------------------------------------------

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
