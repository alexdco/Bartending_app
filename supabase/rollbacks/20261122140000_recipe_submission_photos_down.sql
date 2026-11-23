-- Rollback for 20261122140000_recipe_submission_photos.sql (spec 0064 task 7).
--
-- Drops the bucket policies and restores the slice 1 approve function (no
-- image check). Supabase blocks deleting storage rows from SQL, so empty and
-- delete the `recipe-submission-photos` bucket from the dashboard afterwards
-- if you want it gone.
begin;

drop policy if exists recipe_submission_photos_insert on storage.objects;
drop policy if exists recipe_submission_photos_select on storage.objects;
drop policy if exists recipe_submission_photos_delete on storage.objects;

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

  new_recipe_id := public._upsert_recipe_core(
    'community', 'community-' || sub.id::text, sub.author_id, p_recipe_id,
    null, p_name, p_instructions, p_glass, p_alcoholic_status, p_region,
    p_ingredients, p_tags, p_flavor_profile, p_set_method, p_method,
    p_set_fame_score, p_fame_score
  );

  update public.recipes
  set bartender_tip = v_tip,
      image_url = coalesce(p_image_url, image_url),
      image_origin = case when p_image_url is not null then 'admin_upload' else image_origin end
  where id = new_recipe_id;

  update public.recipe_submissions s
  set status = 'approved',
      approved_recipe_id = new_recipe_id,
      reviewed_at = clock_timestamp()
  where s.id = sub.id;

  return new_recipe_id;
end;
$$;

notify pgrst, 'reload schema';

commit;
