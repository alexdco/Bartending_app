# 0043. Recipe drink style, tips, and allergen sections

**Date**: 2026-10-29
**Status**: In Progress

## Summary

The recipe page gets four new sections below Instructions: Drink Style, Bartender tip, Presentation tip, and Allergen Information, on web and mobile. Style and tips are written once by Claude Haiku in English and Spanish, reviewed by you in a file, and then applied to the database. Admins can edit them later. Allergens are never written per recipe. Each ingredient is tagged once (reviewed the same way), and the page lists every allergen together with the ingredient it comes from, so the list can never disagree with the recipe.

## Requirements

**User stories**:
- As a home bartender, I want to know what style of drink this is and get a pro tip on making and serving it, so my drink comes out better.
- As a guest with a food allergy, I want to see which common allergens are in a recipe and which ingredient brings each one, so I can decide or swap safely.
- As an admin, I want to fix a tip or an ingredient's allergens without rerunning a script.

**Acceptance criteria**:
- **AC-1**: On the recipe detail page (web and mobile), a Drink Style section shows the translated family label (one of the fixed families) plus the style sentence. If the recipe has no family, the section is hidden. If it has a family but no sentence, only the label shows. For the `other` family, the label is hidden and only the sentence shows (the section is hidden if there is no sentence either).
- **AC-2**: A Bartender tip section shows the recipe's bartender tip (1 to 2 sentences, at most 240 characters). Hidden when the tip is empty.
- **AC-3**: A Presentation tip section shows the recipe's presentation tip (same limits as AC-2). Hidden when empty.
- **AC-4**: Section order on both platforms: Instructions → Drink Style → Bartender tip → Presentation tip → Allergen Information, then the existing recommendations and comments.
- **AC-5**: In the `es` locale, the style sentence and both tips show the Spanish text when it exists, and fall back to English when it is missing. The family label and all section headings come from the i18n message files in both locales.
- **AC-6**: The Allergen Information section always shows. It lists each allergen present as `Allergen (ingredient, ingredient)` using translated allergen labels and the localized ingredient names, in the fixed allergen order. When every ingredient is reviewed and none carries an allergen, it shows "None of the common allergens are in the listed ingredients." When any ingredient is not yet reviewed, or the recipe has no ingredients at all, it shows a line saying the information is incomplete (and still lists the allergens it does know). Staples (Ice, Water) count like any other ingredient. A disclaimer always shows: the list is based on the listed ingredients, brands vary, check product labels.
- **AC-7**: `pnpm --filter @bartendingapp/shared propose-recipe-notes` asks Haiku for family, style sentence, bartender tip, and presentation tip in EN and ES for each live recipe, and writes them to a review file. It never writes to the database. By default it covers only recipes missing any of the four EN values; `--all` covers every live recipe and prints a warning that applying will overwrite existing (possibly admin edited) text. It refuses to overwrite an existing review file unless `--force` is passed.
- **AC-8**: `pnpm --filter @bartendingapp/shared apply-recipe-notes` reads the reviewed file and calls `apply_recipe_notes`. The whole payload is validated (family in the fixed set; all three EN and all three ES texts present, non empty after trimming, and at most 240 characters; ids exist and are live) before any write; one bad row rejects everything. EN goes to `recipes`, ES to the existing `es` row in `recipe_translations`. When no `es` row exists, ES is skipped (the page falls back to EN), and the RPC returns the skipped ids, which the script prints. Only the service role can run it.
- **AC-9**: `pnpm --filter @bartendingapp/shared propose-ingredient-allergens` asks Haiku for each ingredient's allergens from the fixed set, plus a short reason for every flag, and writes a review file sorted by ingredient name, without touching the database (same `--all` and `--force` rules as AC-7). `apply-ingredient-allergens` validates the whole file and writes only `{id, allergens}` via `apply_ingredient_allergens` (service role only); the reasons are for review and are never sent. An empty list is stored as reviewed and none.
- **AC-10**: The admin recipe form (web) can edit family (select, including "none"), style sentence, bartender tip, and presentation tip in English. Saving a changed English value clears the matching Spanish value, so ES falls back to the new English. Invalid input (over 240 characters, unknown family) shows the error and saves nothing. Non admins are rejected by the RPC.
- **AC-11**: A new admin page, `/admin/ingredients` (linked in the admin nav), lists ingredients with name search, a "not reviewed" filter, and pagination. Each row has a checkbox for each of the 12 allergens plus a "none" toggle, and a per row Save that calls `admin_set_ingredient_allergens`. Non admins are rejected. The recipe page reflects the change on its next load.
- **AC-12**: The database rejects, whatever the write path, a family outside the set, an allergen outside the set, a null element inside `allergens`, a style sentence or tip that is blank or over 240 characters after trimming, and a style sentence on a recipe with no family.

## Decision

**Chosen option**: Option 2: Reviewed Haiku content in columns, allergens derived from ingredient tags.

Style and tips are stored as reviewed text columns (EN on `recipes`, ES on `recipe_translations`). Allergens are a reviewed `text[]` on `ingredients`, returned per ingredient by `fetch_recipe_detail` and summarized per recipe by one pure shared function.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `react-native-best-practices` (`callstackincubator/agent-skills`, `.agents/skills/react-native-best-practices/`) · `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Fixed sets** (one source of truth in `packages/shared`, mirrored by the SQL check constraints):
- `DRINK_STYLES` (`packages/shared/src/drinkStyle.ts`): `sour`, `highball`, `spirit_forward`, `fizz_collins`, `tiki`, `flip_cream`, `punch`, `shooter`, `hot`, `frozen`, `other`.
- `ALLERGENS` (`packages/shared/src/allergens.ts`), in display order: `egg`, `milk`, `tree_nuts`, `peanuts`, `gluten`, `soy`, `sulfites`, `fish`, `shellfish`, `celery`, `sesame`, `mustard`. `shellfish` covers crustaceans and molluscs.
- Labels for both live in `apps/web/messages/{en,es}.json` and `apps/mobile/src/i18n/locales/{en,es}.json`, keyed by the value. Never stored in the DB.

**Data model sketch** (no new tables):

| Table | Column | Type | Null | Constraint |
|---|---|---|---|---|
| `recipes` | `drink_style` | text | yes | `recipes_drink_style_check`: in `DRINK_STYLES` |
| `recipes` | `drink_style_note` | text | yes | `value = btrim(value) and char_length(value) between 1 and 240`; plus `drink_style_note is null or drink_style is not null` |
| `recipes` | `bartender_tip` | text | yes | same trimmed length check |
| `recipes` | `presentation_tip` | text | yes | same trimmed length check |
| `recipe_translations` (PK `recipe_id, locale`) | `drink_style_note`, `bartender_tip`, `presentation_tip` | text | yes | same trimmed length check |
| `ingredients` | `allergens` | text[] | yes | `allergens <@ array[...ALLERGENS] and array_position(allergens, null) is null`. `null` = not reviewed, `'{}'` = reviewed, none |

Every write path trims text and turns blank into null before storing. The 240 limit counts characters (Postgres `char_length`); the zod validators count code points (`[...s].length`) to match. RPCs store `allergens` deduped and sorted.

A recipe's allergens are derived, never stored: `recipe_ingredients` (N) → `ingredients.allergens`. No index changes, since every read is by recipe id or a small admin page. `recipe_translations.name` and `.instructions` are `not null`, so the apply step never inserts a notes only `es` row.

**State transitions**: `ingredients.allergens`: `null` (not reviewed) → `'{}'` or a non empty list (reviewed), via apply or the admin editor. It never goes back to `null` through the app (a newly created ingredient starts at `null`).

**API surface** (Postgres RPCs over supabase-js; one migration):

| RPC | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `fetch_recipe_detail(p_id, p_locale)` | changed, drop + recreate with grants | unchanged | carries forward the full body of `20261026140000_recipe_detail_cocktaildb_credit.sql` (13 columns, `stable`, `set search_path = ''`, `revoke ... from public`, grant to anon and authenticated) and appends `drink_style`, `drink_style_note`, `bartender_tip`, `presentation_tip` (ES via `coalesce(rt.x, r.x)`; in `en` the `rt` join is empty, so EN is returned); adds `'allergens', i.allergens` to each `ingredients` object | anon, authenticated (unchanged) | none new |
| `apply_recipe_notes(proposals jsonb)` | new, security definer, `pg_advisory_xact_lock(hashtext('apply_recipe_notes'))` | array of `{id, drink_style, drink_style_note, bartender_tip, presentation_tip, es: {drink_style_note, bartender_tip, presentation_tip}}` | `uuid[]`: ids whose ES was skipped (no `es` row) | service_role only | `22023` on any invalid row or an unknown or deleted id (nothing written) |
| `apply_ingredient_allergens(proposals jsonb)` | new, security definer, `pg_advisory_xact_lock(hashtext('apply_ingredient_allergens'))` | array of `{id, allergens}`; a jsonb `null` or non array `allergens` is rejected explicitly before the cast to `text[]` | void | service_role only | `22023` on unknown allergen, unknown id, or null or non array list |
| `admin_set_recipe_notes(p_recipe_id, p_drink_style, p_drink_style_note, p_bartender_tip, p_presentation_tip)` | new, security definer | nullable text; blank trimmed to null | void | `user_preferences.is_admin` (same check as `admin_upsert_recipe`) | `not authorized`, length or family errors |
| `admin_set_ingredient_allergens(p_ingredient_id, p_allergens text[])` | new, security definer | non null text[] (may be empty) | void | `is_admin` | `not authorized`, unknown allergen, null list |
| Admin ingredient list | plain `from('ingredients').select('id, name, allergens', { count: 'exact' })`, `ilike` on `name` (EN only, `%` `_` `\` escaped), optional `.is('allergens', null)`, `order('name').order('id')`, `.range()` pages of 50 | | rows + total count | existing `ingredients_select` policy (`using (true)`) | |

`admin_set_recipe_notes` compares each new (trimmed) EN value with the stored one with `is distinct from`; for each changed field it sets that column to null on every `recipe_translations` row of the recipe (AC-10). Spanish is not editable in admin; it is fixed by a reviewed `--all` rerun or by hand in SQL.

**Admin recipe form data path** (`packages/shared/src/adminRecipes.ts`):
- `fetchAdminRecipeDetail` selects the four new columns.
- `AdminRecipeFormValues` gains `drinkStyle: DrinkStyle | null`, `drinkStyleNote`, `bartenderTip`, `presentationTip` (`string`, empty means none).
- `validateAdminRecipeForm` adds the family check and the trimmed 240 check, plus "sentence needs a family".
- `saveAdminRecipe` chains the calls: `admin_upsert_recipe` → `admin_set_recipe_notes(data.id, ...)`. If the second call fails, it returns `{ ok: false, reason: 'notes_failed', id }`. The form then switches to editing that id (navigating to its edit page on the create path), so a retry updates the saved recipe instead of creating a duplicate.
- The form shows a hint when any of the recipe's ingredients has `allergens` null ("N ingredients have no allergen review yet"), linking to `/admin/ingredients`.

**Script mechanics** (all four scripts, in `packages/shared/scripts/`, entries in `packages/shared/package.json`):
- Resolve file paths with the same Windows safe `new URL(...).pathname.replace(/^\/([A-Za-z]:)/, "$1")` trick as `apply-regions.ts`, and create `tagging/` with `mkdirSync(..., { recursive: true })`.
- Propose writes the whole file after each batch (resumable within one run), but refuses at start if the file exists unless `--force` is passed.
- Each Haiku item echoes its `id`; the script checks that the returned id set equals the batch's, retrying the batch on mismatch, and drops the batch with a logged error after 3 failures.
- Review file shapes: recipe notes `[{ id, name, drink_style, drink_style_note, bartender_tip, presentation_tip, es: {...} }]`; allergens `[{ id, name, allergens, reasons: { <allergen>: "<why>" } }]`, sorted by name. `name` and `reasons` are for the reviewer and are stripped before the RPC.
- A stale file (DB changed since propose) is only guarded by the id checks. Running apply soon after review is your responsibility.
- Ingredient propose covers every ingredient, including staples and ingredients no live recipe uses, so the admin list never shows a permanent "not reviewed" backlog.

**Mobile i18n**: the new components use `useTranslation()` from `react-i18next` (already set up in `apps/mobile/src/i18n`), and `use-recipe-detail.ts` already passes the locale to `fetchRecipeDetail`. The hardcoded "Instructions" heading in `app/recipe/[id]/index.tsx` moves to the i18n files in the same change, so the five headings match.

**Admin ingredients page behavior**: a row whose `allergens` is null shows no box checked and "none" off, with a "Not reviewed" badge. Checking "none" clears every allergen box; checking any allergen box turns "none" off. Save is enabled only when the row is in a reviewed state ("none" on, or at least one box checked), so the app never writes null. A saved row stays in view (even under the "not reviewed" filter) until the next refetch or page change.

**Shared code** (`packages/shared`, exported from `index.ts` unless noted):
- `RecipeDetail` gains `drinkStyle: DrinkStyle | null`, `drinkStyleNote`, `bartenderTip`, `presentationTip` (`string | null`); `RecipeIngredientDetail` gains `allergens: readonly Allergen[] | null`. `fetchRecipeDetail` maps them, narrowing unknown values to null with type guards (no `any`).
- `summarizeRecipeAllergens(ingredients): RecipeAllergenSummary`, pure: `{ status: 'none' | 'present', isComplete: boolean, entries: readonly { allergen, ingredientNames: readonly string[] }[] }`, entries in `ALLERGENS` order, ingredient names in recipe order with duplicates removed. Both apps render from it.
- `recipeNoteProposals.ts` and `ingredientAllergenProposals.ts`: zod schemas plus `validate...` functions used by the propose (on output) and apply (before the RPC) scripts, matching `regionProposals.ts`.
- Scripts in `packages/shared/scripts/`: `propose-recipe-notes.ts`, `apply-recipe-notes.ts`, `propose-ingredient-allergens.ts`, `apply-ingredient-allergens.ts`, plus `package.json` script entries. Review files go to `packages/shared/scripts/tagging/recipe-notes-proposals.json` and `.../ingredient-allergens-proposals.json`. The Anthropic SDK stays out of the `index.ts` barrel, as in `recipeClassification.ts`.
- Haiku prompts: batches of 10 recipes (name, glass, ingredients with measures, instructions) or 25 ingredients (name, category). Structured output via `zodOutputFormat`, 3 retries with backoff, and the same Haiku model id the existing classification scripts use. The allergen prompt is told to flag when in doubt (e.g. cream liqueurs → milk, orgeat and amaretto → tree_nuts, beer → gluten, wine and vermouth → sulfites, Worcestershire → fish, Clamato → shellfish), since a false positive is safer than a miss and you review every flag.

**UI**:
- Web: new `apps/web/src/recipes/recipe-notes-sections.tsx` (Drink Style and both tips) and `apps/web/src/recipes/allergen-section.tsx`, server components rendered in `app/[locale]/recipes/[slug]/page.tsx` right after `<RecipeMeasures>` (which holds Instructions) and before `<RecommendationsSection>`. Each uses the existing `Text` heading/body pattern of the Instructions section. New `recipe.*` message keys in en/es.
- Mobile: matching `apps/mobile/src/recipes/recipe-notes-sections.tsx` and `allergen-section.tsx` in `app/recipe/[id]/index.tsx` after the Instructions view, using `styles.section` and the mobile i18n.
- Admin (web): four fields added to `admin-recipe-form.tsx` (family `<select>` with a "None" option, three textareas with a live `n/240` counter). New `app/[locale]/admin/ingredients/page.tsx` plus `admin/admin-ingredient-list.tsx` and `use-admin-ingredients.ts` (TanStack Query, per row mutation with a saving/saved/error state), and an Ingredients link in `admin-nav.tsx`. Gated the way the existing admin pages are.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Recipe page | family label | `recipes.drink_style` → i18n key `recipe.drinkStyles.<value>` |
| Recipe page | style sentence, both tips | `fetch_recipe_detail`: `coalesce(rt.<col>, r.<col>)`, locale from the existing `p_locale` |
| Recipe page | allergen entries and status | `summarizeRecipeAllergens` over `ingredients[].allergens` + `ingredients[].name` (already localized by the RPC) |
| Recipe page | allergen label, none line, incomplete line, disclaimer | i18n message files |
| Propose scripts | EN + ES text, family, allergens, reasons | Haiku structured output; inputs from `recipes`, `recipe_ingredients`, `ingredients` via the service role client |
| Propose scripts | which rows to include | any of the four EN values null (recipes) / `allergens is null` (ingredients); `--all` flag overrides |
| Apply RPCs | target rows | `id` in each reviewed proposal |
| `admin_set_recipe_notes` | which ES fields to clear | `is distinct from` between new input and stored EN column |
| Admin ingredients page | rows, filter, page | `ingredients` table, search input, "not reviewed" toggle, page index |

**Key invariants**:
- A recipe's allergen list is exactly the union of its ingredients' `allergens`; it is never stored on `recipes`.
- "None" is shown only when the recipe has at least one ingredient and every ingredient has a non null `allergens`.
- Nothing outside this spec writes the new columns: `import_catalog`, `import_custom_recipes`, and `admin_upsert_recipe` insert and update named columns only, `translate-catalog.ts` upserts only its named `recipe_translations` columns, and the ingredient `on conflict (normalized_name) do update set name` path leaves `allergens` alone. New ingredients start at `allergens` null. A retranslation of name or instructions does not touch the ES tips.
- Applying notes bumps `recipes.updated_at` through the existing trigger; that's acceptable (the sitemap `lastmod` moving forward is correct, since the page content changed).
- The disclaimer is always rendered.
- Every stored family or allergen value is in its fixed set; every style sentence and tip is 1 to 240 characters (DB checks, AC-12).
- Propose scripts never write to the database; apply scripts write only reviewed rows, all or nothing.

**Security model**: All new content is public catalog data, read through `fetch_recipe_detail` (anon and authenticated, `security invoker` as today). Bulk writes (`apply_*`) are `security definer`, `search_path = ''`, execute revoked from public, anon, and authenticated, granted to `service_role` only. Admin writes (`admin_set_*`) are `security definer` with the same `user_preferences.is_admin` check as `admin_upsert_recipe`, and execute is granted to `authenticated`. No PII. Allergen info is informational, not a medical guarantee, which is why the disclaimer is mandatory.

**Configuration required**: none new. The scripts use the existing `ANTHROPIC_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`, as `tag-regions.ts` does.

**Critical test scenarios**:
- Happy path: a recipe with all four values and reviewed ingredients renders the four sections in order with EN text, and with ES text in `es`. Verifies **AC-1** to **AC-5**.
- `summarizeRecipeAllergens` (vitest): egg white + orgeat → `Egg (egg white)`, `Tree nuts (orgeat)`; all `'{}'` → none; one `null` → incomplete with the known entries kept; zero ingredients → incomplete; two ingredients sharing an allergen are listed together in recipe order. Verifies **AC-6**.
- Failure case: an apply payload with one 241 character tip, a whitespace only tip, an unknown allergen, `["egg", null]`, or a deleted recipe id raises `22023` and changes no row. Verifies **AC-8**, **AC-9**, **AC-12**.
- Proposal validators (vitest): accept a good file, reject a bad family, an empty or whitespace string, a missing ES block, or a 241 code point Spanish string. Verifies **AC-7**, **AC-8**.
- No clobber: after an `import_catalog` run and an `admin_upsert_recipe` call, a recipe's notes and its ingredients' `allergens` are unchanged. Verifies the invariant behind **AC-6** and **AC-10**.
- Admin save partial failure: when `admin_set_recipe_notes` fails on create, `saveAdminRecipe` returns `notes_failed` with the id, and a retry updates that recipe (no duplicate). Verifies **AC-10**.
- Admin: editing the EN bartender tip clears only the ES bartender tip; the ES page then shows the new EN tip. Verifies **AC-10**, **AC-5**.
- Auth/permission: anon or a non admin calling `admin_set_*` gets `not authorized`; calling `apply_*` as authenticated gets permission denied. Verifies **AC-8** to **AC-11**.

## Build plan

Tracer Bullet: one migration lands the whole schema, then a single hand seeded recipe proves the thread from DB to both screens before the bulk content exists. Then the content pipelines thicken it, and the admin tools come last.

1. Migration `supabase/migrations/<timestamp>_recipe_style_tips_allergens.sql`: new columns and checks, `fetch_recipe_detail` drop + recreate with grants, the two `apply_*` RPCs, the two `admin_set_*` RPCs, grants. Apply it in the SQL editor, then regenerate `database.types.ts`. Satisfies **AC-8**, **AC-9**, **AC-10**, **AC-11**, **AC-12**.
2. Shared: `drinkStyle.ts`, `allergens.ts`, the `RecipeDetail` and `fetchRecipeDetail` changes, `summarizeRecipeAllergens` with tests. Satisfies **AC-1** to **AC-3**, **AC-5**, **AC-6**.
3. Web recipe page: `recipe-notes-sections.tsx`, `allergen-section.tsx`, wired into the page in order, en/es messages. Prove the thread by setting one recipe's four fields and two ingredients' allergens by hand in the SQL editor. Satisfies **AC-1** to **AC-6**.
4. Mobile recipe screen: the same two components via `useTranslation()`, the new i18n keys, and the "Instructions" heading moved to i18n; check parity against the same seeded recipe. Satisfies **AC-1** to **AC-6**.
5. Ingredient allergen pipeline: `ingredientAllergenProposals.ts` (+ tests), `propose-ingredient-allergens.ts`, `apply-ingredient-allergens.ts`, `package.json` entries. You run propose, review every flag and reason, then apply. Satisfies **AC-9**, **AC-6**.
6. Recipe notes pipeline: `recipeNoteProposals.ts` (+ tests), `propose-recipe-notes.ts`, `apply-recipe-notes.ts`, `package.json` entries. First run a read only count of live recipes with no `es` row in `recipe_translations` (run `translate-catalog` for them first if any). Then you run propose, review EN and ES, and apply; the script prints any skipped ES ids. Satisfies **AC-7**, **AC-8**, **AC-1** to **AC-5**.
7. Admin recipe form: the `adminRecipes.ts` changes (fetch, form values, validation, chained save with `notes_failed`), the four fields with counters, and the unreviewed ingredient hint. Satisfies **AC-10**.
8. Admin ingredients page (gated like `admin/recipes/page.tsx`), `use-admin-ingredients.ts`, `admin.*` message keys (nav label, page title, meta title), and the nav link. Satisfies **AC-11**.

## Consequences

**Positive**:
- Allergens follow the ingredient list automatically, including for recipes added later by import or admin.
- Each ingredient is reviewed once (about 290 rows) instead of about 430 recipe paragraphs, and the editor fixes any single ingredient everywhere at once.
- Style family is structured, so filtering or grouping by style later needs no new data.

**Negative / tradeoffs**:
- About 430 × 2 languages of generated text to review before it ships; until it's applied, the style and tip sections are hidden.
- `sulfites` will flag most wine and vermouth drinks, and generic names ("liqueur") get flagged when in doubt. The list is cautious, not minimal.
- An ingredient added later shows "incomplete" on every recipe that uses it until someone tags it in the admin page.
- An English edit drops that field's Spanish text to an English fallback until the next reviewed backfill run.
- The admin save is two RPC calls (upsert, then notes). If the second fails, the recipe is saved without the note change and the form shows the error; saving again is safe.

**Neutral**:
- `fetch_recipe_detail` changes its return type, so it is dropped and recreated (same pattern as spec 0041). Clients should deploy after the migration.
- Two new review files under `packages/shared/scripts/tagging/`.

## Follow-up

- [ ] The `tagging/` review files are generated at run time and not committed, matching `popular-by-region-proposals.json`. Add `packages/shared/scripts/tagging/` to `.gitignore` if it isn't already covered.
- [ ] Later, maybe: filter or browse by drink style family on search (data is ready, no UI planned here).
