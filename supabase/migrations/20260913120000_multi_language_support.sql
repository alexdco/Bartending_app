-- Multi language support: recipe/ingredient/tag translation tables, localized
-- views, and a user preferred locale column.
-- Spec: docs/specs/0020-multi-language-support/index.md

-- recipe_translations ---------------------------------------------------------

create table public.recipe_translations (
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  locale text not null check (locale in ('es')),
  name text not null,
  instructions text not null,
  glass text,
  source_name_hash text not null,
  name_search tsvector generated always as (to_tsvector('spanish', name)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (recipe_id, locale)
);

create index recipe_translations_name_search_idx on public.recipe_translations using gin (name_search);

create trigger recipe_translations_set_updated_at
  before update on public.recipe_translations
  for each row execute function public.set_updated_at();

-- ingredient_translations -------------------------------------------------------

create table public.ingredient_translations (
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  locale text not null check (locale in ('es')),
  name text not null,
  source_name_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (ingredient_id, locale)
);

create index ingredient_translations_name_trgm_idx on public.ingredient_translations using gin (name gin_trgm_ops);

create trigger ingredient_translations_set_updated_at
  before update on public.ingredient_translations
  for each row execute function public.set_updated_at();

-- tag_translations ------------------------------------------------------------

create table public.tag_translations (
  tag_id uuid not null references public.tags (id) on delete cascade,
  locale text not null check (locale in ('es')),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tag_id, locale)
);

create trigger tag_translations_set_updated_at
  before update on public.tag_translations
  for each row execute function public.set_updated_at();

-- recipe_ingredient_translations -----------------------------------------------

create table public.recipe_ingredient_translations (
  recipe_id uuid not null,
  ingredient_id uuid not null,
  locale text not null check (locale in ('es')),
  measure text,
  primary key (recipe_id, ingredient_id, locale),
  foreign key (recipe_id, ingredient_id)
    references public.recipe_ingredients (recipe_id, ingredient_id) on delete cascade
);

-- user_preferences.locale -------------------------------------------------------

alter table public.user_preferences
  add column locale text
  check (locale is null or locale in ('en', 'es'));

-- localized views ---------------------------------------------------------------
--
-- Resolve locale from a session parameter set at the start of each request
-- (the same mechanism RLS policies use for auth.uid()), so existing PostgREST
-- embed syntax keeps working unchanged, now resolving through the view.
-- An unset or unrecognized parameter behaves as 'en' (English base columns).

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
  r.source_id,
  r.deleted_at,
  r.created_at,
  r.updated_at
from public.recipes r
left join public.recipe_translations rt
  on rt.recipe_id = r.id
  and rt.locale = nullif(current_setting('request.locale', true), '');

create or replace view public.ingredients_localized
with (security_invoker = true)
as
select
  i.id,
  coalesce(it.name, i.name) as name,
  i.normalized_name,
  i.image_url,
  i.created_at,
  i.updated_at
from public.ingredients i
left join public.ingredient_translations it
  on it.ingredient_id = i.id
  and it.locale = nullif(current_setting('request.locale', true), '');

-- row level security -------------------------------------------------------------
--
-- Same posture as recipes/ingredients/tags (spec 0002): public read, no client
-- writes; only the import job and backfill script (service role) write here.

alter table public.recipe_translations enable row level security;
alter table public.ingredient_translations enable row level security;
alter table public.tag_translations enable row level security;
alter table public.recipe_ingredient_translations enable row level security;

create policy recipe_translations_select on public.recipe_translations
  for select
  to anon, authenticated
  using (true);

create policy ingredient_translations_select on public.ingredient_translations
  for select
  to anon, authenticated
  using (true);

create policy tag_translations_select on public.tag_translations
  for select
  to anon, authenticated
  using (true);

create policy recipe_ingredient_translations_select on public.recipe_ingredient_translations
  for select
  to anon, authenticated
  using (true);

revoke insert, update, delete on public.recipe_translations from anon, authenticated;
revoke insert, update, delete on public.ingredient_translations from anon, authenticated;
revoke insert, update, delete on public.tag_translations from anon, authenticated;
revoke insert, update, delete on public.recipe_ingredient_translations from anon, authenticated;
