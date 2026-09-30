-- comments ------------------------------------------------------------------
--
-- One row per comment, not one per (user_id, recipe_id) like ratings/
-- favorites: a user can post more than one comment on the same recipe over
-- time. Read is public (anon + authenticated); write follows the
-- bar_members/ratings non anonymous gate. Both the select and the write
-- policies exclude a soft deleted recipe's comments so the guarantee lives
-- in RLS itself, not only in one read path's query shape.

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index comments_recipe_id_created_at_id_idx
  on public.comments (recipe_id, created_at desc, id desc);

-- Bumps updated_at only when body actually changes, so an unrelated future
-- column update never falsely triggers the "(edited)" marker.
create or replace function public.set_comments_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.body is distinct from old.body then
    new.updated_at = now();
  end if;
  return new;
end;
$$;

create trigger comments_set_updated_at
  before update on public.comments
  for each row
  execute function public.set_comments_updated_at();

alter table public.comments enable row level security;

create policy comments_select on public.comments
  for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.recipes r
      where r.id = comments.recipe_id
        and r.deleted_at is null
    )
  );

create policy comments_insert on public.comments
  for insert
  to authenticated
  with check (
    (select auth.jwt() ->> 'is_anonymous') = 'false'
    and (select auth.uid()) = user_id
    and exists (
      select 1 from public.recipes r
      where r.id = recipe_id
        and r.deleted_at is null
    )
  );

create policy comments_update on public.comments
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.recipes r
      where r.id = recipe_id
        and r.deleted_at is null
    )
  );

create policy comments_delete on public.comments
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Column level grant: an owner can only ever PATCH body, never repoint
-- recipe_id or user_id via the update policy above.
revoke update on public.comments from authenticated;
grant update (body) on public.comments to authenticated;

-- user_display_names --------------------------------------------------------
--
-- A narrow, publicly readable projection of user_preferences (user_id,
-- display_name only) so any viewer, guest or signed in, can see a comment's
-- author name. user_preferences's own owner scoped RLS is untouched; this
-- view is a separate, narrower object sitting alongside it.

create view public.user_display_names
with (security_invoker = true) as
select user_id, display_name
from public.user_preferences;

grant select on public.user_display_names to anon, authenticated;
