-- Signed in preference writes fail with 42501 (found by spec 0045 verify, AC-15).
--
-- packages/shared/src/preferences.ts writes every preference with an upsert
-- on user_id. PostgREST runs it as INSERT ... ON CONFLICT (user_id) DO UPDATE
-- SET user_id = EXCLUDED.user_id, <column> = EXCLUDED.<column>, and Postgres
-- needs UPDATE on every column in that SET. 20260930190000 limited UPDATE to
-- the four preference columns, leaving out user_id, so every theme, display
-- name, locale, and bartender mode write has been denied since.
--
-- Granting UPDATE on user_id is safe: the user_preferences_update policy's
-- USING and WITH CHECK both require auth.uid() = user_id, so a caller can only
-- rewrite its own row's id to its own id. is_admin stays ungranted and
-- guarded by user_preferences_guard_is_admin.

grant update (user_id) on public.user_preferences to authenticated;
