-- Rollback for 20261122130000_recipe_submissions_lifecycle.sql (spec 0064 task 5).
begin;

drop function if exists public.admin_reject_recipe_submission(uuid, text, timestamptz);
drop function if exists public.withdraw_recipe_submission(uuid);

notify pgrst, 'reload schema';

commit;
