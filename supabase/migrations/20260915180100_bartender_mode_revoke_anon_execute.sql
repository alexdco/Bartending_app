-- The prior migration's "revoke all ... from public" did not strip anon's
-- own execute grant (Postgres grants EXECUTE to PUBLIC by default at
-- function creation time, and anon inherited it before the revoke ran).
-- These three functions must never be callable by anon: they either require
-- a linked account (accept_bar_invite, toggle_86_status, fetch_bar_service_data
-- all check auth.jwt() internally) or bar membership, both meaningless for
-- an anonymous caller. Revoke explicitly from anon as well as public.

revoke execute on function public.accept_bar_invite(uuid) from anon;
revoke execute on function public.fetch_bar_service_data(uuid) from anon;
revoke execute on function public.toggle_86_status(uuid, uuid, boolean) from anon;
