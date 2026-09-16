-- recipe_aliases is catalog/reference data (like recipes, ingredients):
-- publicly readable, writes restricted to service role import/backfill jobs
-- only. Missed enabling RLS in the original migration; the security
-- advisor caught it (rls_disabled_in_public, ERROR level).

alter table public.recipe_aliases enable row level security;

create policy recipe_aliases_select on public.recipe_aliases
  for select to anon, authenticated
  using (true);

revoke insert, update, delete on public.recipe_aliases from anon, authenticated;
