-- Comment safety, slice 4: blocks (spec 0062, build plan task 7).
--
-- A signed in user blocks another comment author; the blocked person's
-- comments (and so their photos) disappear for the blocker everywhere comments
-- show, through the same RLS visibility helpers (AC-14). One way and silent:
-- the blocked person sees nothing change. Plain RLS on user_blocks, no
-- function: the client inserts and deletes its own rows (AC-15).

create table public.user_blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index user_blocks_blocked_idx on public.user_blocks (blocked_id);

alter table public.user_blocks enable row level security;

revoke all on public.user_blocks from anon, authenticated;
grant select, delete on public.user_blocks to authenticated;
grant insert (blocked_id) on public.user_blocks to authenticated;

-- blocker_id defaults to the caller, so the client only sends blocked_id and
-- the policy still checks it.
alter table public.user_blocks alter column blocker_id set default auth.uid();

create policy user_blocks_select_own on public.user_blocks
  for select
  to authenticated
  using (blocker_id = (select auth.uid()));

create policy user_blocks_insert_own on public.user_blocks
  for insert
  to authenticated
  with check (
    blocker_id = (select auth.uid())
    and (select auth.jwt() ->> 'is_anonymous') = 'false'
  );

create policy user_blocks_delete_own on public.user_blocks
  for delete
  to authenticated
  using (blocker_id = (select auth.uid()));

-- Visibility helpers: add the blocker clause (invariant 1) -------------------
--
-- The admin ignores their own blocks. A blocked author's photos hide with
-- their comment through photo_own_visible's parent check.

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
          and not exists (
            select 1
            from public.user_blocks ub
            where ub.blocker_id = (select auth.uid())
              and ub.blocked_id = c.user_id
          )
        )
      )
  );
$$;

-- report_content: blocked content is not_found (invariant 13) ---------------
--
-- Same function as slice 2 with one more not_found condition: the caller
-- blocked the comment's author.

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

  if v_user_id is null or coalesce((select auth.jwt() ->> 'is_anonymous'), 'true') <> 'false' then
    raise exception 'not_signed_in';
  end if;

  v_is_admin := public.is_current_user_admin();

  select c.id, c.user_id, c.moderation_status
  into v_comment
  from public.comments c
  join public.recipes r on r.id = c.recipe_id
  where c.id = p_comment_id
    and r.deleted_at is null
  for update of c;

  if not found
    or not (v_is_admin or v_comment.moderation_status = 'approved' or v_comment.user_id = v_user_id)
    or (
      not v_is_admin
      and exists (
        select 1 from public.user_blocks ub
        where ub.blocker_id = v_user_id and ub.blocked_id = v_comment.user_id
      )
    )
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

  if v_author = v_user_id then
    raise exception 'own_content';
  end if;

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
