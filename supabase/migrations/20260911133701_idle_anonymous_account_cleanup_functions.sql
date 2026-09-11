-- Candidate selection and pre delete re-check for the idle anonymous account
-- cleanup job (spec 0017). Both are SECURITY DEFINER (auth.users is not
-- readable by anon/authenticated) and restricted to the service role, which
-- is the only caller: the cleanup-anonymous-accounts Edge Function, never
-- called through PostgREST.
--
-- Eligibility (shared by both functions): is_anonymous = true, email is null
-- (excludes an unconfirmed sign up per AC-2b, spec 0008), and idle more than
-- 30 days past the later of last_sign_in_at / created_at.
create or replace function public.select_idle_anonymous_accounts()
returns table (id uuid)
language sql
security definer
set search_path = ''
as $$
  select u.id
  from auth.users u
  where u.is_anonymous = true
    and u.email is null
    and coalesce(u.last_sign_in_at, u.created_at) < now() - interval '30 days'
  order by coalesce(u.last_sign_in_at, u.created_at) asc
  limit 500;
$$;

revoke execute on function public.select_idle_anonymous_accounts() from public, anon, authenticated;

create or replace function public.is_candidate_still_idle(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = p_user_id
      and u.is_anonymous = true
      and u.email is null
      and coalesce(u.last_sign_in_at, u.created_at) < now() - interval '30 days'
  );
$$;

revoke execute on function public.is_candidate_still_idle(uuid) from public, anon, authenticated;
