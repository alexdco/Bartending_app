-- Store screenshot demo data (spec 0060, AC-3). Run it yourself in the
-- Supabase SQL editor before every capture run. Safe to run again: it always
-- leaves the same rows.
--
-- Before the first run, create both users in the Auth dashboard (email and
-- password, email confirmed, not admins).
--
-- For each demo user it:
--   * replaces pantry_items with the pinned ingredients below,
--   * replaces favorites with the pinned recipes below,
--   * clears shopping_list_items,
--   * deletes ai_generation_quota rows, so a failed run never blocks a rerun
--     the same day.
-- If either email is missing from auth.users it raises and changes nothing.

begin;

do $$
declare
  demo_emails constant text[] := array[
    'screenshots-ios@bartendingapp.dev',
    'screenshots-android@bartendingapp.dev'
  ];

  -- Fifteen ingredients. Together they make Negroni, Martini, Dry Martini,
  -- Gimlet, Gin Tonic, Daiquiri, and Gin Fizz, so "You can make now" shows at
  -- least four recipes with images, and the pantry clears the generate
  -- minimum (two ingredients).
  pantry_ingredient_ids constant uuid[] := array[
    'c07b391f-f57f-48c1-b880-80c5918cc55c', -- Gin
    'c4f0b968-5c08-4240-851a-05ca355616fc', -- Dry Vermouth
    'e595ca2f-5f95-435a-bbd8-d1c121e351ab', -- Sweet Vermouth
    '2104121e-8931-4cba-909c-fa525264de84', -- Campari
    '11cae9b9-bb70-4dbb-863a-c2d1381203f1', -- Light Rum
    'c71abe62-9496-4acb-b6c3-ba106b597ca6', -- Tonic Water
    '3efde722-9813-484c-ab2d-5ae66b204087', -- Carbonated Water
    '0169184e-a582-4a0e-8b31-b9c8860df4dd', -- Lime Juice
    'df0c113f-4caf-446c-ba68-904cd1026c31', -- Lime
    '0354349c-7c2d-4646-a023-185e441dd5a2', -- Lemon
    '32cbbed2-b9e7-4442-be79-42a8f8a866d1', -- Lemon Peel
    '66348635-2891-4898-9702-8d7f1211176f', -- Sugar Syrup
    '037951a2-8497-4e86-af59-85e8cafa8824', -- Powdered Sugar
    'da9f11d1-ffc0-4630-aa59-9d5774cc5c2f', -- Olive
    'f6cc9219-2280-4f47-87a3-fdd611d48afe'  -- Ice
  ];

  -- Slice 2 replaces the first entry with FEATURED_RECIPE_ID once it is
  -- pinned in capture-all.yaml (AC-12).
  favorite_recipe_ids constant uuid[] := array[
    'b7e87815-6316-4b9e-988c-6b3d4dfb44fe', -- Negroni
    'c648453b-0277-4e43-8aff-878c22650c3c', -- Martini
    '8aa3678a-720a-4873-a06b-d49d8db5c70e'  -- Gimlet
  ];

  demo_user_ids uuid[];
  missing_emails text[];
begin
  select array_agg(e)
  into missing_emails
  from unnest(demo_emails) as e
  where not exists (select 1 from auth.users u where u.email = e);

  if missing_emails is not null then
    raise exception 'Demo users missing from auth.users: %. Create them in the Auth dashboard first.',
      array_to_string(missing_emails, ', ');
  end if;

  select array_agg(u.id)
  into demo_user_ids
  from auth.users u
  where u.email = any (demo_emails);

  delete from public.pantry_items where user_id = any (demo_user_ids);
  delete from public.favorites where user_id = any (demo_user_ids);
  delete from public.shopping_list_items where user_id = any (demo_user_ids);
  delete from public.ai_generation_quota where user_id = any (demo_user_ids);

  insert into public.pantry_items (user_id, ingredient_id)
  select u, i
  from unnest(demo_user_ids) as u
  cross join unnest(pantry_ingredient_ids) as i;

  insert into public.favorites (user_id, recipe_id)
  select u, r
  from unnest(demo_user_ids) as u
  cross join unnest(favorite_recipe_ids) as r;
end
$$;

commit;
