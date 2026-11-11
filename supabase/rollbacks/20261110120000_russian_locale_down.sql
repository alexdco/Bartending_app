-- Rollback for 20261110120000_russian_locale.sql (spec 0047).
-- Kept outside supabase/migrations so the CLI never applies it. Run by hand in
-- the SQL editor only for a full revert; Russian is unlaunched until build
-- step 6, so a bad step is normally fixed forward instead. Revert the TS
-- commit afterwards. The slugify change can stay: it only affects Cyrillic.

begin;

-- 1. Delete the ru translation rows and stored preferences.
delete from public.recipe_ingredient_translations where locale = 'ru';
delete from public.recipe_translations where locale = 'ru';
delete from public.ingredient_translations where locale = 'ru';
delete from public.tag_translations where locale = 'ru';
update public.user_preferences set locale = null where locale = 'ru';

-- 2. Remove the locale row.
delete from public.supported_locales where code = 'ru';

commit;
