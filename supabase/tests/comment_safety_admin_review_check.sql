-- Hand run database checks for spec 0062 (comment safety), build task 6.
-- Paste into the Supabase SQL editor after applying
-- 20261119120000_comment_safety_admin_review.sql.
--
-- Runs inside begin ... rollback; the DO block always ends by raising an
-- exception whose message IS the report (a PASS/FAIL line per check).
-- Uses the first real admin account as the caller; nothing it does persists.
-- Spec: docs/specs/0062-comment-safety/index.md

begin;

do $check$
declare
  v_admin uuid;
  v_author uuid := gen_random_uuid();
  v_r1 uuid := gen_random_uuid();
  v_r2 uuid := gen_random_uuid();
  v_r3 uuid := gen_random_uuid();
  v_recipe uuid;
  v_reported uuid;   -- one open comment report, still visible (group 1)
  v_flagged uuid;    -- photo flagged by screening (group 0)
  v_photo uuid;
  v_q jsonb;
  v_count_before integer;
  v_count integer;
  v_ok boolean;
  v_err text;
  v_report text := '';
begin
  select up.user_id into v_admin from public.user_preferences up where up.is_admin limit 1;
  select r.id into v_recipe from public.recipes r where r.deleted_at is null limit 1;

  insert into auth.users (id, aud, role, email, created_at, is_anonymous)
  select id, 'authenticated', 'authenticated', 'qz-adm-' || id || '@example.test', now() - interval '2 days', false
  from unnest(array[v_author, v_r1, v_r2, v_r3]) as id;

  -- Count before our fixtures, as the admin
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  execute 'set local role authenticated';
  v_count_before := public.admin_review_count();
  execute 'reset role';

  insert into public.comments (user_id, recipe_id, body)
  values (v_author, v_recipe, 'qz admin review reported') returning id into v_reported;
  insert into public.content_reports (reporter_id, target_kind, comment_id, content_author_id, reason, note, counts_toward_hide)
  values (v_r1, 'comment', v_reported, v_author, 'spam', 'qz note', true);

  insert into public.comments (user_id, recipe_id, body)
  values (v_author, v_recipe, 'qz admin review flagged photo') returning id into v_flagged;
  insert into public.comment_photos (comment_id, user_id, storage_path, position, width, height,
    moderation_status, flag_reason, flag_categories, flagged_at)
  values (v_flagged, v_author, v_author || '/' || gen_random_uuid() || '.jpg', 0, 100, 100,
    'flagged', 'screening', array['gore_violence'], now())
  returning id into v_photo;

  -- 1. Non admins are refused (AC-11)
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_r1, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  execute 'set local role authenticated';
  begin
    perform public.admin_review_count();
    v_err := 'ok';
  exception when others then
    v_err := sqlerrm;
  end;
  execute 'reset role';
  v_report := v_report || format(E'\n%s non admin gets not_admin (%s) AC-11',
    case when v_err = 'not_admin' then 'PASS' else 'FAIL' end, v_err);

  -- As the admin from here on
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  execute 'set local role authenticated';

  -- 2. The count grows by our 2 comments (AC-11)
  v_count := public.admin_review_count();
  v_report := v_report || format(E'\n%s badge count grows by 2 (%s -> %s) AC-11',
    case when v_count = v_count_before + 2 then 'PASS' else 'FAIL' end, v_count_before, v_count);

  -- 3. The flagged photo row sorts before the reported only row, with its
  --    categories; the reported row carries counts and notes (AC-11)
  v_q := public.admin_review_queue(null, null, null, 50);
  v_ok := (
      select min(ord) filter (where elem -> 'comment' ->> 'id' = v_flagged::text)
        < min(ord) filter (where elem -> 'comment' ->> 'id' = v_reported::text)
      from jsonb_array_elements(v_q -> 'rows') with ordinality as x(elem, ord)
    )
    and exists (
      select 1 from jsonb_array_elements(v_q -> 'rows') e
      where e -> 'comment' ->> 'id' = v_flagged::text
        and e -> 'targets' -> 0 ->> 'flag_reason' = 'screening'
        and e -> 'targets' -> 0 -> 'flag_categories' ? 'gore_violence'
    )
    and exists (
      select 1 from jsonb_array_elements(v_q -> 'rows') e
      where e -> 'comment' ->> 'id' = v_reported::text
        and (e -> 'targets' -> 0 -> 'open_report_counts' ->> 'spam')::int = 1
        and e -> 'targets' -> 0 -> 'notes' ? 'qz note'
    );
  v_report := v_report || format(E'\n%s hidden rows first, categories, counts, notes present AC-11',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 4. Paging with limit 1 walks the same order (AC-11)
  v_q := public.admin_review_queue(null, null, null, 1);
  v_ok := jsonb_array_length(v_q -> 'rows') = 1
    and (v_count = 1 or v_q -> 'next_cursor' is not null and v_q ->> 'next_cursor' <> 'null');
  if v_ok and v_count > 1 then
    v_q := public.admin_review_queue(
      (v_q -> 'next_cursor' ->> 'review_group')::smallint,
      (v_q -> 'next_cursor' ->> 'sort_at')::timestamptz,
      (v_q -> 'next_cursor' ->> 'id')::uuid,
      1
    );
    v_ok := jsonb_array_length(v_q -> 'rows') = 1;
  end if;
  v_report := v_report || format(E'\n%s keyset paging returns one row per page AC-11',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 5. Clear the photo: approved, leaves the queue (AC-12)
  v_q := public.admin_clear_moderation('photo', v_flagged, v_photo);
  v_ok := (select moderation_status from public.comment_photos where id = v_photo) = 'approved'
    and public.admin_review_count() = v_count_before + 1;
  v_report := v_report || format(E'\n%s Clear approves the photo and drops the row AC-12',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 6. Clear the comment: its report is resolved as cleared (AC-12)
  v_q := public.admin_clear_moderation('comment', v_reported, null);
  execute 'reset role';
  v_ok := (v_q ->> 'cleared_reports')::int = 1
    and exists (
      select 1 from public.content_reports
      where comment_id = v_reported and resolution = 'cleared' and resolved_by = v_admin
    );
  v_report := v_report || format(E'\n%s Clear resolves the open report as cleared by the admin AC-12',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 7. After Clear, a single new counting report does not hide; three do (AC-12)
  insert into public.content_reports (reporter_id, target_kind, comment_id, content_author_id, reason, counts_toward_hide)
  values (v_r2, 'comment', v_reported, v_author, 'spam', true);
  v_ok := (select count(*) from public.content_reports
           where comment_id = v_reported and resolved_at is null and counts_toward_hide) = 1;
  v_report := v_report || format(E'\n%s cleared reports no longer count toward 3 AC-12',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 8. Admin delete marks the report removed with the admin as resolver (AC-12)
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  execute 'set local role authenticated';
  delete from public.comments where id = v_reported;
  execute 'reset role';
  v_ok := exists (
    select 1 from public.content_reports
    where reporter_id = v_r2 and resolution = 'removed' and resolved_by = v_admin and comment_id is null
  );
  v_report := v_report || format(E'\n%s admin Remove resolves reports as removed by the admin AC-12',
    case when v_ok then 'PASS' else 'FAIL' end);

  raise exception E'comment safety admin review check report (rolled back):%', v_report;
end;
$check$;

rollback;
