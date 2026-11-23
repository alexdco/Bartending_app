-- Spec 0064 (user submitted recipes), build plan task 5: the author lifecycle.
--
-- withdraw_recipe_submission (AC-6) and admin_reject_recipe_submission
-- (AC-13, AC-14). Edit and resubmit already runs through
-- save_recipe_submission (20261122120000_user_submitted_recipes.sql).
--
-- Both functions are security definer with search_path = '' and raise an
-- explicit code as their message (errcode P0001), mapped to a typed result in
-- packages/shared/src/submissions.
--
-- Applied by hand in the dashboard SQL editor. Rollback:
-- supabase/rollbacks/20261122130000_recipe_submissions_lifecycle_down.sql.
-- Checks: supabase/tests/recipe_submissions_lifecycle_check.sql.
-- Spec: docs/specs/0064-user-submitted-recipes/index.md

begin;

-- 1. withdraw_recipe_submission (AC-6) ----------------------------------------
-- Deletes a pending or rejected row the caller owns and returns its photo path
-- so the client can remove the files (the daily cleanup is the backstop).
-- Works while blocked (AC-18). Another user's id reads as not_found, so it
-- never reveals that the row exists; an approved row is not_editable.
create function public.withdraw_recipe_submission(p_id uuid)
returns table (photo_path text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  existing public.recipe_submissions%rowtype;
begin
  if uid is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = 'P0001', message = 'anonymous';
  end if;

  -- Same lock as save, so a withdraw and a save of the same author never
  -- interleave.
  perform pg_advisory_xact_lock(hashtext('recipe_submission:' || uid::text));

  select * into existing
  from public.recipe_submissions s
  where s.id = p_id
  for update;

  if not found or existing.author_id <> uid then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  if existing.status = 'approved' then
    raise exception using errcode = 'P0001', message = 'not_editable';
  end if;

  -- The usage row is left as is: withdrawing never lowers the day's count (AC-5).
  delete from public.recipe_submissions s where s.id = existing.id;

  return query select existing.photo_path;
end;
$$;

-- 2. admin_reject_recipe_submission (AC-13, AC-14) ----------------------------
create function public.admin_reject_recipe_submission(
  p_id uuid,
  p_reason text,
  p_expected_updated_at timestamptz
)
returns table (updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  sub public.recipe_submissions%rowtype;
  v_reason text;
begin
  if not public.is_current_user_admin() then
    raise exception using errcode = 'P0001', message = 'not_admin';
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, ''), E' \t\r\n'), '');
  if v_reason is null or char_length(v_reason) > 500 then
    raise exception using errcode = 'P0001', message = 'invalid_reason';
  end if;

  select * into sub
  from public.recipe_submissions s
  where s.id = p_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  -- AC-14: the author saved since the admin loaded it, or it is not pending.
  if sub.status <> 'pending' or sub.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'P0001', message = 'stale';
  end if;

  update public.recipe_submissions s
  set status = 'rejected',
      rejection_reason = v_reason,
      reviewed_at = clock_timestamp()
  where s.id = sub.id;

  return query
  select s.updated_at from public.recipe_submissions s where s.id = sub.id;
end;
$$;

-- 3. Grants -------------------------------------------------------------------
revoke all on function public.withdraw_recipe_submission(uuid) from public, anon;
grant execute on function public.withdraw_recipe_submission(uuid) to authenticated;

revoke all on function public.admin_reject_recipe_submission(uuid, text, timestamptz) from public, anon;
grant execute on function public.admin_reject_recipe_submission(uuid, text, timestamptz) to authenticated;

notify pgrst, 'reload schema';

commit;
