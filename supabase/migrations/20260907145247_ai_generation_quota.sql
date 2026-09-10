-- AI generated pantry drink ideas: per-user daily quota for the generate-drink-idea
-- Edge Function. No client policy at all: a quota counter a client could read or
-- write is a counter a client could reset or inflate, defeating the daily limit
-- entirely. The Edge Function's service role key is the only reader or writer.
-- Spec: docs/specs/0007-ai-generated-pantry-drink-ideas.md

create table public.ai_generation_quota (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null default (now() at time zone 'utc')::date,
  count int not null default 0,
  primary key (user_id, day)
);

alter table public.ai_generation_quota enable row level security;

revoke all on public.ai_generation_quota from anon, authenticated;
