-- Korean locale (spec 0051, AC-4, AC-6, AC-18).
--
-- Adds Korean (ko) as a supported locale, with no SQL function edits: the
-- name_search trigger and every read and search function already take the
-- language list and its text search config from supported_locales (spec 0045).
--
-- Postgres has no Korean stemmer, so ko uses the built in simple config,
-- which splits names at the spaces between Korean words. Unspaced and partial
-- queries reuse the locale agnostic CJK contains tier from spec 0050, whose
-- has_cjk already covers Hangul. A live probe on 2026-11-12 found 토닉 inside
-- 진토닉 through that tier.
--
-- ko stays hidden from users until LAUNCHED_LOCALES gains it (spec 0051 AC-7).
-- Rollback: supabase/rollbacks/20261112120000_korean_locale_down.sql.
--
-- Check after apply (expect one row, then '진':1 '토닉':2):
--   select code, text_search_config from public.supported_locales where code = 'ko';
--   select to_tsvector(text_search_config::regconfig, '진 토닉')
--   from public.supported_locales where code = 'ko';

begin;

insert into public.supported_locales (code, text_search_config)
values ('ko', 'simple');

commit;
