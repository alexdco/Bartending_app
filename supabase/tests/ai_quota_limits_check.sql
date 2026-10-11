-- Hand run database checks for spec 0034 (AI quota abuse limits), Build plan
-- tasks 2 and 8. Paste into the Supabase SQL editor after applying
-- 20261011120000_ai_quota_abuse_limits.sql (and, for the retention check,
-- 20261011120100_register_ai_quota_cleanup_cron.sql).
--
-- Everything runs inside one DO block that always ends by raising an
-- exception, so every temporary user, counter row, and cleanup run is rolled
-- back. The exception message IS the report: a PASS/FAIL line per check.
-- Not covered here (needs two sessions): concurrency; check it against the
-- deployed function with parallel calls.
-- Spec: docs/specs/0034-ai-quota-abuse-hardening/index.md

do $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_users uuid[] := array(select gen_random_uuid() from generate_series(1, 12));
  v_linked_a uuid := v_users[11];
  v_linked_b uuid := v_users[12];
  v_ip_a text := repeat('a', 64);
  v_ip_b text := repeat('b', 64);
  v_ip_c text := repeat('c', 64);
  v_ip_d text := repeat('d', 64);
  v_ip_e text := repeat('e', 64);
  v_ip_f text := repeat('f', 64);
  v_report text := '';
  v_ok boolean;
  v_before int;
  v_cmd text;
  v_job_command text;
  r record;
  i int;
  g int;
begin
  insert into auth.users (id, is_anonymous)
  select u, true from unnest(v_users) u;
  update auth.users set is_anonymous = false where id in (v_linked_a, v_linked_b);

  -- Start today's total from zero inside this rolled back transaction.
  insert into public.ai_generation_daily_total (day) values (v_day) on conflict (day) do nothing;
  update public.ai_generation_daily_total set total_count = 0 where day = v_day;

  ---------------------------------------------------------------------------
  -- AC-1: guest limited to 5, then linking raises the same user to 10.
  ---------------------------------------------------------------------------
  v_ok := true;
  for i in 1..5 loop
    select * into r from public.reserve_ai_generation_slot(v_users[1], true, v_ip_a, 5, 20, 2000, 1600);
    v_ok := v_ok and r.reason is null and r.day = v_day;
  end loop;
  select * into r from public.reserve_ai_generation_slot(v_users[1], true, v_ip_a, 5, 20, 2000, 1600);
  v_ok := v_ok and r.reason = 'user_limit';
  v_report := v_report || format(E'%s  AC-1 guest gets 5 then user_limit\n', case when v_ok then 'PASS' else 'FAIL' end);

  v_ok := true;
  for i in 1..5 loop
    select * into r from public.reserve_ai_generation_slot(v_users[1], false, null, 10, 20, 2000, 1600);
    v_ok := v_ok and r.reason is null;
  end loop;
  select * into r from public.reserve_ai_generation_slot(v_users[1], false, null, 10, 20, 2000, 1600);
  v_ok := v_ok and r.reason = 'user_limit'
    and (select q.count from public.ai_generation_quota q where q.user_id = v_users[1] and q.day = v_day) = 10
    and (select q.count from public.ai_generation_ip_quota q where q.ip_hash = v_ip_a and q.day = v_day) = 5
    and (select t.total_count from public.ai_generation_daily_total t where t.day = v_day) = 10;
  v_report := v_report || format(E'%s  AC-1 linked user keeps the count, gets 5 more (10 total), IP row untouched\n', case when v_ok then 'PASS' else 'FAIL' end);

  ---------------------------------------------------------------------------
  -- AC-2: five guests on one IP use 20, a sixth is refused, a signed in user
  -- on the same network is not.
  ---------------------------------------------------------------------------
  v_ok := true;
  for g in 2..6 loop
    for i in 1..4 loop
      select * into r from public.reserve_ai_generation_slot(v_users[g], true, v_ip_b, 5, 20, 2000, 1600);
      v_ok := v_ok and r.reason is null;
    end loop;
  end loop;
  select * into r from public.reserve_ai_generation_slot(v_users[7], true, v_ip_b, 5, 20, 2000, 1600);
  v_ok := v_ok and r.reason = 'ip_limit'
    and (select q.count from public.ai_generation_ip_quota q where q.ip_hash = v_ip_b and q.day = v_day) = 20
    and coalesce((select q.count from public.ai_generation_quota q where q.user_id = v_users[7] and q.day = v_day), 0) = 0;
  v_report := v_report || format(E'%s  AC-2 sixth guest session on a full IP gets ip_limit\n', case when v_ok then 'PASS' else 'FAIL' end);

  select * into r from public.reserve_ai_generation_slot(v_linked_a, false, null, 10, 20, 2000, 1600);
  v_report := v_report || format(E'%s  AC-2 signed in caller is not blocked by the IP limit\n', case when r.reason is null then 'PASS' else 'FAIL' end);

  ---------------------------------------------------------------------------
  -- AC-4: all or nothing. Guest at 4 of 5 on a full IP claims nothing.
  ---------------------------------------------------------------------------
  for i in 1..4 loop
    perform public.reserve_ai_generation_slot(v_users[8], true, v_ip_c, 5, 20, 2000, 1600);
  end loop;
  update public.ai_generation_ip_quota set count = 20 where ip_hash = v_ip_c and day = v_day;
  select t.total_count into v_before from public.ai_generation_daily_total t where t.day = v_day;
  select * into r from public.reserve_ai_generation_slot(v_users[8], true, v_ip_c, 5, 20, 2000, 1600);
  v_ok := r.reason = 'ip_limit'
    and (select q.count from public.ai_generation_quota q where q.user_id = v_users[8] and q.day = v_day) = 4
    and (select q.count from public.ai_generation_ip_quota q where q.ip_hash = v_ip_c and q.day = v_day) = 20
    and (select t.total_count from public.ai_generation_daily_total t where t.day = v_day) = v_before;
  v_report := v_report || format(E'%s  AC-4 refusal writes nothing (user stays 4, IP 20, total unchanged)\n', case when v_ok then 'PASS' else 'FAIL' end);

  -- Precedence: a full IP reports ip_limit even when guests are cut off.
  update public.ai_generation_daily_total set total_count = 1600 where day = v_day;
  select * into r from public.reserve_ai_generation_slot(v_users[8], true, v_ip_c, 5, 20, 2000, 1600);
  v_report := v_report || format(E'%s  AC-5 precedence: ip_limit before global_limit\n', case when r.reason = 'ip_limit' then 'PASS' else 'FAIL' end);

  ---------------------------------------------------------------------------
  -- AC-3: guests cut off at 1600, signed in callers continue to 2000.
  ---------------------------------------------------------------------------
  update public.ai_generation_daily_total set total_count = 1599 where day = v_day;
  select * into r from public.reserve_ai_generation_slot(v_users[9], true, v_ip_d, 5, 20, 2000, 1600);
  v_report := v_report || format(E'%s  AC-3 the guest request that reaches 1600 succeeds and returns total 1600\n', case when r.reason is null and r.total_count = 1600 then 'PASS' else 'FAIL' end);

  select * into r from public.reserve_ai_generation_slot(v_users[9], true, v_ip_d, 5, 20, 2000, 1600);
  v_ok := r.reason = 'global_limit' and r.total_count = 1600
    and (select q.count from public.ai_generation_quota q where q.user_id = v_users[9] and q.day = v_day) = 1
    and (select q.count from public.ai_generation_ip_quota q where q.ip_hash = v_ip_d and q.day = v_day) = 1;
  v_report := v_report || format(E'%s  AC-3 guest at 1600 gets global_limit, nothing claimed\n', case when v_ok then 'PASS' else 'FAIL' end);

  select * into r from public.reserve_ai_generation_slot(v_linked_b, false, null, 10, 20, 2000, 1600);
  v_report := v_report || format(E'%s  AC-3 signed in caller passes at 1600 (total now 1601)\n', case when r.reason is null and r.total_count = 1601 then 'PASS' else 'FAIL' end);

  update public.ai_generation_daily_total set total_count = 1999 where day = v_day;
  select * into r from public.reserve_ai_generation_slot(v_linked_b, false, null, 10, 20, 2000, 1600);
  v_report := v_report || format(E'%s  AC-3 the signed in request that reaches 2000 succeeds\n', case when r.reason is null and r.total_count = 2000 then 'PASS' else 'FAIL' end);

  select * into r from public.reserve_ai_generation_slot(v_linked_b, false, null, 10, 20, 2000, 1600);
  v_report := v_report || format(E'%s  AC-3 at 2000 a signed in caller gets global_limit\n', case when r.reason = 'global_limit' and r.total_count = 2000 then 'PASS' else 'FAIL' end);

  ---------------------------------------------------------------------------
  -- AC-4b: release gives back every slot, on the reserved day, never below 0.
  ---------------------------------------------------------------------------
  update public.ai_generation_daily_total set total_count = 10 where day = v_day;
  select * into r from public.reserve_ai_generation_slot(v_users[10], true, v_ip_e, 5, 20, 2000, 1600);
  perform public.release_ai_generation_slot(v_users[10], v_ip_e, r.day);
  v_ok := r.reason is null
    and (select q.count from public.ai_generation_quota q where q.user_id = v_users[10] and q.day = v_day) = 0
    and (select q.count from public.ai_generation_ip_quota q where q.ip_hash = v_ip_e and q.day = v_day) = 0
    and (select t.total_count from public.ai_generation_daily_total t where t.day = v_day) = 10;
  v_report := v_report || format(E'%s  AC-4b guest release restores user, IP, and total\n', case when v_ok then 'PASS' else 'FAIL' end);

  perform public.release_ai_generation_slot(v_users[10], v_ip_e, v_day);
  update public.ai_generation_daily_total set total_count = 0 where day = v_day;
  perform public.release_ai_generation_slot(v_users[10], v_ip_e, v_day);
  v_ok := (select q.count from public.ai_generation_quota q where q.user_id = v_users[10] and q.day = v_day) = 0
    and (select q.count from public.ai_generation_ip_quota q where q.ip_hash = v_ip_e and q.day = v_day) = 0
    and (select t.total_count from public.ai_generation_daily_total t where t.day = v_day) = 0;
  v_report := v_report || format(E'%s  AC-4b release never goes below zero\n', case when v_ok then 'PASS' else 'FAIL' end);

  select q.count into v_before from public.ai_generation_ip_quota q where q.ip_hash = v_ip_a and q.day = v_day;
  select * into r from public.reserve_ai_generation_slot(v_linked_a, false, null, 10, 20, 2000, 1600);
  perform public.release_ai_generation_slot(v_linked_a, null, r.day);
  v_ok := r.reason is null
    and (select q.count from public.ai_generation_quota q where q.user_id = v_linked_a and q.day = v_day) = 1
    and (select q.count from public.ai_generation_ip_quota q where q.ip_hash = v_ip_a and q.day = v_day) = v_before;
  v_report := v_report || format(E'%s  AC-4b signed in release leaves IP rows alone\n', case when v_ok then 'PASS' else 'FAIL' end);

  ---------------------------------------------------------------------------
  -- AC-4: bad input fails closed.
  ---------------------------------------------------------------------------
  begin
    perform public.reserve_ai_generation_slot(v_users[1], true, '', 5, 20, 2000, 1600);
    v_report := v_report || E'FAIL  AC-4 guest with an empty ip hash raises\n';
  exception when others then
    v_report := v_report || E'PASS  AC-4 guest with an empty ip hash raises\n';
  end;

  begin
    perform public.reserve_ai_generation_slot(v_users[1], true, null, 5, 20, 2000, 1600);
    v_report := v_report || E'FAIL  AC-4 guest with a null ip hash raises\n';
  exception when others then
    v_report := v_report || E'PASS  AC-4 guest with a null ip hash raises\n';
  end;

  begin
    perform public.reserve_ai_generation_slot(v_linked_a, false, null, 0, 20, 2000, 1600);
    v_report := v_report || E'FAIL  AC-4 a zero limit raises\n';
  exception when others then
    v_report := v_report || E'PASS  AC-4 a zero limit raises\n';
  end;

  ---------------------------------------------------------------------------
  -- AC-11: clients get nothing; only service_role can run the functions.
  ---------------------------------------------------------------------------
  v_ok := not (
    has_table_privilege('anon', 'public.ai_generation_ip_quota', 'select, insert, update, delete')
    or has_table_privilege('authenticated', 'public.ai_generation_ip_quota', 'select, insert, update, delete')
    or has_table_privilege('anon', 'public.ai_generation_daily_total', 'select, insert, update, delete')
    or has_table_privilege('authenticated', 'public.ai_generation_daily_total', 'select, insert, update, delete')
  )
  and (select bool_and(c.relrowsecurity) from pg_class c
       where c.oid in ('public.ai_generation_ip_quota'::regclass, 'public.ai_generation_daily_total'::regclass))
  and not exists (select 1 from pg_policies p where p.schemaname = 'public'
                  and p.tablename in ('ai_generation_ip_quota', 'ai_generation_daily_total'));
  v_report := v_report || format(E'%s  AC-11 new tables: RLS on, no policy, no anon/authenticated privileges\n', case when v_ok then 'PASS' else 'FAIL' end);

  v_ok := not has_function_privilege('anon', 'public.reserve_ai_generation_slot(uuid, boolean, text, int, int, int, int)', 'execute')
    and not has_function_privilege('authenticated', 'public.reserve_ai_generation_slot(uuid, boolean, text, int, int, int, int)', 'execute')
    and not has_function_privilege('anon', 'public.release_ai_generation_slot(uuid, text, date)', 'execute')
    and not has_function_privilege('authenticated', 'public.release_ai_generation_slot(uuid, text, date)', 'execute')
    and has_function_privilege('service_role', 'public.reserve_ai_generation_slot(uuid, boolean, text, int, int, int, int)', 'execute')
    and has_function_privilege('service_role', 'public.release_ai_generation_slot(uuid, text, date)', 'execute');
  v_report := v_report || format(E'%s  AC-11 only service_role can execute reserve and release\n', case when v_ok then 'PASS' else 'FAIL' end);

  ---------------------------------------------------------------------------
  -- AC-10: the cleanup job deletes rows older than 7 days, keeps newer ones.
  ---------------------------------------------------------------------------
  select j.command into v_job_command from cron.job j where j.jobname = 'ai-quota-cleanup';
  if v_job_command is null then
    v_report := v_report || E'SKIP  AC-10 cron job ai-quota-cleanup not registered yet (apply the cron migration)\n';
  else
    insert into public.ai_generation_quota (user_id, day, count) values
      (v_users[1], v_day - 8, 1), (v_users[1], v_day - 6, 1);
    insert into public.ai_generation_ip_quota (ip_hash, day, count) values
      (v_ip_f, v_day - 8, 1), (v_ip_f, v_day - 6, 1);
    insert into public.ai_generation_daily_total (day, total_count) values
      (v_day - 8, 1), (v_day - 6, 1)
      on conflict (day) do nothing;

    foreach v_cmd in array string_to_array(v_job_command, ';') loop
      if btrim(v_cmd) <> '' then
        execute v_cmd;
      end if;
    end loop;

    v_ok := not exists (select 1 from public.ai_generation_quota q where q.user_id = v_users[1] and q.day = v_day - 8)
      and exists (select 1 from public.ai_generation_quota q where q.user_id = v_users[1] and q.day = v_day - 6)
      and not exists (select 1 from public.ai_generation_ip_quota q where q.ip_hash = v_ip_f and q.day = v_day - 8)
      and exists (select 1 from public.ai_generation_ip_quota q where q.ip_hash = v_ip_f and q.day = v_day - 6)
      and not exists (select 1 from public.ai_generation_daily_total t where t.day = v_day - 8)
      and exists (select 1 from public.ai_generation_daily_total t where t.day = v_day - 6);
    v_report := v_report || format(E'%s  AC-10 cleanup drops 8 day old rows, keeps 6 day old rows, all three tables\n', case when v_ok then 'PASS' else 'FAIL' end);
  end if;

  raise exception E'AI quota checks finished, every change rolled back. % failed.\n\n%',
    (length(v_report) - length(replace(v_report, 'FAIL  ', ''))) / length('FAIL  '),
    v_report;
end;
$$;
