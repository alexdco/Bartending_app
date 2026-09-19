-- bar_members_select and bar_members_delete both queried bar_members from
-- within their own policy on bar_members ("is there a row in bar_members
-- for this user in this bar?"), which forces Postgres to re-evaluate
-- bar_members' RLS while it is already evaluating bar_members' RLS,
-- raising 42P17 "infinite recursion detected in policy". This broke every
-- read of bar_members (fetchMyBars) and, transitively, creating a bar: the
-- client's insert into bars succeeds, but PostgREST's return=representation
-- select re-checks bars_select, which itself queries bar_members and hits
-- the same recursion.
--
-- Fix: a SECURITY DEFINER helper that checks membership with RLS bypassed
-- (it is never exposed to PostgREST directly, only used inside other
-- policies), so a bar_members policy no longer re-enters bar_members' RLS.

create function public.is_bar_member(p_bar_id uuid, p_required_role text default null)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.bar_members bm
    where bm.bar_id = p_bar_id
      and bm.user_id = auth.uid()
      and (p_required_role is null or bm.role = p_required_role)
  );
$$;

revoke all on function public.is_bar_member(uuid, text) from public;
grant execute on function public.is_bar_member(uuid, text) to authenticated;

drop policy bar_members_select on public.bar_members;

create policy bar_members_select on public.bar_members
  for select to authenticated
  using (
    (select auth.jwt() ->> 'is_anonymous') = 'false'
    and public.is_bar_member(bar_members.bar_id)
  );

drop policy bar_members_delete on public.bar_members;

create policy bar_members_delete on public.bar_members
  for delete to authenticated
  using (
    (select auth.jwt() ->> 'is_anonymous') = 'false'
    and (
      user_id = (select auth.uid())
      or public.is_bar_member(bar_members.bar_id, 'owner')
    )
  );
