-- Russian locale (spec 0047, AC-3, AC-4, AC-6).
--
-- Adds Russian (ru) as a supported locale, with no SQL function edits: the
-- name_search trigger and every read and search function already take the
-- language list and its text search config from supported_locales (spec 0045).
--
-- Russian uses the built in russian config. A live probe on 2026-11-10
-- (Postgres 17.6, en_US.UTF-8) showed it stems "ликёр" and "ликер" to the same
-- word, and pg_trgm builds case insensitive trigrams from Cyrillic, so search
-- needs nothing beyond this row. unaccent is deliberately not used: it would
-- fold й into и.
--
-- ru stays hidden from users until LAUNCHED_LOCALES gains it (spec 0047 AC-7).
-- Rollback: supabase/rollbacks/20261110120000_russian_locale_down.sql.
--
-- Check after apply (expect true, true):
--   select
--     to_tsvector('russian', 'Ликёр') @@ websearch_to_tsquery('russian', 'ликер') as yo_query,
--     to_tsvector('russian', 'Ликер') @@ websearch_to_tsquery('russian', 'ликёр') as yo_name;

begin;

insert into public.supported_locales (code, text_search_config)
values ('ru', 'russian');

commit;
