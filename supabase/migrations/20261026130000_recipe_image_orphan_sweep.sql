-- Daily sweep of recipe-images files no recipe points to (spec 0041 AC-12).
--
-- A pair is referenced when some recipe's image_url ends with the pair's
-- hero object name. Replacing an image leaves the old pair unreferenced; a
-- save that is still in progress (files uploaded, image not set yet) is
-- protected by the 24 hour grace. Reuses the `service_role_key` Vault secret
-- (spec 0017), as the comment photo sweep does.

-- is_recipe_image_referenced ---------------------------------------------------

create or replace function public.is_recipe_image_referenced(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.recipes r
    where r.image_url like
      '%/recipe-images/' || regexp_replace(p_name, '-card\.webp$', '-hero.webp')
  );
$$;

revoke execute on function public.is_recipe_image_referenced(text) from public, anon, authenticated;
grant execute on function public.is_recipe_image_referenced(text) to service_role;

-- list_orphan_recipe_images ----------------------------------------------------
--
-- Objects older than 24 hours that no recipe references, oldest first. Only
-- the service role (the cleanup-orphan-recipe-images Edge Function) may call it.

create or replace function public.list_orphan_recipe_images(p_limit integer)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(name order by created_at), '{}')
  from (
    select o.name, o.created_at
    from storage.objects o
    where o.bucket_id = 'recipe-images'
      and o.created_at < now() - interval '24 hours'
      and not public.is_recipe_image_referenced(o.name)
    order by o.created_at
    limit greatest(p_limit, 0)
  ) orphans;
$$;

revoke execute on function public.list_orphan_recipe_images(integer) from public, anon, authenticated;
grant execute on function public.list_orphan_recipe_images(integer) to service_role;

-- Daily cron, 15 minutes after the comment photo sweep -------------------------

select cron.schedule(
  'orphan-recipe-image-cleanup',
  '45 4 * * *',
  $$
  select net.http_post(
    url := 'https://ctuzjhhpnkkhooneporu.supabase.co/functions/v1/cleanup-orphan-recipe-images',
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
