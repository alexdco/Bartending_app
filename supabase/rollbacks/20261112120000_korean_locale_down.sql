-- Rollback for 20261112120000_korean_locale.sql (spec 0051).
-- Kept outside supabase/migrations so the CLI never applies it. Run by hand in
-- the SQL editor only for a full revert; Korean is unlaunched until build
-- step 5, so a bad step is normally fixed forward instead. Revert the TS
-- commit afterwards.

begin;

-- 1. Delete the ko translation rows and stored preferences.
delete from public.recipe_ingredient_translations where locale = 'ko';
delete from public.recipe_translations where locale = 'ko';
delete from public.ingredient_translations where locale = 'ko';
delete from public.tag_translations where locale = 'ko';
update public.user_preferences set locale = null where locale = 'ko';

-- 2. Remove the locale row.
delete from public.supported_locales where code = 'ko';

commit;
