-- Rollback for 20261111140000_japanese_locale.sql (spec 0050).
-- Kept outside supabase/migrations so the CLI never applies it. Run by hand in
-- the SQL editor only for a full revert; Japanese is unlaunched until build
-- step 6, so a bad step is normally fixed forward instead. Revert the TS
-- commit afterwards.

begin;

-- 1. Delete the ja translation rows and stored preferences.
delete from public.recipe_ingredient_translations where locale = 'ja';
delete from public.recipe_translations where locale = 'ja';
delete from public.ingredient_translations where locale = 'ja';
delete from public.tag_translations where locale = 'ja';
update public.user_preferences set locale = null where locale = 'ja';

-- 2. Remove the locale row.
delete from public.supported_locales where code = 'ja';

commit;
