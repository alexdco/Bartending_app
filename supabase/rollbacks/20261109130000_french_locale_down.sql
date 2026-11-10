-- Rollback for 20261109130000_french_locale.sql (spec 0046).
-- Kept outside supabase/migrations so the CLI never applies it. Run by hand in
-- the SQL editor only for a full revert; French is unlaunched until build
-- step 6, so a bad step is normally fixed forward instead. Revert the TS
-- commit afterwards.

begin;

-- 1. Delete the fr translation rows and stored preferences.
delete from public.recipe_ingredient_translations where locale = 'fr';
delete from public.recipe_translations where locale = 'fr';
delete from public.ingredient_translations where locale = 'fr';
delete from public.tag_translations where locale = 'fr';
update public.user_preferences set locale = null where locale = 'fr';

-- 2. Remove the locale row.
delete from public.supported_locales where code = 'fr';

-- 3. Drop the config before the extension it depends on.
drop text search configuration public.french_unaccent;

-- 4. Drop the extension, which fails (and rolls back) if anything else uses it.
drop extension unaccent;

commit;
