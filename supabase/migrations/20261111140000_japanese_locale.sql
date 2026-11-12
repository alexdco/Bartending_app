-- Japanese locale (spec 0050, AC-5, AC-7, AC-19).
--
-- Adds Japanese (ja) as a supported locale, with no SQL function edits: the
-- name_search trigger and every read and search function already take the
-- language list and its text search config from supported_locales (spec 0045).
--
-- Postgres has no Japanese stemmer, so ja uses the built in simple config. A
-- live probe on 2026-11-11 (Postgres 17.6, en_US.UTF-8) showed simple splits
-- names at the middle dot, so a whole word query finds the name. Short and
-- unspaced queries are the CJK contains tier, a separate locale agnostic
-- migration (spec 0050 build step 2).
--
-- ja stays hidden from users until LAUNCHED_LOCALES gains it (spec 0050 AC-8).
-- Rollback: supabase/rollbacks/20261111140000_japanese_locale_down.sql.
--
-- Check after apply (expect one row, then 'ジン':1 'トニック':2):
--   select code, text_search_config from public.supported_locales where code = 'ja';
--   select to_tsvector(text_search_config::regconfig, 'ジン・トニック')
--   from public.supported_locales where code = 'ja';

begin;

insert into public.supported_locales (code, text_search_config)
values ('ja', 'simple');

commit;
