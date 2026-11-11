-- Hindi locale (spec 0048, AC-3, AC-4, AC-6).
--
-- Adds Hindi (hi) as a supported locale, with no SQL function edits: the
-- name_search trigger and every read and search function already take the
-- language list and its text search config from supported_locales (spec 0045).
--
-- Hindi uses the built in hindi config. A live probe on 2026-11-11
-- (Postgres 17.6, en_US.UTF-8) showed it stems inflected forms together
-- (a search for santara finds santare), and pg_trgm keeps a Devanagari word
-- whole, so search needs nothing beyond this row. Spelling variants (vowel
-- length, nukta, nasal marks) are feature 77.
--
-- hi stays hidden from users until LAUNCHED_LOCALES gains it (spec 0048 AC-7).
-- Rollback: supabase/rollbacks/20261111120000_hindi_locale_down.sql.
--
-- Check after apply (expect true):
--   select to_tsvector('hindi', 'संतरे') @@ websearch_to_tsquery('hindi', 'संतरा') as inflected;

begin;

insert into public.supported_locales (code, text_search_config)
values ('hi', 'hindi');

commit;
