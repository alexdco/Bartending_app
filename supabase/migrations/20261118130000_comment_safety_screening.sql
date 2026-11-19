-- Comment safety, slice 1: photo screening (spec 0062, build plan task 1).
--
-- Every new comment photo starts `pending` and stays hidden from everyone but
-- its author and the admin until the screen-comment-photo Edge Function
-- (Claude Haiku) passes it. An after insert trigger starts the check through
-- pg_net; a 5 minute cron retries what the trigger missed and, before calling
-- the function, flags anything still pending an hour after upload, so a
-- broken key or an undeployed function still lands photos in the admin queue.
-- Photos that existed before this migration are backfilled `approved`.
--
-- Visibility lives in RLS through three security definer helpers, so older
-- mobile builds and the server rendered page respect it with no client change.
-- Slices 2 and 3 add the reporter and blocker clauses to the same helpers.
--
-- Deploy screen-comment-photo before applying this, so the first trigger call
-- has a target. The `secret_key` Vault secret (spec 0041) must hold the real
-- sb_secret key; with the placeholder, photos reach the queue only through
-- the 1 hour backstop.

-- Enums ---------------------------------------------------------------------

create type public.moderation_status as enum ('pending', 'approved', 'flagged');

create type public.moderation_flag_reason as enum ('screening', 'screening_failed', 'reports');

-- comments: status columns ---------------------------------------------------
--
-- A comment is only ever flagged by reports (slice 2). Existing rows get
-- `approved` from the default.

alter table public.comments
  add column moderation_status public.moderation_status not null default 'approved',
  add column flag_reason public.moderation_flag_reason,
  add column flagged_at timestamptz;

-- comment_photos: status and screening columns -------------------------------
--
-- Added with default `approved` so every existing photo stays visible, then
-- the default switches to `pending` so every new insert (post_comment,
-- edit_comment, both through insert_new_comment_photo) waits for screening.

alter table public.comment_photos
  add column moderation_status public.moderation_status not null default 'approved',
  add column flag_reason public.moderation_flag_reason,
  add column flag_categories text[]
    check (
      flag_categories is null
      or flag_categories <@ array[
        'nudity_sexual',
        'gore_violence',
        'hate_symbols',
        'illegal_drugs',
        'minor_with_alcohol',
        'personal_info'
      ]::text[]
    ),
  add column screening_attempts smallint not null default 0
    check (screening_attempts between 0 and 3),
  add column screened_at timestamptz,
  add column flagged_at timestamptz,
  add column screening_claimed_at timestamptz;

alter table public.comment_photos
  alter column moderation_status set default 'pending';

create index comment_photos_pending_created_at_idx
  on public.comment_photos (created_at)
  where moderation_status = 'pending';

-- Column level select grants (invariants 2a and 3) ---------------------------
--
-- An author can read their own flagged row, so a table wide select grant
-- would hand them flag_reason and flag_categories. Clients get every column
-- except the moderation internals; the admin reads those through the review
-- queue function (slice 2), which is security definer.

revoke select on public.comments from anon, authenticated;
grant select (id, user_id, recipe_id, body, created_at, updated_at, moderation_status)
  on public.comments to anon, authenticated;

revoke select on public.comment_photos from anon, authenticated;
grant select (
  id, comment_id, user_id, storage_path, position, width, height, alt_text, created_at,
  moderation_status
) on public.comment_photos to anon, authenticated;

-- Visibility helpers (invariants 1 and 2) -------------------------------------
--
-- Three stable, security definer helpers, none calling back into one that
-- calls it, so the policies never recurse:
--   comment_own_visible(comment)  the comment row alone
--   photo_own_visible(photo)      the photo row alone AND its comment
--   can_view_comment(comment)     comment_own_visible AND (text OR a visible photo)
-- The soft deleted recipe filter applies to everyone, the admin included,
-- as the spec 0027 select policy did.

create or replace function public.comment_own_visible(p_comment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.comments c
    join public.recipes r on r.id = c.recipe_id
    where c.id = p_comment_id
      and r.deleted_at is null
      and (
        c.moderation_status = 'approved'
        or c.user_id = (select auth.uid())
        or (select public.is_current_user_admin())
      )
  );
$$;

create or replace function public.photo_own_visible(p_photo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.comment_photos cp
    where cp.id = p_photo_id
      and (
        cp.moderation_status = 'approved'
        or cp.user_id = (select auth.uid())
        or (select public.is_current_user_admin())
      )
      and public.comment_own_visible(cp.comment_id)
  );
$$;

-- A photo only comment whose photos are all hidden from this viewer is not
-- shown at all, so no empty comment shell reaches them (AC-5).
create or replace function public.can_view_comment(p_comment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.comment_own_visible(p_comment_id)
    and exists (
      select 1
      from public.comments c
      where c.id = p_comment_id
        and (
          c.body is not null
          or exists (
            select 1
            from public.comment_photos cp
            where cp.comment_id = c.id
              and public.photo_own_visible(cp.id)
          )
        )
    );
$$;

revoke execute on function public.comment_own_visible(uuid) from public;
revoke execute on function public.photo_own_visible(uuid) from public;
revoke execute on function public.can_view_comment(uuid) from public;
-- Guests read comments too, so anon needs execute for the policies to run.
grant execute on function public.comment_own_visible(uuid) to anon, authenticated;
grant execute on function public.photo_own_visible(uuid) to anon, authenticated;
grant execute on function public.can_view_comment(uuid) to anon, authenticated;

drop policy comments_select on public.comments;

create policy comments_select on public.comments
  for select
  to anon, authenticated
  using (public.can_view_comment(id));

drop policy comment_photos_select on public.comment_photos;

create policy comment_photos_select on public.comment_photos
  for select
  to anon, authenticated
  using (public.photo_own_visible(id));

-- comment_with_photos_json: carry moderation_status (invariant 2a) ----------
--
-- Still revoked from clients and only used for the caller's own comment
-- (the post_comment / edit_comment return). Never returns flag_reason or
-- flag_categories. edit_comment itself needs no change: kept photos keep
-- their status (an alt text change never triggers a new check), new or
-- replaced photos are inserted and so start `pending`, and the comment's
-- own status is never touched.

create or replace function public.comment_with_photos_json(p_comment_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id,
    'user_id', c.user_id,
    'recipe_id', c.recipe_id,
    'body', c.body,
    'created_at', c.created_at,
    'updated_at', c.updated_at,
    'moderation_status', c.moderation_status,
    'photos', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', cp.id,
            'storage_path', cp.storage_path,
            'position', cp.position,
            'width', cp.width,
            'height', cp.height,
            'alt_text', cp.alt_text,
            'moderation_status', cp.moderation_status
          )
          order by cp.position
        )
        from public.comment_photos cp
        where cp.comment_id = c.id
      ),
      '[]'::jsonb
    )
  )
  from public.comments c
  where c.id = p_comment_id;
$$;

revoke execute on function public.comment_with_photos_json(uuid) from public, anon, authenticated;

-- photo_screening_usage: the 2000 a day cap (AC-4) ----------------------------

create table public.photo_screening_usage (
  day date primary key,
  calls integer not null default 0 check (calls >= 0)
);

alter table public.photo_screening_usage enable row level security;

-- No policies and no client grants: service role only.
revoke all on public.photo_screening_usage from anon, authenticated;

-- Screening functions (service role only, invariant 10) ----------------------

-- Takes one call from today's (UTC) budget. False once 2000 are used; the
-- caller then leaves the photo pending without counting a failed attempt.
create or replace function public.reserve_photo_screening()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reserved boolean;
begin
  insert into public.photo_screening_usage as u (day, calls)
  values ((now() at time zone 'utc')::date, 1)
  on conflict (day) do update
    set calls = u.calls + 1
    where u.calls < 2000
  returning true into v_reserved;

  return coalesce(v_reserved, false);
end;
$$;

-- Claims photos to screen, so the trigger call and the sweep never screen
-- the same photo at once (invariant 8). Trigger mode (p_photo_id set): that
-- one photo. Sweep mode: up to p_limit photos pending for more than 2
-- minutes, oldest first. Either way only rows still pending whose lease is
-- free or older than 3 minutes, locked with skip locked and stamped.
create or replace function public.claim_pending_comment_photos(
  p_photo_id uuid default null,
  p_limit integer default 10
)
returns table (id uuid, storage_path text)
language sql
security definer
set search_path = ''
as $$
  with claimable as (
    select cp.id
    from public.comment_photos cp
    where cp.moderation_status = 'pending'
      and (cp.screening_claimed_at is null or cp.screening_claimed_at < now() - interval '3 minutes')
      and (
        (p_photo_id is not null and cp.id = p_photo_id)
        or (p_photo_id is null and cp.created_at < now() - interval '2 minutes')
      )
    order by cp.created_at
    limit case when p_photo_id is not null then 1 else least(greatest(coalesce(p_limit, 10), 1), 50) end
    for update skip locked
  )
  update public.comment_photos cp
  set screening_claimed_at = now()
  from claimable
  where cp.id = claimable.id
  returning cp.id, cp.storage_path;
$$;

-- Records one verdict. Only touches a row still pending, so a late or
-- duplicate result after an admin clear is ignored (invariant 7). Returns
-- the new status, or null when the photo is gone or already decided.
--   approved  -> approved
--   flagged   -> flagged, reason screening, with the reported categories
--   failed    -> one more failed attempt; the 3rd flags it screening_failed,
--                otherwise it stays pending with its lease released
create or replace function public.record_photo_screening(
  p_photo_id uuid,
  p_outcome text,
  p_categories text[] default null
)
returns public.moderation_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.moderation_status;
begin
  if p_outcome = 'approved' then
    update public.comment_photos cp
    set moderation_status = 'approved',
        screened_at = now(),
        screening_claimed_at = null
    where cp.id = p_photo_id
      and cp.moderation_status = 'pending'
    returning cp.moderation_status into v_status;
  elsif p_outcome = 'flagged' then
    update public.comment_photos cp
    set moderation_status = 'flagged',
        flag_reason = 'screening',
        flag_categories = p_categories,
        flagged_at = now(),
        screened_at = now(),
        screening_claimed_at = null
    where cp.id = p_photo_id
      and cp.moderation_status = 'pending'
    returning cp.moderation_status into v_status;
  elsif p_outcome = 'failed' then
    update public.comment_photos cp
    set screening_attempts = least(cp.screening_attempts + 1, 3),
        moderation_status = case
          when cp.screening_attempts + 1 >= 3 then 'flagged'::public.moderation_status
          else 'pending'::public.moderation_status
        end,
        flag_reason = case
          when cp.screening_attempts + 1 >= 3 then 'screening_failed'::public.moderation_flag_reason
          else null
        end,
        flagged_at = case when cp.screening_attempts + 1 >= 3 then now() else null end,
        screening_claimed_at = null
    where cp.id = p_photo_id
      and cp.moderation_status = 'pending'
    returning cp.moderation_status into v_status;
  else
    raise exception 'invalid_input';
  end if;

  return v_status;
end;
$$;

-- The 1 hour backstop (invariant 8a): flags every photo still pending an
-- hour after upload as screening_failed. Run by the cron in SQL, before the
-- function call, so it works even when the function rejects the key.
create or replace function public.flag_stale_pending_photos()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.comment_photos cp
  set moderation_status = 'flagged',
      flag_reason = 'screening_failed',
      flagged_at = now(),
      screening_claimed_at = null
  where cp.moderation_status = 'pending'
    and cp.created_at < now() - interval '1 hour';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.reserve_photo_screening() from public, anon, authenticated;
revoke execute on function public.claim_pending_comment_photos(uuid, integer) from public, anon, authenticated;
revoke execute on function public.record_photo_screening(uuid, text, text[]) from public, anon, authenticated;
revoke execute on function public.flag_stale_pending_photos() from public, anon, authenticated;
grant execute on function public.reserve_photo_screening() to service_role;
grant execute on function public.claim_pending_comment_photos(uuid, integer) to service_role;
grant execute on function public.record_photo_screening(uuid, text, text[]) to service_role;
grant execute on function public.flag_stale_pending_photos() to service_role;

-- Screening trigger (invariant 11) -------------------------------------------
--
-- Starts the check for each new pending photo. net.http_post only queues the
-- request, and the queue row commits with the inserting transaction, so the
-- function never sees a photo that is not there yet. Any error (missing
-- secret, pg_net trouble) is swallowed so posting a comment never fails
-- because of screening; the cron picks those photos up.

select vault.create_secret('REPLACE_ME_VIA_DASHBOARD_SQL_EDITOR', 'secret_key')
where not exists (select 1 from vault.secrets where name = 'secret_key');

create or replace function public.request_comment_photo_screening()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform net.http_post(
      url := 'https://ctuzjhhpnkkhooneporu.supabase.co/functions/v1/screen-comment-photo',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'secret_key'
        )
      ),
      body := jsonb_build_object('photo_id', new.id),
      timeout_milliseconds := 5000
    );
  exception when others then
    raise warning 'request_comment_photo_screening: % (%)', sqlerrm, sqlstate;
  end;
  return null;
end;
$$;

revoke execute on function public.request_comment_photo_screening() from public, anon, authenticated;

create trigger comment_photos_request_screening
  after insert on public.comment_photos
  for each row
  when (new.moderation_status = 'pending')
  execute function public.request_comment_photo_screening();

-- Cron: every 5 minutes (AC-3) -----------------------------------------------
--
-- One statement: the backstop runs in SQL first, then its count rides along
-- in the request body so the function can send the Sentry warning. The
-- backstop still runs when the function is down or rejects the key.

select cron.schedule(
  'screen-comment-photos',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://ctuzjhhpnkkhooneporu.supabase.co/functions/v1/screen-comment-photo',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'secret_key'
      )
    ),
    body := jsonb_build_object('stale_flagged', public.flag_stale_pending_photos()),
    timeout_milliseconds := 5000
  );
  $$
);
