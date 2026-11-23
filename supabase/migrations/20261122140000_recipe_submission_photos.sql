-- Spec 0064 (user submitted recipes), migration slice 2: photos (build plan
-- task 7, AC-8, AC-11).
--
-- A private `recipe-submission-photos` bucket holds each submission's hero
-- and card WebP pair at `<author id>/<submission id>-<16 hex>-(hero|card).webp`.
-- The form uploads the pair under the client generated submission id before
-- it saves, and save_recipe_submission already checks the path prefix
-- (invalid_photo). Only the author (their own folder) and the admin can read
-- or delete; nobody updates in place, so a screened file can never be
-- swapped (a new photo is a new hash).
--
-- admin_approve_recipe_submission now only accepts an image URL that points
-- at the hero the approve Edge Function just copied into
-- `recipe-images/recipes/<p_recipe_id>/`, with its card sibling present, the
-- same check admin_set_recipe_image makes.
--
-- Applied by hand in the dashboard SQL editor. Rollback:
-- supabase/rollbacks/20261122140000_recipe_submission_photos_down.sql.
-- Checks: supabase/tests/recipe_submission_photos_check.sql.

-- 1. Bucket ------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-submission-photos', 'recipe-submission-photos', false, 2097152, array['image/webp'])
on conflict (id) do nothing;

-- 2. Storage policies (AC-4, AC-8, invariant 1) -------------------------------
--
-- Insert: a signed in, non anonymous user, only in their own folder, only a
-- name in the exact pattern. The folder check compares the whole first path
-- segment with auth.uid(), so `<uid>x/...` never passes.

create policy recipe_submission_photos_insert on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'recipe-submission-photos'
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[0-9a-f]{16}-(hero|card)\.webp$'
  );

-- Select: the owner or the admin. The Storage API's remove() deletes with a
-- returning clause, so delete needs this too.
create policy recipe_submission_photos_select on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'recipe-submission-photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_current_user_admin())
    )
  );

create policy recipe_submission_photos_delete on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'recipe-submission-photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_current_user_admin())
    )
  );

-- No update policy: stored files are immutable.

-- 3. admin_approve_recipe_submission: only our own copied image (AC-11) -------
--
-- Same signature, so create or replace keeps its grants. The body is the
-- slice 1 body plus the image check before any write.

create or replace function public.admin_approve_recipe_submission(
  p_submission_id uuid,
  p_expected_updated_at timestamptz,
  p_recipe_id uuid,
  p_name text,
  p_instructions text,
  p_glass text,
  p_alcoholic_status text,
  p_region text,
  p_ingredients jsonb,
  p_tags jsonb,
  p_flavor_profile text[] default null,
  p_set_method boolean default false,
  p_method text default null,
  p_set_fame_score boolean default false,
  p_fame_score smallint default null,
  p_bartender_tip text default null,
  p_image_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sub public.recipe_submissions%rowtype;
  v_tip text;
  v_prefix text;
  v_hash text;
  v_file_count int;
  new_recipe_id uuid;
begin
  if not public.is_current_user_admin() then
    raise exception using errcode = 'P0001', message = 'not_admin';
  end if;

  if p_recipe_id is null then
    raise exception using errcode = 'P0001', message = 'invalid_recipe_id';
  end if;

  select * into sub
  from public.recipe_submissions s
  where s.id = p_submission_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  if sub.status <> 'pending' or sub.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'P0001', message = 'stale';
  end if;

  -- recipes_bartender_tip_check: trimmed, 1 to 240 characters.
  v_tip := nullif(btrim(coalesce(p_bartender_tip, ''), E' \t\r\n'), '');
  if v_tip is not null and char_length(v_tip) > 240 then
    raise exception using errcode = 'P0001', message = 'invalid_bartender_tip';
  end if;

  -- The kept photo: a hero in this recipe's own folder whose card exists.
  if p_image_url is not null then
    v_prefix := 'recipes/' || p_recipe_id::text || '/';
    v_hash := substring(
      p_image_url
      from '^https?://[^/]+/storage/v1/object/public/recipe-images/'
        || v_prefix
        || '([0-9a-f]{16})-hero\.webp$'
    );

    if v_hash is null then
      raise exception using errcode = 'P0001', message = 'invalid_image';
    end if;

    select count(*) into v_file_count
    from storage.objects o
    where o.bucket_id = 'recipe-images'
      and o.name in (v_prefix || v_hash || '-hero.webp', v_prefix || v_hash || '-card.webp');

    if v_file_count <> 2 then
      raise exception using errcode = 'P0001', message = 'invalid_image';
    end if;
  end if;

  new_recipe_id := public._upsert_recipe_core(
    'community', 'community-' || sub.id::text, sub.author_id, p_recipe_id,
    null, p_name, p_instructions, p_glass, p_alcoholic_status, p_region,
    p_ingredients, p_tags, p_flavor_profile, p_set_method, p_method,
    p_set_fame_score, p_fame_score
  );

  update public.recipes
  set bartender_tip = v_tip,
      image_url = coalesce(p_image_url, image_url),
      image_origin = case when p_image_url is not null then 'admin_upload' else image_origin end,
      image_source_url = case when p_image_url is not null then null else image_source_url end
  where id = new_recipe_id;

  update public.recipe_submissions s
  set status = 'approved',
      approved_recipe_id = new_recipe_id,
      reviewed_at = clock_timestamp()
  where s.id = sub.id;

  return new_recipe_id;
end;
$$;
