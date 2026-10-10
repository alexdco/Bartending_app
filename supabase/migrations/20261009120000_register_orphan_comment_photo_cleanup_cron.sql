-- Registers the daily pg_cron job that triggers cleanup-orphan-comment-photos
-- (spec 0032 AC-12). Reuses the `service_role_key` Vault secret seeded by the
-- idle anonymous account cleanup migration (spec 0017), so the key is never
-- hardcoded here. If that secret still holds its placeholder, set the real
-- value once in the SQL editor (see 20260911133702 for the command).

select cron.schedule(
  'orphan-comment-photo-cleanup',
  '30 4 * * *',
  $$
  select net.http_post(
    url := 'https://ctuzjhhpnkkhooneporu.supabase.co/functions/v1/cleanup-orphan-comment-photos',
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
