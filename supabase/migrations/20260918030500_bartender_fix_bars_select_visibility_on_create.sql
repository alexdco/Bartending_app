-- createBar (packages/shared/src/bar.ts) does two writes in sequence: insert
-- the bars row, then insert the owner's bar_members row. PostgREST's
-- return=representation on that first insert immediately re-reads the new
-- row through bars_select, which only allowed a row visible via an existing
-- bar_members membership -- a row that does not exist yet at that point.
-- Every bar creation therefore failed with 42501 on the insert's own
-- .select(), even though the row itself was written successfully.
--
-- Fix: bars_select also allows the row's own creator to see it, so the
-- creator can read back the bar it just made before the follow up
-- bar_members insert lands.

drop policy bars_select on public.bars;

create policy bars_select on public.bars
  for select to authenticated
  using (
    (select auth.jwt() ->> 'is_anonymous') = 'false'
    and (
      created_by = (select auth.uid())
      or exists (
        select 1 from public.bar_members bm
        where bm.bar_id = bars.id and bm.user_id = (select auth.uid())
      )
    )
  );
