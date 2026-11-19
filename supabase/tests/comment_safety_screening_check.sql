-- Hand run database checks for spec 0062 (comment safety), build task 1.
-- Paste into the Supabase SQL editor after applying
-- 20261118130000_comment_safety_screening.sql.
--
-- Runs inside begin ... rollback. The DO block always ends by raising an
-- exception, so the two test users, their comments, photos, and the usage row
-- are all rolled back (the screening trigger's queued pg_net requests too).
-- The exception message IS the report: a PASS/FAIL line per check.
-- Spec: docs/specs/0062-comment-safety/index.md

begin;

do $check$
declare
  v_author uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_recipe uuid;
  v_text_comment uuid;
  v_photo_comment uuid;
  v_photo uuid;
  v_photo_only uuid;
  v_stale uuid;
  v_n integer;
  v_status public.moderation_status;
  v_ok boolean := false;
  v_report text := '';
begin
  select r.id into v_recipe from public.recipes r where r.deleted_at is null limit 1;

  insert into auth.users (id, aud, role, email, created_at, is_anonymous)
  values
    (v_author, 'authenticated', 'authenticated', 'qz-author-' || v_author || '@example.test', now() - interval '2 days', false),
    (v_other, 'authenticated', 'authenticated', 'qz-other-' || v_other || '@example.test', now() - interval '2 days', false);

  -- A comment with text and one photo, and a photo only comment.
  insert into public.comments (user_id, recipe_id, body)
  values (v_author, v_recipe, 'qz screening check') returning id into v_text_comment;
  insert into public.comment_photos (comment_id, user_id, storage_path, position, width, height)
  values (v_text_comment, v_author, v_author || '/' || gen_random_uuid() || '.jpg', 0, 100, 100)
  returning id into v_photo;

  insert into public.comments (user_id, recipe_id, body)
  values (v_author, v_recipe, null) returning id into v_photo_comment;
  insert into public.comment_photos (comment_id, user_id, storage_path, position, width, height)
  values (v_photo_comment, v_author, v_author || '/' || gen_random_uuid() || '.jpg', 0, 100, 100)
  returning id into v_photo_only;

  -- 1. New photos start pending; comments start approved (AC-1)
  v_ok := (select moderation_status from public.comment_photos where id = v_photo) = 'pending'
    and (select moderation_status from public.comments where id = v_text_comment) = 'approved';
  v_report := v_report || format(E'\n%s new photo pending, comment approved AC-1',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 2. Guest: sees the text comment, not its pending photo, and not the
  --    photo only comment at all (AC-1, AC-5)
  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  v_ok := exists (select 1 from public.comments where id = v_text_comment)
    and not exists (select 1 from public.comment_photos where id = v_photo)
    and not exists (select 1 from public.comments where id = v_photo_comment);
  execute 'reset role';
  v_report := v_report || format(E'\n%s guest sees text only, no pending photo, no empty shell AC-1 AC-5',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 3. Another signed in user: same as the guest (AC-1)
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  v_ok := exists (select 1 from public.comments where id = v_text_comment)
    and not exists (select 1 from public.comment_photos where id = v_photo)
    and not exists (select 1 from public.comments where id = v_photo_comment);
  execute 'reset role';
  v_report := v_report || format(E'\n%s other user sees no pending photo AC-1',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 4. The author sees both comments and their photos, with the status (AC-1)
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_author, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  v_ok := (select moderation_status from public.comment_photos where id = v_photo) = 'pending'
    and exists (select 1 from public.comments where id = v_photo_comment)
    and exists (select 1 from public.comment_photos where id = v_photo_only);
  execute 'reset role';
  v_report := v_report || format(E'\n%s author sees own pending photos with status AC-1',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 5. Clients cannot read flag_reason / flag_categories (invariant 2a)
  v_ok := false;
  execute 'set local role authenticated';
  begin
    perform flag_categories from public.comment_photos where id = v_photo;
  exception when insufficient_privilege then
    v_ok := true;
  end;
  execute 'reset role';
  v_report := v_report || format(E'\n%s client select of flag_categories is denied AC-16',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 6. Clients cannot change moderation_status (AC-16)
  v_ok := false;
  execute 'set local role authenticated';
  begin
    update public.comments set moderation_status = 'approved' where id = v_text_comment;
  exception when insufficient_privilege then
    v_ok := true;
  end;
  execute 'reset role';
  v_report := v_report || format(E'\n%s client update of moderation_status is denied AC-16',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 7. Clients cannot call the screening functions (invariant 10)
  v_ok := not has_function_privilege('authenticated', 'public.reserve_photo_screening()', 'execute')
    and not has_function_privilege('anon', 'public.record_photo_screening(uuid, text, text[])', 'execute')
    and not has_function_privilege('authenticated', 'public.claim_pending_comment_photos(uuid, integer)', 'execute')
    and not has_function_privilege('authenticated', 'public.flag_stale_pending_photos()', 'execute')
    and has_function_privilege('service_role', 'public.reserve_photo_screening()', 'execute');
  v_report := v_report || format(E'\n%s screening functions are service role only invariant 10',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 8. Claim: trigger mode takes the photo once; a second claim gets nothing
  --    while the lease is fresh; the sweep skips photos under 2 minutes old
  select count(*) into v_n from public.claim_pending_comment_photos(v_photo, 10);
  v_ok := v_n = 1;
  select count(*) into v_n from public.claim_pending_comment_photos(v_photo, 10);
  v_ok := v_ok and v_n = 0;
  select count(*) into v_n from public.claim_pending_comment_photos(null, 50) c where c.id = v_photo_only;
  v_ok := v_ok and v_n = 0;
  v_report := v_report || format(E'\n%s claim lease and 2 minute sweep grace invariant 8',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 9. A pass approves; the other user then sees the photo (AC-2)
  v_status := public.record_photo_screening(v_photo, 'approved', null);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_other, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  v_ok := v_status = 'approved' and exists (select 1 from public.comment_photos where id = v_photo);
  execute 'reset role';
  v_report := v_report || format(E'\n%s pass approves and shows the photo AC-2',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 10. A late second verdict on a decided photo is a no op (invariant 7)
  v_status := public.record_photo_screening(v_photo, 'flagged', array['gore_violence']);
  v_ok := v_status is null
    and (select moderation_status from public.comment_photos where id = v_photo) = 'approved';
  v_report := v_report || format(E'\n%s late verdict ignored invariant 7',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 11. A flag stores categories and stays hidden (AC-2)
  v_status := public.record_photo_screening(v_photo_only, 'flagged', array['personal_info']);
  v_ok := v_status = 'flagged'
    and (select flag_reason = 'screening' and flag_categories = array['personal_info'] and flagged_at is not null
         from public.comment_photos where id = v_photo_only);
  v_report := v_report || format(E'\n%s flag stores reason and categories AC-2',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 12. Three failures flag screening_failed; the first two keep it pending (AC-3)
  insert into public.comment_photos (comment_id, user_id, storage_path, position, width, height)
  values (v_text_comment, v_author, v_author || '/' || gen_random_uuid() || '.jpg', 1, 100, 100)
  returning id into v_stale;
  v_status := public.record_photo_screening(v_stale, 'failed', null);
  v_ok := v_status = 'pending';
  v_status := public.record_photo_screening(v_stale, 'failed', null);
  v_ok := v_ok and v_status = 'pending';
  v_status := public.record_photo_screening(v_stale, 'failed', null);
  v_ok := v_ok and v_status = 'flagged'
    and (select flag_reason = 'screening_failed' and screening_attempts = 3
         from public.comment_photos where id = v_stale);
  v_report := v_report || format(E'\n%s 3rd failed attempt flags screening_failed AC-3',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 13. The 1 hour backstop flags an old pending photo, not a new one (AC-3)
  update public.comment_photos
  set moderation_status = 'pending', flag_reason = null, flagged_at = null, screening_attempts = 0,
      created_at = now() - interval '61 minutes'
  where id = v_stale;
  update public.comment_photos
  set moderation_status = 'pending', flag_reason = null, flag_categories = null, flagged_at = null
  where id = v_photo_only;
  perform public.flag_stale_pending_photos();
  v_ok := (select moderation_status = 'flagged' and flag_reason = 'screening_failed'
           from public.comment_photos where id = v_stale)
    and (select moderation_status from public.comment_photos where id = v_photo_only) = 'pending';
  v_report := v_report || format(E'\n%s 1 hour backstop flags only stale photos AC-3',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 14. The daily cap: 2000 calls, then false (AC-4)
  delete from public.photo_screening_usage where day = (now() at time zone 'utc')::date;
  insert into public.photo_screening_usage (day, calls) values ((now() at time zone 'utc')::date, 1999);
  v_ok := public.reserve_photo_screening();
  v_ok := v_ok and not public.reserve_photo_screening();
  v_ok := v_ok
    and (select calls from public.photo_screening_usage where day = (now() at time zone 'utc')::date) = 2000;
  v_report := v_report || format(E'\n%s 2000 a day cap AC-4',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 15. Wiring: the trigger exists and the cron job is scheduled every 5 minutes
  v_ok := exists (
      select 1 from pg_trigger
      where tgname = 'comment_photos_request_screening' and not tgisinternal
    )
    and exists (
      select 1 from cron.job where jobname = 'screen-comment-photos' and schedule = '*/5 * * * *'
    );
  v_report := v_report || format(E'\n%s screening trigger and 5 minute cron present AC-2 AC-3',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 16. Vault secret_key is not the placeholder (Risks)
  v_ok := exists (
    select 1 from vault.decrypted_secrets
    where name = 'secret_key' and decrypted_secret like 'sb_secret_%'
  );
  v_report := v_report || format(E'\n%s Vault secret_key holds a real sb_secret key Risks',
    case when v_ok then 'PASS' else 'FAIL' end);

  raise exception E'comment safety screening check report (rolled back):%', v_report;
end;
$check$;

rollback;
