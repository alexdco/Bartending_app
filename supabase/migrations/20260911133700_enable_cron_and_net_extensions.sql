-- Enables pg_cron (scheduled jobs) and pg_net (HTTP calls from Postgres),
-- needed by the idle anonymous account cleanup job (spec 0017).
-- Both extensions live outside public per this project's search_path hardening
-- convention (see the pg_trgm move in 20260907000343_harden_search_path_and_extension_schema.sql).
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
