-- Sign in and cross device sync: per-user preferences (currently just theme),
-- synced across devices once a session is a real, linked identity.
-- Spec: docs/specs/0008-sign-in-and-cross-device-sync/index.md

create table public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  theme text not null default 'system'
    check (theme in ('light', 'dark', 'system')),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

create trigger user_preferences_set_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

create policy user_preferences_select on public.user_preferences
  for select
  using ((select auth.uid()) = user_id);

create policy user_preferences_insert on public.user_preferences
  for insert
  with check ((select auth.uid()) = user_id);

create policy user_preferences_update on public.user_preferences
  for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
