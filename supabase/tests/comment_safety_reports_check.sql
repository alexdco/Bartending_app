-- Hand run database checks for spec 0062 (comment safety), build task 4.
-- Paste into the Supabase SQL editor after applying
-- 20261118140000_comment_safety_reports.sql.
--
-- Runs inside begin ... rollback. The DO block always ends by raising an
-- exception, so every test user, comment, photo, and report is rolled back.
-- The exception message IS the report: a PASS/FAIL line per check.
-- Spec: docs/specs/0062-comment-safety/index.md

begin;

-- Calls report_content as the given user and returns 'ok:<became_hidden>' or
-- the raised error code. pg_temp, so it disappears with the session.
create function pg_temp.report_as(
  p_user uuid,
  p_kind text,
  p_comment uuid,
  p_photo uuid,
  p_reason text default 'spam',
  p_note text default null
) returns text
language plpgsql
as $fn$
declare
  v_result jsonb;
  v_out text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  execute 'set local role authenticated';
  begin
    v_result := public.report_content(p_kind, p_comment, p_photo, p_reason, p_note);
    v_out := 'ok:' || (v_result ->> 'became_hidden');
  exception when others then
    v_out := sqlerrm;
  end;
  execute 'reset role';
  return v_out;
end;
$fn$;

-- Whether the given user can read the comment / photo through RLS.
create function pg_temp.sees(p_user uuid, p_comment uuid, p_photo uuid) returns boolean
language plpgsql
as $fn$
declare
  v_ok boolean;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  execute 'set local role authenticated';
  if p_photo is null then
    v_ok := exists (select 1 from public.comments where id = p_comment);
  else
    v_ok := exists (select 1 from public.comment_photos where id = p_photo);
  end if;
  execute 'reset role';
  return v_ok;
end;
$fn$;

do $check$
declare
  v_author uuid := gen_random_uuid();
  v_old1 uuid := gen_random_uuid();
  v_old2 uuid := gen_random_uuid();
  v_old3 uuid := gen_random_uuid();
  v_old4 uuid := gen_random_uuid();
  v_young1 uuid := gen_random_uuid();
  v_young2 uuid := gen_random_uuid();
  v_young3 uuid := gen_random_uuid();
  v_spammer uuid := gen_random_uuid();
  v_recipe uuid;
  v_comment uuid;
  v_comment2 uuid;
  v_photo uuid;
  v_photo2 uuid;
  v_r text;
  v_r2 text;
  v_i integer;
  v_ok boolean;
  v_report text := '';
begin
  select r.id into v_recipe from public.recipes r where r.deleted_at is null limit 1;

  insert into auth.users (id, aud, role, email, created_at, is_anonymous)
  select id, 'authenticated', 'authenticated', 'qz-rep-' || id || '@example.test', created, false
  from (values
    (v_author, now() - interval '2 days'),
    (v_old1, now() - interval '2 days'),
    (v_old2, now() - interval '2 days'),
    (v_old3, now() - interval '2 days'),
    (v_old4, now() - interval '2 days'),
    (v_young1, now() - interval '1 hour'),
    (v_young2, now() - interval '1 hour'),
    (v_young3, now() - interval '1 hour'),
    (v_spammer, now() - interval '2 days')
  ) as u(id, created);

  -- A comment with text and an approved photo, and a second text comment.
  insert into public.comments (user_id, recipe_id, body)
  values (v_author, v_recipe, 'qz reports check') returning id into v_comment;
  insert into public.comment_photos (comment_id, user_id, storage_path, position, width, height, moderation_status)
  values (v_comment, v_author, v_author || '/' || gen_random_uuid() || '.jpg', 0, 100, 100, 'approved')
  returning id into v_photo;
  insert into public.comment_photos (comment_id, user_id, storage_path, position, width, height, moderation_status)
  values (v_comment, v_author, v_author || '/' || gen_random_uuid() || '.jpg', 1, 100, 100, 'approved')
  returning id into v_photo2;
  insert into public.comments (user_id, recipe_id, body)
  values (v_author, v_recipe, 'qz reports check two') returning id into v_comment2;

  -- 1. Bad input, own content (AC-6)
  v_r := pg_temp.report_as(v_old1, 'photo', v_comment, null);
  v_r2 := pg_temp.report_as(v_author, 'comment', v_comment, null);
  v_ok := v_r = 'invalid_input' and v_r2 = 'own_content';
  v_report := v_report || format(E'\n%s photo report without photo id is invalid_input (%s), own comment is own_content (%s) AC-6',
    case when v_ok then 'PASS' else 'FAIL' end, v_r, v_r2);

  -- 2. Note too long is invalid_input (AC-6)
  v_r := pg_temp.report_as(v_old1, 'comment', v_comment2, null, 'other', repeat('x', 501));
  v_ok := v_r = 'invalid_input';
  v_report := v_report || format(E'\n%s 501 character note is invalid_input (%s) AC-6',
    case when v_ok then 'PASS' else 'FAIL' end, v_r);

  -- 3. Guest cannot report (AC-6)
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_young1, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  execute 'set local role authenticated';
  begin
    perform public.report_content('comment', v_comment2, null, 'spam', null);
    v_r := 'ok';
  exception when others then
    v_r := sqlerrm;
  end;
  execute 'reset role';
  v_ok := v_r = 'not_signed_in';
  v_report := v_report || format(E'\n%s anonymous session gets not_signed_in (%s) AC-6',
    case when v_ok then 'PASS' else 'FAIL' end, v_r);

  -- 4. First report succeeds and hides the photo for the reporter only (AC-8)
  v_r := pg_temp.report_as(v_old1, 'photo', v_comment, v_photo, 'offensive', '  rude  ');
  v_ok := v_r = 'ok:false'
    and not pg_temp.sees(v_old1, v_comment, v_photo)
    and pg_temp.sees(v_old1, v_comment, v_photo2)
    and pg_temp.sees(v_old1, v_comment, null)
    and pg_temp.sees(v_old4, v_comment, v_photo)
    and (select note from public.content_reports where reporter_id = v_old1) = 'rude';
  v_report := v_report || format(E'\n%s report hides the photo for the reporter only, note trimmed (%s) AC-8',
    case when v_ok then 'PASS' else 'FAIL' end, v_r);

  -- 5. Second report on the same target is already_reported (AC-7)
  v_r := pg_temp.report_as(v_old1, 'photo', v_comment, v_photo);
  v_ok := v_r = 'already_reported';
  v_report := v_report || format(E'\n%s repeat report is already_reported (%s) AC-7',
    case when v_ok then 'PASS' else 'FAIL' end, v_r);

  -- 6. Three young accounts: stored, but the photo stays approved (AC-9)
  perform pg_temp.report_as(v_young1, 'photo', v_comment, v_photo2);
  perform pg_temp.report_as(v_young2, 'photo', v_comment, v_photo2);
  v_r := pg_temp.report_as(v_young3, 'photo', v_comment, v_photo2);
  v_ok := v_r = 'ok:false'
    and (select moderation_status from public.comment_photos where id = v_photo2) = 'approved'
    and (select count(*) from public.content_reports where photo_id = v_photo2 and not counts_toward_hide) = 3;
  v_report := v_report || format(E'\n%s 3 reports from accounts under 24h do not hide (%s) AC-9',
    case when v_ok then 'PASS' else 'FAIL' end, v_r);

  -- 7. The 3rd counting photo report flags only that photo (AC-9)
  v_r := pg_temp.report_as(v_old2, 'photo', v_comment, v_photo);
  v_r2 := pg_temp.report_as(v_old3, 'photo', v_comment, v_photo);
  v_ok := v_r = 'ok:false' and v_r2 = 'ok:true'
    and (select moderation_status::text || '/' || flag_reason::text from public.comment_photos where id = v_photo) = 'flagged/reports'
    and not pg_temp.sees(v_old4, v_comment, v_photo)
    and pg_temp.sees(v_old4, v_comment, null)
    and pg_temp.sees(v_author, v_comment, v_photo);
  v_report := v_report || format(E'\n%s 3rd counting report flags the photo, comment text stays, author still sees it (%s, %s) AC-9 AC-10',
    case when v_ok then 'PASS' else 'FAIL' end, v_r, v_r2);

  -- 8. A non author cannot report a photo already hidden from them (invariant 13)
  v_r := pg_temp.report_as(v_old4, 'photo', v_comment, v_photo);
  v_ok := v_r = 'not_found';
  v_report := v_report || format(E'\n%s reporting a photo already hidden from you is not_found (%s) invariant 13',
    case when v_ok then 'PASS' else 'FAIL' end, v_r);

  -- 9. Three counting comment reports hide the whole comment (AC-9)
  perform pg_temp.report_as(v_old1, 'comment', v_comment2, null);
  perform pg_temp.report_as(v_old2, 'comment', v_comment2, null);
  v_r := pg_temp.report_as(v_old3, 'comment', v_comment2, null);
  v_ok := v_r = 'ok:true'
    and not pg_temp.sees(v_old4, v_comment2, null)
    and pg_temp.sees(v_author, v_comment2, null);
  v_report := v_report || format(E'\n%s 3 counting comment reports hide the comment for others (%s) AC-9',
    case when v_ok then 'PASS' else 'FAIL' end, v_r);

  -- 10. The 24 hour limit: the 21st report is report_limit (AC-7)
  for v_i in 1..20 loop
    insert into public.comments (user_id, recipe_id, body)
    values (v_author, v_recipe, 'qz limit ' || v_i) returning id into v_comment2;
    v_r := pg_temp.report_as(v_spammer, 'comment', v_comment2, null);
  end loop;
  insert into public.comments (user_id, recipe_id, body)
  values (v_author, v_recipe, 'qz limit 21') returning id into v_comment2;
  v_r2 := pg_temp.report_as(v_spammer, 'comment', v_comment2, null);
  v_ok := v_r = 'ok:false' and v_r2 = 'report_limit';
  v_report := v_report || format(E'\n%s 20th report ok (%s), 21st is report_limit (%s) AC-7',
    case when v_ok then 'PASS' else 'FAIL' end, v_r, v_r2);

  -- 11. Clients cannot write content_reports directly (AC-16, invariant 4)
  v_ok := false;
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_old4, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  execute 'set local role authenticated';
  begin
    insert into public.content_reports (reporter_id, target_kind, comment_id, reason, counts_toward_hide)
    values (v_old4, 'comment', v_comment, 'spam', true);
  exception when insufficient_privilege then
    v_ok := true;
  end;
  execute 'reset role';
  v_report := v_report || format(E'\n%s direct insert into content_reports is denied AC-16',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 12. A reporter reads only their own reports (invariant 4)
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_old1, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  execute 'set local role authenticated';
  v_ok := (select count(*) from public.content_reports) = (select count(*) from public.content_reports where reporter_id = v_old1)
    and (select count(*) from public.content_reports) = 2;
  execute 'reset role';
  v_report := v_report || format(E'\n%s reporter reads only their own 2 reports invariant 4',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 13. Deleting the photo resolves its reports as removed and keeps them (AC-12)
  delete from public.comment_photos where id = v_photo;
  v_ok := (select count(*) from public.content_reports
           where target_kind = 'photo' and photo_id is null and resolution = 'removed'
             and content_author_id = v_author and comment_id = v_comment) = 3
    and not exists (select 1 from public.content_reports where photo_id = v_photo);
  v_report := v_report || format(E'\n%s photo delete resolves its reports as removed, author kept AC-12',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 14. Deleting the comment resolves the rest (comment and photo reports) (AC-12)
  delete from public.comments where id = v_comment;
  v_ok := not exists (
    select 1 from public.content_reports
    where content_author_id = v_author and resolved_at is null and comment_id is null
  ) and (select count(*) from public.content_reports where photo_id is null and comment_id is null
           and resolution = 'removed' and content_author_id = v_author and target_kind = 'photo') = 6;
  v_report := v_report || format(E'\n%s comment delete resolves its photo reports as removed AC-12',
    case when v_ok then 'PASS' else 'FAIL' end);

  raise exception E'comment safety reports check report (rolled back):%', v_report;
end;
$check$;

rollback;
