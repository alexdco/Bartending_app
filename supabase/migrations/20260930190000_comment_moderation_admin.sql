-- is_admin --------------------------------------------------------------
--
-- A single boolean flag on user_preferences marking the site's one admin
-- account. Set manually via SQL after this migration lands; never through
-- the normal preferences update path, so it is excluded from the existing
-- update grant to authenticated the same way comments.body is isolated
-- from the rest of that row.

alter table public.user_preferences
  add column is_admin boolean not null default false;

revoke update on public.user_preferences from authenticated;
grant update (theme, display_name, bartender_mode_enabled, locale) on public.user_preferences
  to authenticated;

-- comments delete policy: owner OR admin --------------------------------
--
-- Widens the existing owner only delete policy with an additional
-- allowance for a caller whose own user_preferences.is_admin is true, so
-- an admin can remove any comment. Postgres ORs multiple permissive
-- policies together, but a single policy with an OR predicate was
-- preferred here for readability (spec 0028's Rationale).

drop policy comments_delete on public.comments;

create policy comments_delete on public.comments
  for delete
  to authenticated
  using (
    (select auth.uid()) = user_id
    or exists (
      select 1 from public.user_preferences up
      where up.user_id = (select auth.uid())
        and up.is_admin
    )
  );
