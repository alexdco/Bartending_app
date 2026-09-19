-- createBar (packages/shared/src/bar.ts) inserts the bars row, then inserts
-- the owner's own bar_members row in a second call. bar_members had RLS
-- enabled but no insert policy at all, so that second call was always
-- denied (42501) -- a bar was created but its creator could never become a
-- member of it. accept_bar_invite (security definer) covers the staff join
-- path, but the owner's very first membership row has no such RPC and must
-- be insertable directly by the client.
--
-- Fix: allow a linked user to insert themselves as owner of a bar they
-- created, and only as owner -- inserting as staff, or on someone else's
-- bar, still requires the accept_bar_invite RPC.

create policy bar_members_insert_owner on public.bar_members
  for insert to authenticated
  with check (
    (select auth.jwt() ->> 'is_anonymous') = 'false'
    and user_id = (select auth.uid())
    and role = 'owner'
    and exists (
      select 1 from public.bars b
      where b.id = bar_members.bar_id and b.created_by = (select auth.uid())
    )
  );
