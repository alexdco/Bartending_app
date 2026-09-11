-- Registers the weekly pg_cron job that triggers cleanup-anonymous-accounts
-- (spec 0017). The job reads the service role key from Supabase Vault at
-- schedule time, so it is never hardcoded into migration SQL.
--
-- IMPORTANT (manual step): this migration seeds the Vault secret with a
-- placeholder value. Before the cron job can authenticate successfully, run
-- this once, with the project's real service role key, in the Supabase SQL
-- editor (never commit the real key to a migration file):
--
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'service_role_key'),
--     '<the real SUPABASE_SERVICE_ROLE_KEY>'
--   );

select vault.create_secret(
  'REPLACE_ME_VIA_DASHBOARD_SQL_EDITOR',
  'service_role_key',
  'Service role key used by the idle anonymous account cleanup cron job to call the cleanup-anonymous-accounts Edge Function.'
)
where not exists (select 1 from vault.secrets where name = 'service_role_key');

select cron.schedule(
  'idle-anonymous-account-cleanup',
  '0 6 * * 1',
  $$
  select net.http_post(
    url := 'https://ctuzjhhpnkkhooneporu.supabase.co/functions/v1/cleanup-anonymous-accounts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
