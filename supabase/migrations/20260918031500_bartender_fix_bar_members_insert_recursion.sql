-- bar_members_insert_owner's WITH CHECK queried public.bars directly to
-- confirm the caller created that bar. That subquery is itself subject to
-- bars' own RLS (bars_select), which -- since the prior migration -- reads
-- bar_members to check membership. Evaluating the bar_members insert policy
-- therefore re-entered bar_members' RLS by way of bars_select, raising the
-- same 42P17 infinite recursion this migration series keeps hitting.
--
-- Fix: check bar ownership through a SECURITY DEFINER helper (RLS bypassed
-- internally, like is_bar_member) instead of a direct, RLS-checked subquery
-- against bars.

create function public.is_bar_creator(p_bar_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.bars b
    where b.id = p_bar_id
      and b.created_by = auth.uid()
  );
$$;

revoke all on function public.is_bar_creator(uuid) from public;
grant execute on function public.is_bar_creator(uuid) to authenticated;

drop policy bar_members_insert_owner on public.bar_members;

create policy bar_members_insert_owner on public.bar_members
  for insert to authenticated
  with check (
    (select auth.jwt() ->> 'is_anonymous') = 'false'
    and user_id = (select auth.uid())
    and role = 'owner'
    and public.is_bar_creator(bar_members.bar_id)
  );
