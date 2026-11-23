-- Spec 0064 (user submitted recipes), migration slice 3: screening (build
-- plan task 8, AC-9, AC-15).
--
-- Each time a submission enters pending, the screen-recipe-submission Edge
-- Function (Claude Haiku) checks its text and photo in one call and records
-- `clear`, `flagged`, or `error` with a short admin only note. Screening is
-- advisory: nothing here ever changes `status` (invariant 5).
--
-- An after insert trigger and an after update trigger (only when a save
-- resets submitted_at, invariant 9) start the check through pg_net; a 5
-- minute cron retries anything still unscreened. A lease plus skip locked
-- keeps the two from screening the same row at once. Each verdict is tied to
-- the submitted_at the claim returned, so a result for an older version is
-- discarded. After 3 failed attempts the result is `error`. Past the daily
-- ceiling (300 by default, passed in by the function) a submission is
-- `skipped` and still reaches the queue.
--
-- Deploy screen-recipe-submission before applying this, so the first trigger
-- call has a target. The `secret_key` Vault secret (spec 0041/0062) must hold
-- the real sb_secret key.
--
-- Applied by hand in the dashboard SQL editor. Rollback:
-- supabase/rollbacks/20261122150000_recipe_submission_screening_down.sql.
-- Checks: supabase/tests/recipe_submission_screening_check.sql.

-- 1. recipe_screening_daily_total (AC-9 global ceiling) -----------------------

create table public.recipe_screening_daily_total (
  day date primary key,
  count integer not null default 0 check (count >= 0)
);

alter table public.recipe_screening_daily_total enable row level security;

-- No policies and no client grants: service role only.
revoke all on public.recipe_screening_daily_total from anon, authenticated;

-- 2. Screening functions (service role only) ---------------------------------

-- Takes one check from today's (UTC) budget. False once p_cap are used.
create function public.reserve_recipe_screening(p_cap integer default 300)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reserved boolean;
  v_cap integer := greatest(coalesce(p_cap, 300), 0);
begin
  if v_cap = 0 then
    return false;
  end if;

  insert into public.recipe_screening_daily_total as t (day, count)
  values ((now() at time zone 'utc')::date, 1)
  on conflict (day) do update
    set count = t.count + 1
    where t.count < v_cap
  returning true into v_reserved;

  return coalesce(v_reserved, false);
end;
$$;

-- Claims submissions to screen. Trigger mode (p_submission_id set): that one
-- row. Sweep mode: up to p_limit rows unscreened for more than 2 minutes,
-- oldest first (the trigger normally gets there first). Either way only rows
-- still pending review and screening whose lease is free or older than 3
-- minutes, locked with skip locked and stamped. Returns the fields the model
-- reads plus the submitted_at the verdict must match.
create function public.claim_pending_recipe_submissions(
  p_submission_id uuid default null,
  p_limit integer default 10
)
returns table (
  id uuid,
  submitted_at timestamptz,
  name text,
  instructions text,
  ingredients jsonb,
  glass text,
  alcoholic_status text,
  note text,
  photo_path text
)
language sql
security definer
set search_path = ''
as $$
  with claimable as (
    select s.id
    from public.recipe_submissions s
    where s.status = 'pending'
      and s.text_screening = 'pending'
      and (s.screening_claimed_at is null or s.screening_claimed_at < now() - interval '3 minutes')
      and (
        (p_submission_id is not null and s.id = p_submission_id)
        or (p_submission_id is null and s.submitted_at < now() - interval '2 minutes')
      )
    order by s.submitted_at
    limit case
      when p_submission_id is not null then 1
      else least(greatest(coalesce(p_limit, 10), 1), 50)
    end
    for update skip locked
  )
  update public.recipe_submissions s
  set screening_claimed_at = now()
  from claimable
  where s.id = claimable.id
  returning s.id, s.submitted_at, s.name, s.instructions, s.ingredients, s.glass,
            s.alcoholic_status, s.note, s.photo_path;
$$;

-- Records one result for the version that was claimed. Does nothing (returns
-- null) when the row is gone, no longer pending, already screened, or was
-- saved again since the claim (its submitted_at moved), so a late result
-- never lands on a newer version. Returns the new text_screening otherwise.
--   screened  -> text (and photo, when there is one) set to clear or flagged
--   failed    -> one more attempt; the 3rd sets both to error, otherwise the
--                row stays pending with its lease released
--   skipped   -> both skipped (daily ceiling reached)
-- Never touches status (invariant 5).
create function public.record_recipe_submission_screening(
  p_submission_id uuid,
  p_submitted_at timestamptz,
  p_outcome text,
  p_text_screening text default null,
  p_photo_screening text default null,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 300);
  v_result text;
begin
  if p_outcome = 'screened' then
    if p_text_screening is null or p_text_screening not in ('clear', 'flagged') then
      raise exception using errcode = 'P0001', message = 'invalid_input';
    end if;
    if p_photo_screening is not null and p_photo_screening not in ('clear', 'flagged') then
      raise exception using errcode = 'P0001', message = 'invalid_input';
    end if;

    update public.recipe_submissions s
    set text_screening = p_text_screening,
        -- A row with a photo needs a photo result; a missing one counts as error.
        photo_screening = case
          when s.photo_path is null then null
          else coalesce(p_photo_screening, 'error')
        end,
        screening_note = v_note,
        screening_claimed_at = null
    where s.id = p_submission_id
      and s.submitted_at = p_submitted_at
      and s.status = 'pending'
      and s.text_screening = 'pending'
    returning s.text_screening into v_result;
  elsif p_outcome = 'failed' then
    update public.recipe_submissions s
    set screening_attempts = least(s.screening_attempts + 1, 3),
        text_screening = case when s.screening_attempts + 1 >= 3 then 'error' else 'pending' end,
        photo_screening = case
          when s.photo_path is null then null
          when s.screening_attempts + 1 >= 3 then 'error'
          else 'pending'
        end,
        screening_note = case when s.screening_attempts + 1 >= 3 then v_note else s.screening_note end,
        screening_claimed_at = null
    where s.id = p_submission_id
      and s.submitted_at = p_submitted_at
      and s.status = 'pending'
      and s.text_screening = 'pending'
    returning s.text_screening into v_result;
  elsif p_outcome = 'skipped' then
    update public.recipe_submissions s
    set text_screening = 'skipped',
        photo_screening = case when s.photo_path is null then null else 'skipped' end,
        screening_note = null,
        screening_claimed_at = null
    where s.id = p_submission_id
      and s.submitted_at = p_submitted_at
      and s.status = 'pending'
      and s.text_screening = 'pending'
    returning s.text_screening into v_result;
  else
    raise exception using errcode = 'P0001', message = 'invalid_input';
  end if;

  return v_result;
end;
$$;

revoke execute on function public.reserve_recipe_screening(integer) from public, anon, authenticated;
revoke execute on function public.claim_pending_recipe_submissions(uuid, integer) from public, anon, authenticated;
revoke execute on function public.record_recipe_submission_screening(uuid, timestamptz, text, text, text, text) from public, anon, authenticated;
grant execute on function public.reserve_recipe_screening(integer) to service_role;
grant execute on function public.claim_pending_recipe_submissions(uuid, integer) to service_role;
grant execute on function public.record_recipe_submission_screening(uuid, timestamptz, text, text, text, text) to service_role;

-- 3. Screening triggers (invariant 9) ----------------------------------------
--
-- net.http_post only queues the request, and the queue row commits with the
-- saving transaction, so the function never sees a version that is not there
-- yet. Any error (missing secret, pg_net trouble) is swallowed so a save
-- never fails because of screening; the cron picks those rows up.
--
-- Postgres can't read OLD in the WHEN of an insert or update trigger, so the
-- insert and the update path are two triggers on one function. Screening
-- writes never change submitted_at, so they never fire it again.

select vault.create_secret('REPLACE_ME_VIA_DASHBOARD_SQL_EDITOR', 'secret_key')
where not exists (select 1 from vault.secrets where name = 'secret_key');

create function public.request_recipe_submission_screening()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform net.http_post(
      url := 'https://ctuzjhhpnkkhooneporu.supabase.co/functions/v1/screen-recipe-submission',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'secret_key'
        )
      ),
      body := jsonb_build_object('submission_id', new.id),
      timeout_milliseconds := 5000
    );
  exception when others then
    raise warning 'request_recipe_submission_screening: % (%)', sqlerrm, sqlstate;
  end;
  return null;
end;
$$;

revoke execute on function public.request_recipe_submission_screening() from public, anon, authenticated;

create trigger recipe_submissions_request_screening_insert
  after insert on public.recipe_submissions
  for each row
  when (new.status = 'pending')
  execute function public.request_recipe_submission_screening();

create trigger recipe_submissions_request_screening_update
  after update on public.recipe_submissions
  for each row
  when (new.status = 'pending' and new.submitted_at is distinct from old.submitted_at)
  execute function public.request_recipe_submission_screening();

-- 4. Cron: every 5 minutes (AC-9) --------------------------------------------

select cron.schedule(
  'screen-recipe-submissions',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://ctuzjhhpnkkhooneporu.supabase.co/functions/v1/screen-recipe-submission',
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
