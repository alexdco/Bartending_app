-- Spec 0064 (user submitted recipes), migration slice 4: safety and lifecycle
-- (build plan task 10, AC-18, AC-19).
--
-- 1. admin_set_submission_block turns "Block from submitting" on or off for a
--    submission's author. save_recipe_submission already refuses a blocked
--    author (`blocked`, slice 1), and withdraw still works while blocked.
-- 2. Three service role helpers for the daily cleanup-recipe-submissions
--    Edge Function: expired rejected rows (reviewed over 90 days ago), orphan
--    files in recipe-submission-photos (over 24 hours old, no pending or
--    rejected row points to them, which covers approved rows' originals and
--    abandoned uploads), and usage rows older than 7 days.
-- 3. The daily cron at 03:30 UTC, sending the `secret_key` Vault secret on
--    the apikey header (seeded by 20261122150000_recipe_submission_screening.sql).
--
-- Account deletion needs nothing here: recipe_submissions and
-- recipe_submission_usage cascade from auth.users, and recipes.submitted_by is
-- set null (slice 1). The delete-account Edge Function empties the user's
-- photo folder (AC-17).
--
-- Applied by hand in the dashboard SQL editor. Rollback:
-- supabase/rollbacks/20261123120000_recipe_submissions_safety_down.sql.
-- Checks: supabase/tests/recipe_submissions_safety_check.sql.
-- Spec: docs/specs/0064-user-submitted-recipes/index.md

begin;

-- 1. admin_set_submission_block (AC-18) --------------------------------------
--
-- Keyed by a submission id because the review screen has one, not an author
-- id. Turning it on keeps an existing timestamp, so it records when the block
-- first started. The author's pending rows stay in the queue.
create function public.admin_set_submission_block(p_submission_id uuid, p_blocked boolean)
returns table (blocked boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_author uuid;
  v_blocked_at timestamptz;
begin
  if not public.is_current_user_admin() then
    raise exception using errcode = 'P0001', message = 'not_admin';
  end if;

  select s.author_id into v_author
  from public.recipe_submissions s
  where s.id = p_submission_id;

  if v_author is null then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  insert into public.user_preferences as up (user_id, submissions_blocked_at)
  values (v_author, case when p_blocked then now() end)
  on conflict (user_id) do update
    set submissions_blocked_at = case
      when p_blocked then coalesce(up.submissions_blocked_at, now())
    end
  returning up.submissions_blocked_at into v_blocked_at;

  return query select v_blocked_at is not null;
end;
$$;

revoke execute on function public.admin_set_submission_block(uuid, boolean) from public, anon;
grant execute on function public.admin_set_submission_block(uuid, boolean) to authenticated;

-- 2. Cleanup helpers (AC-19), service role only -------------------------------

-- Rejected rows reviewed more than 90 days ago, oldest first. With
-- p_dry_run they are only listed. The caller removes the returned photo
-- files; if that fails the orphan sweep below takes them the next day.
create function public.delete_expired_rejected_recipe_submissions(
  p_limit integer,
  p_dry_run boolean default false
)
returns table (id uuid, photo_path text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_dry_run then
    return query
      select s.id, s.photo_path
      from public.recipe_submissions s
      where s.status = 'rejected'
        and s.reviewed_at < now() - interval '90 days'
      order by s.reviewed_at
      limit greatest(p_limit, 0);
    return;
  end if;

  return query
    delete from public.recipe_submissions s
    where s.id in (
      select e.id
      from public.recipe_submissions e
      where e.status = 'rejected'
        and e.reviewed_at < now() - interval '90 days'
      order by e.reviewed_at
      limit greatest(p_limit, 0)
      for update skip locked
    )
    returning s.id, s.photo_path;
end;
$$;

-- Files older than 24 hours that no pending or rejected submission points
-- to, oldest first. The 24 hour grace keeps an upload whose save is still in
-- progress safe. An approved row's originals count as orphans: approval has
-- already copied them into recipe-images.
create function public.list_orphan_recipe_submission_photos(p_limit integer)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(name order by created_at), '{}')
  from (
    select o.name, o.created_at
    from storage.objects o
    where o.bucket_id = 'recipe-submission-photos'
      and o.created_at < now() - interval '24 hours'
      and not exists (
        select 1
        from public.recipe_submissions s
        where s.status in ('pending', 'rejected')
          and s.photo_path = regexp_replace(o.name, '-(hero|card)\.webp$', '')
      )
    order by o.created_at
    limit greatest(p_limit, 0)
  ) orphans;
$$;

-- Usage rows for UTC days more than 7 days back. Returns how many went (or
-- would go, with p_dry_run).
create function public.delete_old_recipe_submission_usage(p_dry_run boolean default false)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff date := (now() at time zone 'utc')::date - 7;
  v_count integer;
begin
  if p_dry_run then
    select count(*) into v_count
    from public.recipe_submission_usage u
    where u.day < v_cutoff;
    return v_count;
  end if;

  delete from public.recipe_submission_usage u
  where u.day < v_cutoff;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.delete_expired_rejected_recipe_submissions(integer, boolean) from public, anon, authenticated;
revoke execute on function public.list_orphan_recipe_submission_photos(integer) from public, anon, authenticated;
revoke execute on function public.delete_old_recipe_submission_usage(boolean) from public, anon, authenticated;
grant execute on function public.delete_expired_rejected_recipe_submissions(integer, boolean) to service_role;
grant execute on function public.list_orphan_recipe_submission_photos(integer) to service_role;
grant execute on function public.delete_old_recipe_submission_usage(boolean) to service_role;

-- 3. Daily cron at 03:30 UTC (AC-19) ------------------------------------------

select cron.schedule(
  'cleanup-recipe-submissions',
  '30 3 * * *',
  $$
  select net.http_post(
    url := 'https://ctuzjhhpnkkhooneporu.supabase.co/functions/v1/cleanup-recipe-submissions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'secret_key'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
  $$
);

notify pgrst, 'reload schema';

commit;
