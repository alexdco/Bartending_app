-- list_my_pending_invites: lets a linked user discover their own pending
-- bar_invites by email, so the web invite-accept screen can render an
-- in-app list instead of requiring a pasted invite id (spec
-- 0023-bar-data-model.md's web build plan step 9). bar_invites_select only
-- lets a bar's owner read its invites, so an invitee has no direct read
-- path today; this security definer function opens a narrow, read-only one
-- scoped strictly to the caller's own verified email, mirroring
-- accept_bar_invite's caller-derivation pattern (never trusts a client
-- supplied identity, re-derives auth.uid() and the email match internally).
create function public.list_my_pending_invites()
returns table (
  id uuid,
  bar_id uuid,
  bar_name text,
  email text,
  invited_by uuid,
  status text,
  created_at timestamptz,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_email text;
begin
  if (select auth.jwt() ->> 'is_anonymous') = 'true' then
    raise exception 'a linked account is required to view invites' using errcode = '42501';
  end if;

  select lower(u.email) into v_user_email from auth.users u where u.id = auth.uid();

  return query
    select
      bi.id,
      bi.bar_id,
      b.name as bar_name,
      bi.email,
      bi.invited_by,
      bi.status,
      bi.created_at,
      bi.expires_at
    from public.bar_invites bi
    join public.bars b on b.id = bi.bar_id
    where bi.email = v_user_email
      and bi.status = 'pending'
      and bi.expires_at > now()
    order by bi.created_at desc;
end;
$$;

revoke all on function public.list_my_pending_invites() from public;
revoke execute on function public.list_my_pending_invites() from anon;
grant execute on function public.list_my_pending_invites() to authenticated;
