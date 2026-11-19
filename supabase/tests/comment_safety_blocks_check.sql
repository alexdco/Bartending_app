-- Hand run database checks for spec 0062 (comment safety), build task 7.
-- Paste into the Supabase SQL editor after applying
-- 20261119130000_comment_safety_blocks.sql.
--
-- Runs inside begin ... rollback; the DO block always ends by raising an
-- exception whose message IS the report (a PASS/FAIL line per check).
-- Spec: docs/specs/0062-comment-safety/index.md

begin;

-- Run one statement as a signed in (or anonymous) user; returns 'ok' or the error.
create function pg_temp.as_user(p_user uuid, p_sql text, p_anonymous boolean default false)
returns text
language plpgsql
as $fn$
declare
  v_out text := 'ok';
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'is_anonymous', p_anonymous)::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql;
  exception when others then
    v_out := sqlstate || ' ' || sqlerrm;
  end;
  execute 'reset role';
  return v_out;
end;
$fn$;

create function pg_temp.sees(p_user uuid, p_sql text) returns boolean
language plpgsql
as $fn$
declare
  v_ok boolean;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  execute 'set local role authenticated';
  execute 'select exists (' || p_sql || ')' into v_ok;
  execute 'reset role';
  return v_ok;
end;
$fn$;

do $check$
declare
  v_blocker uuid := gen_random_uuid();
  v_author uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_recipe uuid;
  v_comment uuid;
  v_photo uuid;
  v_r text;
  v_ok boolean;
  v_report text := '';
begin
  select r.id into v_recipe from public.recipes r where r.deleted_at is null limit 1;

  insert into auth.users (id, aud, role, email, created_at, is_anonymous)
  select id, 'authenticated', 'authenticated', 'qz-blk-' || id || '@example.test', now() - interval '2 days', false
  from unnest(array[v_blocker, v_author, v_other]) as id;

  insert into public.comments (user_id, recipe_id, body)
  values (v_author, v_recipe, 'qz blocks check') returning id into v_comment;
  insert into public.comment_photos (comment_id, user_id, storage_path, position, width, height, moderation_status)
  values (v_comment, v_author, v_author || '/' || gen_random_uuid() || '.jpg', 0, 100, 100, 'approved')
  returning id into v_photo;

  -- 1. Block (client sends only blocked_id); the comment and photo vanish for the blocker only (AC-14)
  v_r := pg_temp.as_user(v_blocker, format('insert into public.user_blocks (blocked_id) values (%L)', v_author));
  v_ok := v_r = 'ok'
    and not pg_temp.sees(v_blocker, format('select 1 from public.comments where id = %L', v_comment))
    and not pg_temp.sees(v_blocker, format('select 1 from public.comment_photos where id = %L', v_photo))
    and pg_temp.sees(v_other, format('select 1 from public.comments where id = %L', v_comment))
    and pg_temp.sees(v_author, format('select 1 from public.comments where id = %L', v_comment));
  v_report := v_report || format(E'\n%s block hides the comment and photo for the blocker only (%s) AC-14',
    case when v_ok then 'PASS' else 'FAIL' end, v_r);

  -- 2. Blocking twice is a unique violation (the client maps it to success) (AC-14)
  v_r := pg_temp.as_user(v_blocker, format('insert into public.user_blocks (blocked_id) values (%L)', v_author));
  v_report := v_report || format(E'\n%s second block is a unique violation (%s) AC-14',
    case when v_r like '23505%' then 'PASS' else 'FAIL' end, v_r);

  -- 3. Cannot block yourself (AC-14)
  v_r := pg_temp.as_user(v_blocker, format('insert into public.user_blocks (blocked_id) values (%L)', v_blocker));
  v_report := v_report || format(E'\n%s self block is a check violation (%s) AC-14',
    case when v_r like '23514%' then 'PASS' else 'FAIL' end, v_r);

  -- 4. Cannot block on someone else's behalf (AC-16)
  v_r := pg_temp.as_user(v_blocker, format(
    'insert into public.user_blocks (blocker_id, blocked_id) values (%L, %L)', v_other, v_author));
  v_report := v_report || format(E'\n%s writing blocker_id is denied (%s) AC-16',
    case when v_r like '42501%' then 'PASS' else 'FAIL' end, v_r);

  -- 5. Anonymous sessions cannot block (AC-14)
  v_r := pg_temp.as_user(v_other, format('insert into public.user_blocks (blocked_id) values (%L)', v_author), true);
  v_report := v_report || format(E'\n%s anonymous block is refused (%s) AC-14',
    case when v_r like '42501%' then 'PASS' else 'FAIL' end, v_r);

  -- 6. Each user reads only their own blocks (AC-15)
  v_ok := pg_temp.sees(v_blocker, format('select 1 from public.user_blocks where blocked_id = %L', v_author))
    and not pg_temp.sees(v_other, 'select 1 from public.user_blocks');
  v_report := v_report || format(E'\n%s blocks are readable by the blocker only AC-15',
    case when v_ok then 'PASS' else 'FAIL' end);

  -- 7. Reporting a blocked author's comment is not_found (invariant 13)
  v_r := pg_temp.as_user(v_blocker, format(
    'select public.report_content(%L, %L, null, %L, null)', 'comment', v_comment, 'spam'));
  v_report := v_report || format(E'\n%s reporting blocked content is not_found (%s) invariant 13',
    case when v_r like '%not_found' then 'PASS' else 'FAIL' end, v_r);

  -- 8. Unblock: the content returns (AC-15)
  v_r := pg_temp.as_user(v_blocker, format('delete from public.user_blocks where blocked_id = %L', v_author));
  v_ok := v_r = 'ok'
    and pg_temp.sees(v_blocker, format('select 1 from public.comments where id = %L', v_comment))
    and pg_temp.sees(v_blocker, format('select 1 from public.comment_photos where id = %L', v_photo));
  v_report := v_report || format(E'\n%s unblock makes the content visible again (%s) AC-15',
    case when v_ok then 'PASS' else 'FAIL' end, v_r);

  raise exception E'comment safety blocks check report (rolled back):%', v_report;
end;
$check$;

rollback;
