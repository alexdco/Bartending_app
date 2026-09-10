-- Atomically reserves one of a user's daily AI generation slots: one insert,
-- checking and claiming in a single round trip, so two concurrent requests
-- from the same user cannot both pass the check. Returns true if a slot was
-- claimed, false if the day's limit is already reached. Called by the
-- generate-drink-idea Edge Function using the service role key; never exposed
-- to anon/authenticated, since ai_generation_quota grants no client policy.
-- Spec: docs/specs/0007-ai-generated-pantry-drink-ideas.md
create or replace function public.reserve_ai_generation_quota(
  p_user_id uuid,
  p_day date,
  p_limit int
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed boolean;
begin
  insert into public.ai_generation_quota (user_id, day, count)
  values (p_user_id, p_day, 1)
  on conflict (user_id, day) do update
  set count = public.ai_generation_quota.count + 1
  where public.ai_generation_quota.count < p_limit
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

revoke execute on function public.reserve_ai_generation_quota(uuid, date, int) from public, anon, authenticated;
