# Verify: Admin recipe management · spec 0030 · updated 2026-09-30
_Steps derived from spec 0030 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [ ] As the admin, visit `/admin/recipes` → see a paginated, newest first list with name, glass, alcoholic status, and a `catalog`/`admin` source badge per row → AC-1
- [ ] Type a partial recipe name into the search box on `/admin/recipes` → the list filters to matching names only → AC-1
- [ ] Open `/admin/recipes/new`, fill name, instructions, alcoholic status, and one ingredient, submit → redirected to `/admin/recipes`, new recipe visible in the list with the `admin` source badge, and visible in public search (`/search`) → AC-2
- [ ] On the same new recipe, add two new ingredient names and one tag name that already exists elsewhere in the catalog → save succeeds; the existing tag is reused (not duplicated) → AC-2, AC-4
- [ ] Open an existing `catalog` sourced recipe's edit form (`/admin/recipes/[id]/edit`) → fields, ingredients, and tags are pre filled with its current values → AC-3
- [ ] Edit that catalog recipe's instructions and save → the recipe updates in place, its source badge still reads `catalog`, and the new instructions show on its public detail page → AC-3
- [ ] Type an ingredient name differing only in case/whitespace from an existing ingredient → save reuses the existing ingredient row rather than creating a duplicate → AC-4
- [ ] From the list or an edit form, soft delete a recipe → it disappears from `/admin/recipes`' default view, from `/search`, and from browse/recommendations immediately → AC-5
- [ ] Soft delete a recipe that a test user has favorited → the delete succeeds and that user's favorites entry still references the recipe without erroring → AC-5
- [ ] While signed in as a non admin user, request `/admin/recipes` directly by URL → redirected to the locale home with no admin markup or recipe data ever rendered → AC-6
- [ ] As a signed out guest, request `/admin/recipes` directly by URL → redirected to the locale home the same way, with no error message revealing the page exists → AC-6
- [ ] Submit the add form with the name field empty → inline validation error shown, nothing saved → AC-8
- [ ] Submit the add form with instructions over 10,000 characters → inline validation error shown, nothing saved → AC-8
- [ ] Submit the add form with zero ingredients (all rows blank) → inline validation error shown, nothing saved → AC-8

## Commands

- [ ] `select source_id, source from recipes where id = '<newly created recipe id>'` → `source_id` starts with `admin-`, `source = 'admin'` → AC-2
- [ ] `select source from recipes where id = '<edited catalog recipe id>'` after an edit → still `'catalog'` → AC-3
- [ ] As a non admin/anon session, `insert into recipes (...) values (...)` directly → rejected by RLS → AC-7
- [ ] As a non admin session, `select rpc('admin_upsert_recipe', ...)` directly → raises "not authorized", nothing written → AC-7
- [ ] `select rpc('admin_upsert_recipe', p_name => 'Test', p_ingredients => '[]'::jsonb, ...)` (zero ingredients) → raises before any row is written; confirm no orphaned `recipes` row exists after the error → AC-8

## Acceptance-criteria coverage

- AC-1 … covered by the list/search manual steps
- AC-2 … covered by the add form manual step and the `source`/`source_id` SQL check
- AC-3 … covered by the edit form pre fill and post save `source` SQL check
- AC-4 … covered by the duplicate-tag and case/whitespace ingredient manual steps
- AC-5 … covered by the soft delete and favorited-recipe soft delete manual steps
- AC-6 … covered by the non admin and guest redirect manual steps
- AC-7 … covered by the direct insert and direct RPC call SQL checks
- AC-8 … covered by the three validation manual steps and the zero ingredients SQL check
