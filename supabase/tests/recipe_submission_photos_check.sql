-- Hand run database checks for spec 0064 build plan task 7 (photos).
-- Paste into the Supabase SQL editor after applying
-- 20261122140000_recipe_submission_photos.sql.
--
-- Runs inside begin ... rollback. The DO block always ends by raising an
-- exception, so everything it seeds (users, submissions, storage rows, a
-- recipe) is rolled back. The exception message IS the report: a PASS/FAIL
-- line per check. The admin is the first existing user_preferences row with
-- is_admin. Storage rows are inserted as metadata only; no file bytes exist.
-- Spec: docs/specs/0064-user-submitted-recipes/index.md

begin;

create function pg_temp.try_as(p_role text, p_claims jsonb, p_sql text)
returns text
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', p_claims::text, true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
  exception when others then
    execute 'reset role';
    return sqlerrm;
  end;
  execute 'reset role';
  return 'ok';
end;
$$;

create function pg_temp.claims(p_user uuid, p_anonymous boolean default false)
returns jsonb
language sql
as $$
  select jsonb_build_object('sub', p_user, 'role', 'authenticated', 'is_anonymous', p_anonymous);
$$;

-- How many rows of the bucket this user can see through the select policy.
create function pg_temp.visible_count(p_user uuid, p_name text)
returns int
language plpgsql
as $$
declare
  v_n int;
begin
  perform set_config('request.jwt.claims', pg_temp.claims(p_user)::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from storage.objects o
  where o.bucket_id = 'recipe-submission-photos' and o.name = p_name;
  execute 'reset role';
  return v_n;
end;
$$;

do $check$
declare
  v_report text := '';
  v_author uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_guest uuid := gen_random_uuid();
  v_admin uuid;
  v_sub uuid := gen_random_uuid();
  v_recipe uuid := gen_random_uuid();
  v_hash constant text := '0123456789abcdef';
  v_path text;
  v_res text;
  v_n int;
  v_updated timestamptz;
  v_url text;
  v_ing constant text := '''[{"name":"Gin","measure":"2 oz"}]''::jsonb';
  v_recipe_ing constant text := '''[{"name":"Gin","measure":"2 oz"}]''::jsonb';
begin
  select up.user_id into v_admin from public.user_preferences up where up.is_admin limit 1;
  if v_admin is null then
    raise exception 'no admin user found; this check needs one';
  end if;

  insert into auth.users (id, aud, role, email, is_anonymous, created_at, updated_at)
  values
    (v_author, 'authenticated', 'authenticated', 'photos-check-author@example.invalid', false, now(), now()),
    (v_other, 'authenticated', 'authenticated', 'photos-check-other@example.invalid', false, now(), now()),
    (v_guest, 'authenticated', 'authenticated', null, true, now(), now());
  insert into public.user_preferences (user_id, display_name) values (v_author, 'Sam'), (v_other, 'Kim')
  on conflict (user_id) do update set display_name = excluded.display_name;

  v_path := v_author::text || '/' || v_sub::text || '-' || v_hash;

  -- Bucket: private, WebP only, 2 MB.
  select count(*) into v_n from storage.buckets b
  where b.id = 'recipe-submission-photos' and not b.public and b.file_size_limit = 2097152
    and b.allowed_mime_types = array['image/webp'];
  v_report := v_report || format(E'\n%s AC-8 bucket is private, WebP only, 2 MB',
    case when v_n = 1 then 'PASS' else 'FAIL' end);

  -- AC-8: the author uploads into their own folder.
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_author), format(
    $q$insert into storage.objects (bucket_id, name, owner_id) values ('recipe-submission-photos', %L, %L)$q$,
    v_path || '-hero.webp', v_author));
  v_report := v_report || format(E'\n%s AC-8 author can upload into their own folder (%s)',
    case when v_res = 'ok' then 'PASS' else 'FAIL' end, v_res);

  -- AC-4: someone else's folder, a bad name, or an anonymous session is refused.
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_other), format(
    $q$insert into storage.objects (bucket_id, name, owner_id) values ('recipe-submission-photos', %L, %L)$q$,
    v_path || '-card.webp', v_other));
  v_report := v_report || format(E'\n%s AC-4 upload into another user''s folder is refused (%s)',
    case when v_res like '%row-level security%' then 'PASS' else 'FAIL' end, v_res);

  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_author), format(
    $q$insert into storage.objects (bucket_id, name, owner_id) values ('recipe-submission-photos', %L, %L)$q$,
    v_author::text || '/anything.png', v_author));
  v_report := v_report || format(E'\n%s AC-8 a name outside the pattern is refused (%s)',
    case when v_res like '%row-level security%' then 'PASS' else 'FAIL' end, v_res);

  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_guest, true), format(
    $q$insert into storage.objects (bucket_id, name, owner_id) values ('recipe-submission-photos', %L, %L)$q$,
    v_guest::text || '/' || v_sub::text || '-' || v_hash || '-hero.webp', v_guest));
  v_report := v_report || format(E'\n%s AC-4 anonymous session upload is refused (%s)',
    case when v_res like '%row-level security%' then 'PASS' else 'FAIL' end, v_res);

  -- Invariant 1: the author and the admin read it, nobody else.
  v_report := v_report || format(E'\n%s Invariant 1 author sees own photo, other user sees nothing, admin sees it (%s/%s/%s)',
    case when pg_temp.visible_count(v_author, v_path || '-hero.webp') = 1
          and pg_temp.visible_count(v_other, v_path || '-hero.webp') = 0
          and pg_temp.visible_count(v_admin, v_path || '-hero.webp') = 1
      then 'PASS' else 'FAIL' end,
    pg_temp.visible_count(v_author, v_path || '-hero.webp'),
    pg_temp.visible_count(v_other, v_path || '-hero.webp'),
    pg_temp.visible_count(v_admin, v_path || '-hero.webp'));

  -- No update policy: an update touches no row.
  perform set_config('request.jwt.claims', pg_temp.claims(v_author)::text, true);
  execute 'set local role authenticated';
  update storage.objects set metadata = '{}'::jsonb
  where bucket_id = 'recipe-submission-photos' and name = v_path || '-hero.webp';
  get diagnostics v_n = row_count;
  execute 'reset role';
  v_report := v_report || format(E'\n%s AC-8 stored files can''t be updated in place (%s rows)',
    case when v_n = 0 then 'PASS' else 'FAIL' end, v_n);

  -- The save accepts the path, and puts photo screening in pending.
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_author), format(
    $q$select public.save_recipe_submission(%L, 'Photo Sour', %s, 'Shake.', null, 'alcoholic', null, %L, 'en', null)$q$,
    v_sub, v_ing, v_path));
  select count(*) into v_n from public.recipe_submissions s
  where s.id = v_sub and s.photo_path = v_path and s.photo_screening = 'pending';
  v_report := v_report || format(E'\n%s AC-8 save stores the photo path with photo screening pending (%s)',
    case when v_res = 'ok' and v_n = 1 then 'PASS' else 'FAIL' end, v_res);

  select s.updated_at into v_updated from public.recipe_submissions s where s.id = v_sub;

  -- AC-11: approve refuses an image URL that isn't this recipe's own copy.
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_admin), format(
    $q$select public.admin_approve_recipe_submission(%L, %L, %L, 'Photo Sour', 'Shake.', null, 'alcoholic', null, %s, '[]'::jsonb, null, false, null, false, null, null, %L)$q$,
    v_sub, v_updated, v_recipe, v_recipe_ing, 'https://example.com/evil.webp'));
  v_report := v_report || format(E'\n%s AC-11 approve with a foreign image URL gets invalid_image (%s)',
    case when v_res = 'invalid_image' then 'PASS' else 'FAIL' end, v_res);

  v_url := 'https://ctuzjhhpnkkhooneporu.supabase.co/storage/v1/object/public/recipe-images/recipes/'
    || v_recipe::text || '/' || v_hash || '-hero.webp';
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_admin), format(
    $q$select public.admin_approve_recipe_submission(%L, %L, %L, 'Photo Sour', 'Shake.', null, 'alcoholic', null, %s, '[]'::jsonb, null, false, null, false, null, null, %L)$q$,
    v_sub, v_updated, v_recipe, v_recipe_ing, v_url));
  v_report := v_report || format(E'\n%s AC-11 approve before the copied files exist gets invalid_image (%s)',
    case when v_res = 'invalid_image' then 'PASS' else 'FAIL' end, v_res);

  -- With both copies present, approve sets the image as admin_upload.
  insert into storage.objects (bucket_id, name)
  values
    ('recipe-images', 'recipes/' || v_recipe::text || '/' || v_hash || '-hero.webp'),
    ('recipe-images', 'recipes/' || v_recipe::text || '/' || v_hash || '-card.webp');
  v_res := pg_temp.try_as('authenticated', pg_temp.claims(v_admin), format(
    $q$select public.admin_approve_recipe_submission(%L, %L, %L, 'Photo Sour', 'Shake.', null, 'alcoholic', null, %s, '[]'::jsonb, null, false, null, false, null, null, %L)$q$,
    v_sub, v_updated, v_recipe, v_recipe_ing, v_url));
  select count(*) into v_n from public.recipes r
  where r.id = v_recipe and r.image_url = v_url and r.image_origin = 'admin_upload'
    and r.source = 'community' and r.submitted_by = v_author;
  v_report := v_report || format(E'\n%s AC-11 approve with the copied photo sets image_url, admin_upload, community, credit (%s)',
    case when v_res = 'ok' and v_n = 1 then 'PASS' else 'FAIL' end, v_res);

  -- AC-6: the author read returns the photo path as null once approved.
  perform set_config('request.jwt.claims', pg_temp.claims(v_author)::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from public.fetch_my_recipe_submissions() m
  where m.id = v_sub and m.status = 'approved' and m.photo_path is null;
  execute 'reset role';
  v_report := v_report || format(E'\n%s AC-6 approved row hides the private photo path from the author',
    case when v_n = 1 then 'PASS' else 'FAIL' end);

  raise exception 'recipe_submission_photos_check report:%', v_report;
end;
$check$;

rollback;
