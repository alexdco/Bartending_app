-- Comment safety, slice 3: admin review (spec 0062, build plan task 6).
--
-- The "Needs review" tab on /admin/comments reads admin_review_queue: one row
-- per comment that needs attention (the comment or any of its photos is
-- flagged, or has open reports), anything hidden first, then rows with only
-- open reports, oldest first within each group (AC-11). admin_review_count
-- feeds the nav badge. admin_clear_moderation is Clear: it approves one
-- target and resolves its open reports as `cleared` (AC-12). Remove reuses the
-- existing delete paths; the slice 2 delete triggers resolve reports there.
--
-- All three are security definer and check is_current_user_admin() first.

-- The comments that need attention, with their queue group and sort key.
-- Shared by the queue and the count so the badge always matches the list.
create or replace function public.admin_review_candidates()
returns table (comment_id uuid, review_group smallint, sort_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with flagged_photos as (
    select cp.comment_id, min(cp.flagged_at) as first_flagged_at
    from public.comment_photos cp
    where cp.moderation_status = 'flagged'
    group by cp.comment_id
  ),
  open_reports as (
    select cr.comment_id, min(cr.created_at) as first_report_at
    from public.content_reports cr
    where cr.resolved_at is null
      and cr.comment_id is not null
    group by cr.comment_id
  )
  select
    c.id,
    case
      when c.moderation_status = 'flagged' or fp.comment_id is not null then 0::smallint
      else 1::smallint
    end,
    case
      when c.moderation_status = 'flagged' or fp.comment_id is not null then
        coalesce(
          least(
            case when c.moderation_status = 'flagged' then c.flagged_at end,
            fp.first_flagged_at
          ),
          c.created_at
        )
      else orp.first_report_at
    end
  from public.comments c
  join public.recipes r on r.id = c.recipe_id
  left join flagged_photos fp on fp.comment_id = c.id
  left join open_reports orp on orp.comment_id = c.id
  where r.deleted_at is null
    and (c.moderation_status = 'flagged' or fp.comment_id is not null or orp.comment_id is not null);
$$;

revoke execute on function public.admin_review_candidates() from public, anon, authenticated;

-- One target's review summary: status, why it is hidden, open report counts
-- per reason, and the report notes.
create or replace function public.admin_review_target_json(
  p_kind public.report_target_kind,
  p_comment_id uuid,
  p_photo_id uuid,
  p_status public.moderation_status,
  p_flag_reason public.moderation_flag_reason,
  p_flag_categories text[]
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'target_kind', p_kind,
    'photo_id', p_photo_id,
    'moderation_status', p_status,
    'flag_reason', p_flag_reason,
    'flag_categories', coalesce(to_jsonb(p_flag_categories), '[]'::jsonb),
    'open_report_counts', coalesce(
      (
        select jsonb_object_agg(counts.reason, counts.n)
        from (
          select cr.reason, count(*) as n
          from public.content_reports cr
          where cr.resolved_at is null
            and cr.target_kind = p_kind
            and (
              (p_kind = 'comment' and cr.comment_id = p_comment_id)
              or (p_kind = 'photo' and cr.photo_id = p_photo_id)
            )
          group by cr.reason
        ) counts
      ),
      '{}'::jsonb
    ),
    'notes', coalesce(
      (
        select jsonb_agg(cr.note order by cr.created_at)
        from public.content_reports cr
        where cr.resolved_at is null
          and cr.note is not null
          and cr.target_kind = p_kind
          and (
            (p_kind = 'comment' and cr.comment_id = p_comment_id)
            or (p_kind = 'photo' and cr.photo_id = p_photo_id)
          )
      ),
      '[]'::jsonb
    )
  );
$$;

revoke execute on function public.admin_review_target_json(
  public.report_target_kind, uuid, uuid, public.moderation_status, public.moderation_flag_reason, text[]
) from public, anon, authenticated;

-- admin_review_queue ---------------------------------------------------------
--
-- Keyset pagination on (review_group, sort_at, id): pass all three cursor
-- values from the previous page's next_cursor, or none for the first page.

create or replace function public.admin_review_queue(
  p_cursor_group smallint default null,
  p_cursor_sort_at timestamptz default null,
  p_cursor_id uuid default null,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
  v_count integer;
begin
  if not public.is_current_user_admin() then
    raise exception 'not_admin';
  end if;

  if p_limit is null or p_limit not between 1 and 50
    or not (
      (p_cursor_group is null and p_cursor_sort_at is null and p_cursor_id is null)
      or (p_cursor_group is not null and p_cursor_sort_at is not null and p_cursor_id is not null)
    )
  then
    raise exception 'invalid_input';
  end if;

  with page as (
    select q.comment_id, q.review_group, q.sort_at
    from public.admin_review_candidates() q
    where p_cursor_group is null
      or (q.review_group, q.sort_at, q.comment_id) > (p_cursor_group, p_cursor_sort_at, p_cursor_id)
    order by q.review_group, q.sort_at, q.comment_id
    limit p_limit + 1
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'review_group', page.review_group,
          'sort_at', page.sort_at,
          'recipe_name', r.name,
          'author_name', dn.display_name,
          'comment', jsonb_build_object(
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
          ),
          'targets', (
            select coalesce(jsonb_agg(t.target order by t.ord), '[]'::jsonb)
            from (
              select -1 as ord,
                public.admin_review_target_json(
                  'comment', c.id, null, c.moderation_status, c.flag_reason, null
                ) as target
              where c.moderation_status = 'flagged'
                or exists (
                  select 1 from public.content_reports cr
                  where cr.comment_id = c.id and cr.target_kind = 'comment' and cr.resolved_at is null
                )
              union all
              select cp.position,
                public.admin_review_target_json(
                  'photo', c.id, cp.id, cp.moderation_status, cp.flag_reason, cp.flag_categories
                )
              from public.comment_photos cp
              where cp.comment_id = c.id
                and (
                  cp.moderation_status = 'flagged'
                  or exists (
                    select 1 from public.content_reports cr
                    where cr.photo_id = cp.id and cr.target_kind = 'photo' and cr.resolved_at is null
                  )
                )
            ) t
          )
        )
        order by page.review_group, page.sort_at, page.comment_id
      ),
      '[]'::jsonb
    ),
    count(*)
  into v_rows, v_count
  from page
  join public.comments c on c.id = page.comment_id
  join public.recipes r on r.id = c.recipe_id
  left join public.user_display_names dn on dn.user_id = c.user_id;

  if v_count > p_limit then
    v_rows := v_rows - p_limit;
    return jsonb_build_object(
      'rows', v_rows,
      'next_cursor', jsonb_build_object(
        'review_group', v_rows -> (p_limit - 1) -> 'review_group',
        'sort_at', v_rows -> (p_limit - 1) -> 'sort_at',
        'id', v_rows -> (p_limit - 1) -> 'comment' -> 'id'
      )
    );
  end if;

  return jsonb_build_object('rows', v_rows, 'next_cursor', null);
end;
$$;

revoke execute on function public.admin_review_queue(smallint, timestamptz, uuid, integer) from public, anon;
grant execute on function public.admin_review_queue(smallint, timestamptz, uuid, integer) to authenticated;

-- admin_review_count ---------------------------------------------------------

create or replace function public.admin_review_count()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_current_user_admin() then
    raise exception 'not_admin';
  end if;

  return (select count(*)::integer from public.admin_review_candidates());
end;
$$;

revoke execute on function public.admin_review_count() from public, anon;
grant execute on function public.admin_review_count() to authenticated;

-- admin_clear_moderation -----------------------------------------------------
--
-- Approves one target only and resolves its open reports as `cleared`, so
-- later reports start a fresh count toward 3 (AC-12, invariant 6). Clearing a
-- photo still pending also publishes it (invariant 7: the admin is the one
-- other way out of pending).

create or replace function public.admin_clear_moderation(
  p_target_kind text,
  p_comment_id uuid,
  p_photo_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
  v_cleared integer;
begin
  if not public.is_current_user_admin() then
    raise exception 'not_admin';
  end if;

  if p_target_kind = 'comment' and p_photo_id is null and p_comment_id is not null then
    update public.comments
    set moderation_status = 'approved', flag_reason = null, flagged_at = null
    where id = p_comment_id;

    if not found then
      raise exception 'not_found';
    end if;

    update public.content_reports
    set resolved_at = now(), resolution = 'cleared', resolved_by = v_admin
    where comment_id = p_comment_id
      and target_kind = 'comment'
      and resolved_at is null;
  elsif p_target_kind = 'photo' and p_photo_id is not null and p_comment_id is not null then
    update public.comment_photos
    set moderation_status = 'approved',
        flag_reason = null,
        flag_categories = null,
        flagged_at = null,
        screening_claimed_at = null
    where id = p_photo_id
      and comment_id = p_comment_id;

    if not found then
      raise exception 'not_found';
    end if;

    update public.content_reports
    set resolved_at = now(), resolution = 'cleared', resolved_by = v_admin
    where photo_id = p_photo_id
      and target_kind = 'photo'
      and resolved_at is null;
  else
    raise exception 'invalid_input';
  end if;

  get diagnostics v_cleared = row_count;
  return jsonb_build_object('cleared_reports', v_cleared);
end;
$$;

revoke execute on function public.admin_clear_moderation(text, uuid, uuid) from public, anon;
grant execute on function public.admin_clear_moderation(text, uuid, uuid) to authenticated;
