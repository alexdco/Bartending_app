-- Rollback for 20261123120000_recipe_submissions_safety.sql (spec 0064 task 10).
--
-- user_preferences.submissions_blocked_at belongs to slice 1 and stays, so
-- any block already set keeps refusing saves until cleared by hand.
begin;

select cron.unschedule('cleanup-recipe-submissions')
where exists (select 1 from cron.job where jobname = 'cleanup-recipe-submissions');

drop function if exists public.delete_old_recipe_submission_usage(boolean);
drop function if exists public.list_orphan_recipe_submission_photos(integer);
drop function if exists public.delete_expired_rejected_recipe_submissions(integer, boolean);
drop function if exists public.admin_set_submission_block(uuid, boolean);

notify pgrst, 'reload schema';

commit;
