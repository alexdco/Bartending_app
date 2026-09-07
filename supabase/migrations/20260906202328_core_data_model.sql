-- Core data model: recipes, ingredients, tags, pantry, favorites.
-- Spec: docs/specs/0002-data-model.md

create extension if not exists pg_trgm;

-- updated_at maintenance trigger, shared by recipes/ingredients/tags
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- recipes ------------------------------------------------------------------

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  instructions text not null,
  image_url text,
  region text,
  glass text,
  alcoholic_status text not null default 'unknown'
    check (alcoholic_status in ('alcoholic', 'non_alcoholic', 'optional', 'unknown')),
  source_id text not null unique,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recipes_region_idx on public.recipes (region) where region is not null;

create trigger recipes_set_updated_at
  before update on public.recipes
  for each row
  execute function public.set_updated_at();

-- ingredients ----------------------------------------------------------------

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text generated always as (
    lower(btrim(regexp_replace(name, '\s+', ' ', 'g')))
  ) stored,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ingredients_normalized_name_key unique (normalized_name)
);

create trigger ingredients_set_updated_at
  before update on public.ingredients
  for each row
  execute function public.set_updated_at();

-- tags -----------------------------------------------------------------------

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text generated always as (
    lower(btrim(regexp_replace(name, '\s+', ' ', 'g')))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tags_normalized_name_key unique (normalized_name)
);

create trigger tags_set_updated_at
  before update on public.tags
  for each row
  execute function public.set_updated_at();

-- recipe_ingredients (join) ---------------------------------------------------

create table public.recipe_ingredients (
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete restrict,
  measure text,
  sort_order int not null,
  primary key (recipe_id, ingredient_id)
);

create index recipe_ingredients_ingredient_id_idx on public.recipe_ingredients (ingredient_id);

-- recipe_tags (join) ----------------------------------------------------------

create table public.recipe_tags (
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete restrict,
  primary key (recipe_id, tag_id)
);

create index recipe_tags_tag_id_idx on public.recipe_tags (tag_id);

-- pantry_items -----------------------------------------------------------------

create table public.pantry_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (user_id, ingredient_id)
);

create index pantry_items_ingredient_id_idx on public.pantry_items (ingredient_id);

-- favorites ----------------------------------------------------------------------

create table public.favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

create index favorites_recipe_id_idx on public.favorites (recipe_id);

-- search indexes ---------------------------------------------------------------

alter table public.recipes
  add column name_search tsvector generated always as (to_tsvector('english', name)) stored;

create index recipes_name_search_idx on public.recipes using gin (name_search);

create index ingredients_name_trgm_idx on public.ingredients using gin (name gin_trgm_ops);

-- row level security -------------------------------------------------------------

alter table public.recipes enable row level security;
alter table public.ingredients enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.tags enable row level security;
alter table public.recipe_tags enable row level security;
alter table public.pantry_items enable row level security;
alter table public.favorites enable row level security;

-- catalog tables: public read, no client writes (import job uses the service role,
-- which bypasses RLS and grants entirely)

create policy recipes_select on public.recipes
  for select
  to anon, authenticated
  using (deleted_at is null);

create policy ingredients_select on public.ingredients
  for select
  to anon, authenticated
  using (true);

create policy recipe_ingredients_select on public.recipe_ingredients
  for select
  to anon, authenticated
  using (true);

create policy tags_select on public.tags
  for select
  to anon, authenticated
  using (true);

create policy recipe_tags_select on public.recipe_tags
  for select
  to anon, authenticated
  using (true);

revoke insert, update, delete on public.recipes from anon, authenticated;
revoke insert, update, delete on public.ingredients from anon, authenticated;
revoke insert, update, delete on public.recipe_ingredients from anon, authenticated;
revoke insert, update, delete on public.tags from anon, authenticated;
revoke insert, update, delete on public.recipe_tags from anon, authenticated;

-- pantry_items: owner scoped, no public read, no update policy (nothing to update;
-- an update-only-USING policy would let a caller reassign user_id to someone else's)

create policy pantry_items_select on public.pantry_items
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy pantry_items_insert on public.pantry_items
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy pantry_items_delete on public.pantry_items
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- favorites: owner scoped, no public read, no update policy

create policy favorites_select on public.favorites
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy favorites_insert on public.favorites
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy favorites_delete on public.favorites
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- import job -----------------------------------------------------------------
--
-- One call per run, run inside the caller's implicit statement transaction.
-- An advisory lock (held for the duration of the function, released at commit
-- or rollback) prevents two scheduled runs from overlapping. Only callable by
-- the service role (import job), never exposed to anon/authenticated.

create or replace function public.import_catalog(drinks jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  drink jsonb;
  ingredient jsonb;
  tag jsonb;
  recipe_row_id uuid;
  ingredient_row_id uuid;
  tag_row_id uuid;
  seen_source_ids text[] := array[]::text[];
begin
  -- Advisory lock scoped to this function call; blocks a concurrent run
  -- rather than racing it. Released automatically at transaction end.
  perform pg_advisory_xact_lock(hashtext('import_catalog'));

  for drink in select * from jsonb_array_elements(drinks)
  loop
    seen_source_ids := array_append(seen_source_ids, drink ->> 'sourceId');

    insert into public.recipes (
      source_id, name, instructions, image_url, glass, alcoholic_status, deleted_at
    )
    values (
      drink ->> 'sourceId',
      drink ->> 'name',
      drink ->> 'instructions',
      drink ->> 'imageUrl',
      drink ->> 'glass',
      drink ->> 'alcoholicStatus',
      null
    )
    on conflict (source_id) do update
    set name = excluded.name,
        instructions = excluded.instructions,
        image_url = excluded.image_url,
        glass = excluded.glass,
        alcoholic_status = excluded.alcoholic_status,
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

      insert into public.recipe_ingredients (recipe_id, ingredient_id, measure, sort_order)
      values (
        recipe_row_id,
        ingredient_row_id,
        ingredient ->> 'measure',
        (ingredient ->> 'sortOrder')::int
      );
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

  -- Reconciliation: only ever called by the import job after every recipe in
  -- the catalog was fetched successfully (never on a partial or failed run).
  -- Ingredients and tags are never deleted or marked deleted here.
  update public.recipes
  set deleted_at = now()
  where source_id <> all (seen_source_ids)
    and deleted_at is null;
end;
$$;

revoke execute on function public.import_catalog(jsonb) from public, anon, authenticated;
