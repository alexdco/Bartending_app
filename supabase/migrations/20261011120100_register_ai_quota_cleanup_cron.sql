-- Registers the daily pg_cron job that deletes AI quota rows older than 7
-- days from all three counter tables (spec 0034 AC-10). Plain SQL, so unlike
-- the other cleanup jobs it needs no Edge Function and no Vault secret. With
-- the job running once a day, a guest's IP hash is kept for up to 8 days,
-- which is what the privacy page states (AC-12).
-- Spec: docs/specs/0034-ai-quota-abuse-hardening/index.md

select cron.schedule(
  'ai-quota-cleanup',
  '15 4 * * *',
  $$
  delete from public.ai_generation_quota
  where day < (now() at time zone 'utc')::date - 7;

  delete from public.ai_generation_ip_quota
  where day < (now() at time zone 'utc')::date - 7;

  delete from public.ai_generation_daily_total
  where day < (now() at time zone 'utc')::date - 7;
  $$
);
