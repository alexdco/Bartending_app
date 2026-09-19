-- is_bar_member was marked STABLE, which lets Postgres cache its result (and
-- the snapshot it reads under) for the duration of a single SQL statement.
-- That made RETURNING on the owner's own bar_members insert see a pre-insert
-- snapshot when bar_members_select re-checked visibility for the returned
-- row within that same INSERT statement, denying it with 42501 even though
-- a separate, later statement in the same transaction confirmed the row was
-- correctly visible. Marking it VOLATILE forces a fresh evaluation for the
-- RETURNING check instead of reusing a stale snapshot.

alter function public.is_bar_member(uuid, text) volatile;
