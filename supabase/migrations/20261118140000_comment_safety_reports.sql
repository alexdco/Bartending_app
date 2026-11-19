-- Comment safety, slice 2: reports (spec 0062, build plan task 4).
--
-- Signed in users report someone else's comment (whole comment) or one photo
-- through report_content, a security definer function: clients have no write
-- grant on content_reports at all (invariant 4). A report hides its target for
-- the reporter right away (the reporter clause in the visibility helpers),
-- and 3 open reports from accounts at least 24 hours old flag the target for
-- everyone but its author and the admin (AC-9).
--
-- Before delete triggers resolve open reports as `removed` when their target
-- goes away, so the history survives with the content author snapshot
-- (AC-12, invariant 12).

-- Enums ---------------------------------------------------------------------

create type public.report_reason as enum ('spam', 'offensive', 'sexual', 'off_topic', 'other');

create type public.report_target_kind as enum ('comment', 'photo');

create type public.report_resolution as enum ('cleared', 'removed');

-- content_reports -----------------------------------------------------------
--
-- comment_id is set for photo reports too (the photo's parent), so the admin
-- queue groups by comment. Both links null out when their row is deleted;
-- the delete triggers below resolve the report first.

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  target_kind public.report_target_kind not null,
  comment_id uuid references public.comments (id) on delete set null,
  photo_id uuid references public.comment_photos (id) on delete set null,
  content_author_id uuid references auth.users (id) on delete set null,
  reason public.report_reason not null,
  note text check (note is null or char_length(btrim(note)) between 1 and 500),
  counts_toward_hide boolean not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution public.report_resolution,
  resolved_by uuid references auth.users (id) on delete set null,
  check ((resolved_at is null) = (resolution is null))
);

-- "Once ever" per reporter and target (AC-7).
create unique index content_reports_once_per_comment_idx
  on public.content_reports (reporter_id, comment_id)
  where target_kind = 'comment' and comment_id is not null;

create unique index content_reports_once_per_photo_idx
  on public.content_reports (reporter_id, photo_id)
  where target_kind = 'photo' and photo_id is not null;

-- Open reports per target: the threshold count and the admin queue.
create index content_reports_open_comment_idx
  on public.content_reports (comment_id)
  where resolved_at is null;

create index content_reports_open_photo_idx
  on public.content_reports (photo_id)
  where resolved_at is null;

-- The 24 hour report limit, and the reporter clause in the visibility helpers.
create index content_reports_reporter_created_idx
  on public.content_reports (reporter_id, created_at);

create index content_reports_reporter_comment_idx
  on public.content_reports (reporter_id, comment_id);

-- Foreign key indexes for the set null / cascade paths.
create index content_reports_content_author_idx on public.content_reports (content_author_id);
create index content_reports_resolved_by_idx on public.content_reports (resolved_by);

alter table public.content_reports enable row level security;

-- Invariant 4: select own rows only, no client writes.
revoke all on public.content_reports from anon, authenticated;
grant select on public.content_reports to authenticated;

create policy content_reports_select_own on public.content_reports
  for select
  to authenticated
  using (reporter_id = (select auth.uid()));

-- Visibility helpers: add the reporter clause (invariant 1) -----------------
--
-- A viewer who reported a comment no longer sees it (or its photos, through
-- photo_own_visible's parent check); a viewer who reported a photo no longer
-- sees that photo. The admin ignores their own reports. can_view_comment is
-- unchanged: it already composes these two.

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
        (select public.is_current_user_admin())
        or (
          (c.moderation_status = 'approved' or c.user_id = (select auth.uid()))
          and not exists (
            select 1
            from public.content_reports cr
            where cr.reporter_id = (select auth.uid())
              and cr.comment_id = c.id
              and cr.target_kind = 'comment'
          )
        )
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
        (select public.is_current_user_admin())
        or (
          (cp.moderation_status = 'approved' or cp.user_id = (select auth.uid()))
          and not exists (
            select 1
            from public.content_reports cr
            where cr.reporter_id = (select auth.uid())
              and cr.photo_id = cp.id
              and cr.target_kind = 'photo'
          )
        )
      )
      and public.comment_own_visible(cp.comment_id)
  );
$$;

-- report_content ------------------------------------------------------------
--
-- Inputs are text, not the enum types, so a bad value raises invalid_input
-- instead of a cast error the client could not map. Errors are raised as the
-- bare code, in the spec's order: invalid_input, not_signed_in, not_found,
-- own_content, already_reported, report_limit.
--
-- Locks the comment row, then (photo report) the photo row, always in that
-- order, before counting (invariant 5): two simultaneous counting reports
-- flag once, and a comment report racing a photo report cannot deadlock.

create or replace function public.report_content(
  p_target_kind text,
  p_comment_id uuid,
  p_photo_id uuid default null,
  p_reason text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_is_admin boolean;
  v_kind public.report_target_kind;
  v_reason public.report_reason;
  v_note text := case when p_note is null then null else btrim(p_note) end;
  v_comment record;
  v_photo record;
  v_author uuid;
  v_counts boolean;
  v_report_id uuid;
  v_open integer;
  v_became_hidden boolean := false;
begin
  -- invalid_input
  if p_target_kind is null or p_target_kind not in ('comment', 'photo')
    or p_reason is null or p_reason not in ('spam', 'offensive', 'sexual', 'off_topic', 'other')
    or p_comment_id is null
    or (p_target_kind = 'photo' and p_photo_id is null)
    or (p_target_kind = 'comment' and p_photo_id is not null)
    or (v_note is not null and char_length(v_note) not between 1 and 500)
  then
    raise exception 'invalid_input';
  end if;

  v_kind := p_target_kind::public.report_target_kind;
  v_reason := p_reason::public.report_reason;

  -- not_signed_in
  if v_user_id is null or coalesce((select auth.jwt() ->> 'is_anonymous'), 'true') <> 'false' then
    raise exception 'not_signed_in';
  end if;

  v_is_admin := public.is_current_user_admin();

  -- not_found: the comment (and photo) must exist and be visible to the
  -- caller, ignoring only their own report hide (so a repeat report says
  -- already_reported, not not_found).
  select c.id, c.user_id, c.moderation_status
  into v_comment
  from public.comments c
  join public.recipes r on r.id = c.recipe_id
  where c.id = p_comment_id
    and r.deleted_at is null
  for update of c;

  if not found
    or not (v_is_admin or v_comment.moderation_status = 'approved' or v_comment.user_id = v_user_id)
  then
    raise exception 'not_found';
  end if;

  if v_kind = 'photo' then
    select cp.id, cp.user_id, cp.moderation_status
    into v_photo
    from public.comment_photos cp
    where cp.id = p_photo_id
      and cp.comment_id = p_comment_id
    for update;

    if not found
      or not (v_is_admin or v_photo.moderation_status = 'approved' or v_photo.user_id = v_user_id)
    then
      raise exception 'not_found';
    end if;

    v_author := v_photo.user_id;
  else
    v_author := v_comment.user_id;
  end if;

  -- own_content
  if v_author = v_user_id then
    raise exception 'own_content';
  end if;

  -- already_reported (the unique indexes back this up below)
  if exists (
    select 1
    from public.content_reports cr
    where cr.reporter_id = v_user_id
      and cr.target_kind = v_kind
      and (
        (v_kind = 'comment' and cr.comment_id = p_comment_id)
        or (v_kind = 'photo' and cr.photo_id = p_photo_id)
      )
  ) then
    raise exception 'already_reported';
  end if;

  -- report_limit: 20 in any rolling 24 hours
  if (
    select count(*)
    from public.content_reports cr
    where cr.reporter_id = v_user_id
      and cr.created_at > now() - interval '24 hours'
  ) >= 20 then
    raise exception 'report_limit';
  end if;

  select u.created_at <= now() - interval '24 hours'
  into v_counts
  from auth.users u
  where u.id = v_user_id;

  begin
    insert into public.content_reports (
      reporter_id, target_kind, comment_id, photo_id, content_author_id, reason, note, counts_toward_hide
    )
    values (
      v_user_id, v_kind, p_comment_id, p_photo_id, v_author, v_reason, v_note, coalesce(v_counts, false)
    )
    returning id into v_report_id;
  exception when unique_violation then
    raise exception 'already_reported';
  end;

  -- The threshold: 3 open counting reports on this target (invariant 6). A
  -- target already flagged (or a photo still pending) is left as it is.
  if v_kind = 'comment' then
    if v_comment.moderation_status = 'approved' then
      select count(*) into v_open
      from public.content_reports cr
      where cr.comment_id = p_comment_id
        and cr.target_kind = 'comment'
        and cr.resolved_at is null
        and cr.counts_toward_hide;

      if v_open >= 3 then
        update public.comments
        set moderation_status = 'flagged', flag_reason = 'reports', flagged_at = now()
        where id = p_comment_id;
        v_became_hidden := true;
      end if;
    end if;
  else
    if v_photo.moderation_status = 'approved' then
      select count(*) into v_open
      from public.content_reports cr
      where cr.photo_id = p_photo_id
        and cr.target_kind = 'photo'
        and cr.resolved_at is null
        and cr.counts_toward_hide;

      if v_open >= 3 then
        update public.comment_photos
        set moderation_status = 'flagged', flag_reason = 'reports', flag_categories = null, flagged_at = now()
        where id = p_photo_id;
        v_became_hidden := true;
      end if;
    end if;
  end if;

  return jsonb_build_object('report_id', v_report_id, 'became_hidden', v_became_hidden);
end;
$$;

revoke execute on function public.report_content(text, uuid, uuid, text, text) from public, anon;
grant execute on function public.report_content(text, uuid, uuid, text, text) to authenticated;

-- Before delete triggers: resolve open reports as removed (invariant 12) ----
--
-- Before delete, so the links are still set when the reports are resolved
-- (the foreign keys null them only after). The comment trigger covers both
-- comment and photo reports by comment_id, so the photo cascade finds
-- nothing left open. resolved_by is the admin's id only when the admin
-- deletes; null for the author, the service role, or a cascade.

create or replace function public.resolve_reports_on_comment_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.content_reports
  set resolved_at = now(),
      resolution = 'removed',
      resolved_by = case when public.is_current_user_admin() then (select auth.uid()) else null end
  where comment_id = old.id
    and resolved_at is null;
  return old;
end;
$$;

create or replace function public.resolve_reports_on_photo_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.content_reports
  set resolved_at = now(),
      resolution = 'removed',
      resolved_by = case when public.is_current_user_admin() then (select auth.uid()) else null end
  where photo_id = old.id
    and resolved_at is null;
  return old;
end;
$$;

revoke execute on function public.resolve_reports_on_comment_delete() from public, anon, authenticated;
revoke execute on function public.resolve_reports_on_photo_delete() from public, anon, authenticated;

create trigger comments_resolve_reports
  before delete on public.comments
  for each row
  execute function public.resolve_reports_on_comment_delete();

create trigger comment_photos_resolve_reports
  before delete on public.comment_photos
  for each row
  execute function public.resolve_reports_on_photo_delete();
