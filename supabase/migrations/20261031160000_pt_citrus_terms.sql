-- Brazilian citrus terms for the Portuguese catalog (spec 0045, data fix).
--
-- The first translation run mixed the fruits up: in Brazil lime is "limão" and
-- lemon is "limão-siciliano", but Lemon Juice and Lime Juice both came out as
-- "Suco de limão" and Lime as "Lima", a different fruit.
--
-- 1. Ingredient and tag names are corrected by id. Their hashes still match the
--    English, so a later run keeps these hand written names.
-- 2. Recipes whose English mentions lemon or lime have their hash cleared, so
--    the next translate-catalog --locale pt redoes exactly those, with the
--    LOCALE_AI_TERMS rule. "limão" in their text can mean either fruit, so a
--    text replace can't fix them.
-- 3. Orangeade is not "limonada".
--
-- Only touches pt rows. Ids that don't exist in a fresh database update nothing.

update public.ingredient_translations it
set name = v.name
from (values
  ('0354349c-7c2d-4646-a023-185e441dd5a2'::uuid, 'Limão-siciliano'),
  ('df0c113f-4caf-446c-ba68-904cd1026c31'::uuid, 'Limão'),
  ('f5d957ff-55f9-4f2b-a459-501d2b741513'::uuid, 'Suco de limão-siciliano'),
  ('0169184e-a582-4a0e-8b31-b9c8860df4dd'::uuid, 'Suco de limão'),
  ('03f20445-db51-4a8f-9e0b-556a43abad8a'::uuid, 'Suco de limão-siciliano fresco'),
  ('95e6009a-9096-47ec-84b3-6f36f2c4f2d9'::uuid, 'Suco de limão fresco'),
  ('bc92c287-6efd-48e1-a5e5-6dae8ba29e57'::uuid, 'Suco de limão-siciliano fresco (aproximadamente um espremido)'),
  ('cea9fa00-9726-4760-893d-06a0226bab46'::uuid, 'Suco de limão fresco (aproximadamente um espremido)'),
  ('fb9908b4-6af3-4503-97cb-9b8aa10bc06d'::uuid, 'Suco de limão fresco (aproximadamente ½ limão)'),
  ('32cbbed2-b9e7-4442-be79-42a8f8a866d1'::uuid, 'Casca de limão-siciliano'),
  ('7f5e5b08-faa7-4770-8a54-d74936a4ba7a'::uuid, 'Casca de limão'),
  ('aaa12101-d4ea-4e34-b7be-f0555eef577d'::uuid, 'Twist de limão-siciliano'),
  ('55c1a04e-ae18-4cd1-a307-c7e2df96a6a4'::uuid, 'Limonada siciliana'),
  ('a3976b23-3092-4bd6-9a28-d78f0576c915'::uuid, 'Limonada'),
  ('bb600caf-7f4e-4472-9222-cc52c3845540'::uuid, 'Refrigerante de limão'),
  ('92d40536-4760-4067-abde-37b5167de943'::uuid, 'Refrigerante de limão-siciliano amargo'),
  ('4c931f28-f483-46be-a96c-1490ae8702df'::uuid, 'Suco em pó de limão-siciliano')
) as v(id, name)
where it.ingredient_id = v.id
  and it.locale = 'pt';

update public.tag_translations tt
set name = v.name
from (values
  ('369cafed-4f7d-40da-98f6-2e8bf119215e'::uuid, 'Limão-siciliano'),
  ('2ea410fb-466a-41c0-9f61-bdcfe8311e3b'::uuid, 'Limão'),
  ('167f3935-f4a2-4939-9039-07fd5683172c'::uuid, 'Suco de limão-siciliano'),
  ('b67dbd31-b272-408e-91e5-a8afbda27561'::uuid, 'Suco de limão'),
  ('f7a6dae2-33db-4078-9908-c44d1bdc238f'::uuid, 'Limonada siciliana'),
  ('862b54ef-fb63-42f4-8051-b5eaa29732c2'::uuid, 'Refrigerante de limão')
) as v(id, name)
where tt.tag_id = v.id
  and tt.locale = 'pt';

update public.recipe_translations rt
set source_name_hash = ''
from public.recipes r
where r.id = rt.recipe_id
  and rt.locale = 'pt'
  and r.deleted_at is null
  and (r.name || ' ' || r.instructions || ' ' || coalesce(r.glass, '')) ~* '(lemon|\mlime)';

update public.recipe_translations
set name = 'Laranjada'
where recipe_id = '0059b3a8-ee3e-4cc7-8ac5-062eaca3dea6'
  and locale = 'pt';
