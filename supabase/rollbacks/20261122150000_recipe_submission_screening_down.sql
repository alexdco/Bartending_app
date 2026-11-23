-- Rollback for 20261122150000_recipe_submission_screening.sql (spec 0064 task 8).
--
-- Screening columns on recipe_submissions belong to slice 1 and stay. Rows
-- keep whatever screening result they had; new ones stay `pending`.
begin;

select cron.unschedule('screen-recipe-submissions')
where exists (select 1 from cron.job where jobname = 'screen-recipe-submissions');

drop trigger if exists recipe_submissions_request_screening_insert on public.recipe_submissions;
drop trigger if exists recipe_submissions_request_screening_update on public.recipe_submissions;
drop function if exists public.request_recipe_submission_screening();

drop function if exists public.record_recipe_submission_screening(uuid, timestamptz, text, text, text, text);
drop function if exists public.claim_pending_recipe_submissions(uuid, integer);
drop function if exists public.reserve_recipe_screening(integer);

drop table if exists public.recipe_screening_daily_total;

notify pgrst, 'reload schema';

commit;
