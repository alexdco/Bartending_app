-- The recipe image sweep's cron sends a new `sb_secret_...` key (spec 0041 AC-12).
--
-- On this project the Edge Function environment holds secret keys, not the
-- legacy service role JWT, even under SUPABASE_SERVICE_ROLE_KEY, so the JWT
-- in the `service_role_key` Vault secret is always rejected. The job now
-- sends the `secret_key` Vault secret on the `apikey` header (secret keys
-- are not JWTs and can't go in `Authorization: Bearer`).
--
-- Seeded with a placeholder; set the real value once in the SQL editor:
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'secret_key'),
--     '<sb_secret_... from Settings > API Keys>'
--   );

select vault.create_secret('REPLACE_ME_VIA_DASHBOARD_SQL_EDITOR', 'secret_key')
where not exists (select 1 from vault.secrets where name = 'secret_key');

-- Same name, so this replaces the job from 20261026130000.
select cron.schedule(
  'orphan-recipe-image-cleanup',
  '45 4 * * *',
  $$
  select net.http_post(
    url := 'https://ctuzjhhpnkkhooneporu.supabase.co/functions/v1/cleanup-orphan-recipe-images',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'secret_key'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
