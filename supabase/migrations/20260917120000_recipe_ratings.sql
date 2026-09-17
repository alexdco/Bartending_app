-- ratings ------------------------------------------------------------------
--
-- One row per (user_id, recipe_id): a 1 to 5 star explicit rating, upserted
-- to overwrite on change. Only a non anonymous session may write (matching
-- the bar_members/bars non anonymous gate); select is owner scoped so a
-- client can pre fill its own star picker.

create table public.ratings (
  user_id uuid not null references auth.users (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  score smallint not null check (score between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

create index ratings_recipe_id_idx on public.ratings (recipe_id);

create trigger ratings_set_updated_at
  before update on public.ratings
  for each row
  execute function public.set_updated_at();

alter table public.ratings enable row level security;

create policy ratings_select on public.ratings
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy ratings_insert on public.ratings
  for insert
  to authenticated
  with check (
    (select auth.jwt() ->> 'is_anonymous') = 'false'
    and (select auth.uid()) = user_id
  );

create policy ratings_update on public.ratings
  for update
  to authenticated
  using (
    (select auth.jwt() ->> 'is_anonymous') = 'false'
    and (select auth.uid()) = user_id
  )
  with check (
    (select auth.jwt() ->> 'is_anonymous') = 'false'
    and (select auth.uid()) = user_id
  );
