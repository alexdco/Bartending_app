-- Layered limits against AI quota abuse via anonymous sessions: a per IP
-- bucket counter for guests, a global daily total, and one reservation
-- function that checks and claims the user, IP, and global slots together
-- (all or nothing), plus a release function for the 502 path. The old
-- reserve_ai_generation_quota stays in place until the new Edge Function has
-- served traffic for a day (spec 0034 Build plan task 11).
-- Spec: docs/specs/0034-ai-quota-abuse-hardening/index.md

-- One row per IP bucket per UTC day, guests only. ip_hash is the hex HMAC
-- SHA-256 of the bucket string; no raw IP is ever stored (AC-7).
create table public.ai_generation_ip_quota (
  ip_hash text not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  day date not null,
  count int not null default 0 check (count >= 0),
  primary key (ip_hash, day)
);

-- One row per UTC day, counting guest and signed in generations together.
create table public.ai_generation_daily_total (
  day date primary key,
  total_count int not null default 0 check (total_count >= 0)
);

-- No client policy: a counter a client could read or write is a counter a
-- client could reset (AC-11). Only the Edge Function's service role key
-- reaches these, through the functions below.
alter table public.ai_generation_ip_quota enable row level security;
alter table public.ai_generation_daily_total enable row level security;

revoke all on public.ai_generation_ip_quota from anon, authenticated;
revoke all on public.ai_generation_daily_total from anon, authenticated;

-- Locks the daily total, then the IP row (guests only), then the user row,
-- always in that order so concurrent calls cannot deadlock. Checks run only
-- once every lock is held. Returns reason = null on success, or the first
-- matching refusal (user_limit, ip_limit, global_limit) having written
-- nothing. The day is computed here, once, and returned so a later release
-- hits the same day's rows.
create or replace function public.reserve_ai_generation_slot(
  p_user_id uuid,
  p_is_anonymous boolean,
  p_ip_hash text,
  p_user_limit int,
  p_ip_limit int,
  p_global_limit int,
  p_anon_global_limit int
)
returns table (reason text, day date, total_count int)
language plpgsql
security definer
set search_path = ''
set lock_timeout = '3s'
as $$
#variable_conflict use_column
declare
  v_day date := (now() at time zone 'utc')::date;
  v_total int;
  v_ip_count int;
  v_user_count int;
  v_reason text;
begin
  if p_user_id is null or p_is_anonymous is null then
    raise exception 'reserve_ai_generation_slot: user id and tier are required';
  end if;

  if coalesce(p_user_limit, 0) <= 0
    or coalesce(p_ip_limit, 0) <= 0
    or coalesce(p_global_limit, 0) <= 0
    or coalesce(p_anon_global_limit, 0) <= 0 then
    raise exception 'reserve_ai_generation_slot: every limit must be positive';
  end if;

  -- A guest without an IP hash is a caller bug; fail closed rather than
  -- skip the IP layer.
  if p_is_anonymous and coalesce(p_ip_hash, '') = '' then
    raise exception 'reserve_ai_generation_slot: an anonymous caller needs an ip hash';
  end if;

  insert into public.ai_generation_daily_total (day)
  values (v_day)
  on conflict (day) do nothing;

  select t.total_count into v_total
  from public.ai_generation_daily_total t
  where t.day = v_day
  for update;

  if p_is_anonymous then
    insert into public.ai_generation_ip_quota (ip_hash, day)
    values (p_ip_hash, v_day)
    on conflict (ip_hash, day) do nothing;

    select q.count into v_ip_count
    from public.ai_generation_ip_quota q
    where q.ip_hash = p_ip_hash and q.day = v_day
    for update;
  end if;

  insert into public.ai_generation_quota (user_id, day, count)
  values (p_user_id, v_day, 0)
  on conflict (user_id, day) do nothing;

  select q.count into v_user_count
  from public.ai_generation_quota q
  where q.user_id = p_user_id and q.day = v_day
  for update;

  if v_user_count >= p_user_limit then
    v_reason := 'user_limit';
  elsif p_is_anonymous and v_ip_count >= p_ip_limit then
    v_reason := 'ip_limit';
  elsif v_total >= p_global_limit
    or (p_is_anonymous and v_total >= p_anon_global_limit) then
    v_reason := 'global_limit';
  end if;

  if v_reason is not null then
    return query select v_reason, v_day, v_total;
    return;
  end if;

  update public.ai_generation_quota q
  set count = q.count + 1
  where q.user_id = p_user_id and q.day = v_day;

  if p_is_anonymous then
    update public.ai_generation_ip_quota q
    set count = q.count + 1
    where q.ip_hash = p_ip_hash and q.day = v_day;
  end if;

  update public.ai_generation_daily_total t
  set total_count = t.total_count + 1
  where t.day = v_day
  returning t.total_count into v_total;

  return query select null::text, v_day, v_total;
end;
$$;

-- Gives back the slots a reservation claimed, for a generation that still
-- failed after its retry (AC-4b). Same lock order as the reservation; never
-- goes below zero. p_ip_hash is null for signed in callers.
create or replace function public.release_ai_generation_slot(
  p_user_id uuid,
  p_ip_hash text,
  p_day date
)
returns void
language plpgsql
security definer
set search_path = ''
set lock_timeout = '3s'
as $$
begin
  if p_user_id is null or p_day is null then
    raise exception 'release_ai_generation_slot: user id and day are required';
  end if;

  update public.ai_generation_daily_total t
  set total_count = greatest(t.total_count - 1, 0)
  where t.day = p_day;

  if p_ip_hash is not null then
    update public.ai_generation_ip_quota q
    set count = greatest(q.count - 1, 0)
    where q.ip_hash = p_ip_hash and q.day = p_day;
  end if;

  update public.ai_generation_quota q
  set count = greatest(q.count - 1, 0)
  where q.user_id = p_user_id and q.day = p_day;
end;
$$;

revoke execute on function public.reserve_ai_generation_slot(uuid, boolean, text, int, int, int, int) from public, anon, authenticated;
revoke execute on function public.release_ai_generation_slot(uuid, text, date) from public, anon, authenticated;
grant execute on function public.reserve_ai_generation_slot(uuid, boolean, text, int, int, int, int) to service_role;
grant execute on function public.release_ai_generation_slot(uuid, text, date) to service_role;
