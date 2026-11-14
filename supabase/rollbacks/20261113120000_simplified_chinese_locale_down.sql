-- Full revert of spec 0052. Run manually, never as a forward migration.
begin;

delete from public.recipe_ingredient_translations where locale = 'zh';
delete from public.recipe_translations where locale = 'zh';
delete from public.ingredient_translations where locale = 'zh';
delete from public.tag_translations where locale = 'zh';
update public.user_preferences set locale = null where locale = 'zh';
delete from public.supported_locales where code = 'zh';

commit;
