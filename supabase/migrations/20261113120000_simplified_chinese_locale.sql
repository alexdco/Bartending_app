-- Simplified Chinese (spec 0052 AC-4, AC-6, AC-18).
-- The existing locale config, foreign keys, and CJK contains search need no
-- function changes. Discovery remains gated by LAUNCHED_LOCALES.
-- Rollback: supabase/rollbacks/20261113120000_simplified_chinese_locale_down.sql.
begin;

insert into public.supported_locales (code, text_search_config)
values ('zh', 'simple')
on conflict (code) do nothing;

commit;

-- Check after apply: expect code zh and config simple.
-- select code, text_search_config from public.supported_locales where code = 'zh';
