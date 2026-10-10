-- Admin privilege escalation fix (scope feature 35) ----------------------
--
-- 20260930190000 limited UPDATE on user_preferences by column, but INSERT
-- stayed table wide, so any session (anonymous included) could insert its
-- own row with is_admin = true and pass every admin policy. is_admin is
-- set by hand in the SQL editor only; no client role may write it.

-- Column limited INSERT: exactly the columns the apps upsert
-- (packages/shared/src/preferences.ts). updated_at and is_admin fall back
-- to their defaults.
revoke insert on public.user_preferences from anon, authenticated;
grant insert (user_id, theme, display_name, bartender_mode_enabled, locale)
  on public.user_preferences to authenticated;

-- anon never owns a row (RLS needs auth.uid()), so it needs no write grant.
revoke update on public.user_preferences from anon;

-- Guard trigger: defense in depth if a later grant widens again. Security
-- invoker, so current_user is the calling client role; the SQL editor and
-- security definer functions run as their owner and pass through.
create function public.user_preferences_guard_is_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated')
    and (
      (tg_op = 'INSERT' and new.is_admin)
      or (tg_op = 'UPDATE' and new.is_admin is distinct from old.is_admin)
    )
  then
    raise exception 'is_admin cannot be set by a client'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.user_preferences_guard_is_admin() from public, anon, authenticated;

create trigger user_preferences_guard_is_admin
  before insert or update on public.user_preferences
  for each row execute function public.user_preferences_guard_is_admin();
