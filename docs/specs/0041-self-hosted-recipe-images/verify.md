# Verify: Self hosted recipe images · spec 0041 · updated 2026-10-26
_Steps derived from spec 0041 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Before you start: run `20261026120000_recipe_images.sql`, `20261026130000_recipe_image_orphan_sweep.sql`, and `20261026140000_recipe_detail_cocktaildb_credit.sql` in the SQL editor (in that order), and deploy `cleanup-orphan-recipe-images`.

## UI / manual
- [ ] Sign in as admin, create a recipe, pick a 1200 x 900 JPEG, save → both `recipes/<id>/<hash>-hero.webp` (900px) and `-card.webp` (400px) exist in the bucket, and the recipe's `image_origin` is `admin_upload` → AC-2
- [ ] The admin form has no free text image URL field → AC-2
- [ ] Pick a GIF, a 20 MB JPEG, and a 500 x 900 PNG in turn → each shows its own localized message (check `/es/admin` too) and nothing uploads → AC-3
- [ ] In Safari (no WebP encoding), pick a valid JPEG → the "can't save WebP" message shows and nothing uploads → AC-3
- [ ] Edit that recipe and replace the image → a new hash pair appears, the old pair stays, and the detail page shows the new image right away → AC-4
- [ ] Remove the image and save → `image_url` is null, `image_origin` is `admin_upload`, web and mobile show the placeholder → AC-5
- [ ] On web, a recipe card with a bucket image loads the `-card.webp` URL directly (not `/_next/image`); the detail hero loads through `/_next/image` → AC-10, AC-11
- [ ] On mobile, a recipe card loads the `-card.webp` URL; the detail header loads the hero → AC-10
- [ ] Page source of that recipe: JSON-LD `image` and `og:image` use the hero URL → AC-10
- [ ] A TheCocktailDB recipe's detail page (web and mobile) shows "Recipe and image from TheCocktailDB" linking to https://www.thecocktaildb.com; a `custom:` recipe and an admin recipe show no credit; `/es` shows the Spanish line → AC-14

## Commands
- [ ] As a signed in non admin, `supabase.storage.from('recipe-images').upload('recipes/<uuid>/0123456789abcdef-hero.webp', blob)` → rejected (403) → AC-1
- [ ] Upload a JPEG to the bucket as admin → rejected by the bucket's mime type rule; upload under `catalog/...` as admin → rejected → AC-1
- [ ] `select admin_set_recipe_image('<id>', '<url>')` as a non admin → `not admin`; as admin with another recipe's path → `invalid image url`; with a hero whose card is missing → `image files missing` → AC-1, AC-2
- [ ] `update recipes set image_origin = null where image_url is not null` (one row, in a rolled back transaction) → fails `recipes_image_origin_consistency_check` → AC-15
- [ ] After the migration: `select count(*) from recipes where image_url is not null and image_origin is null` → 0; catalog rows on TheCocktailDB have `image_source_url = image_url` → AC-15
- [ ] Upload an image for a custom recipe, then run `pnpm --filter @bartendingapp/import-job import:custom` and `import` twice each → the image columns are unchanged; remove it, rerun both → still removed → AC-5, AC-6
- [ ] `pnpm --filter @bartendingapp/import-job import` (no flag) → new or changed thumbs are `external_hotlink` with `image_source_url` set; a `catalog_copy` with an unchanged thumb stays `catalog_copy` → AC-9
- [ ] `import --copy-images` (only once TheCocktailDB says yes) → summary line shows copied; run again → `0 copied, N unchanged` and no uploads → AC-7
- [ ] `import --copy-images` with one thumb made to 404 (fixture) → that recipe is `external_hotlink`, the warning names its `source_id`, the import finishes, the summary shows `1 failed` → AC-8 (also covered by `catalogImages.test.ts`)
- [ ] `pnpm --filter @bartendingapp/import-job migrate:images --dry-run` → lists every non TheCocktailDB hotlink with its id; run without the flag → each moves to `recipes/<id>/…` as `admin_upload`, failures print id and URL; run again → `0 migrated, 0 failed` → AC-13
- [ ] Once migrate reports 0 remaining, the Imgur entries are removed from `apps/web/next.config.ts` → AC-13
- [ ] POST to `cleanup-orphan-recipe-images` with `{"dryRun": true}` and the `secret_key` Vault secret on the `apikey` header → lists only pairs older than 24 hours that no recipe references (the old pair from the replace step after a day, never the current one); without the flag it deletes them → AC-12
- [ ] `select jobname, schedule from cron.job where jobname = 'orphan-recipe-image-cleanup'` → `45 4 * * *` → AC-12

## Value sourcing
- [ ] Recipe id in the path: create a new recipe with an image → the path uses the id `admin_upsert_recipe` returned; break the network after the details save, then save again → still one recipe, image under that same id
- [ ] Hash: pick the same file twice on two recipes → same 16 hex hash both times
- [ ] Hero side: a 700 x 900 source gives a 700px hero; a 3000 x 2000 source gives 1000px
- [ ] Public hero URL: the stored `image_url` opens in a private window
- [ ] Whether to copy: change one stored `image_source_url` by hand, run `import --copy-images` → only that recipe copies
- [ ] Catalog storage key: copied files sit under `catalog/<idDrink>/`
- [ ] Catalog hero side: a copied 700px thumb is 700px, not upscaled
- [ ] Card URL: only `-hero.webp` bucket URLs swap to `-card.webp`; an Imgur URL ending in `-hero.webp` stays unchanged
- [ ] Credit show or hide: flip a test recipe's `source_id` to `custom:x` → the credit disappears
- [ ] Credit link: the link goes to `https://www.thecocktaildb.com`
- [ ] Sweep object age: a pair uploaded 1 hour ago with no recipe pointing at it is not listed by the dry run
- [ ] Sweep referenced: a referenced pair's card file is never listed (it resolves to its hero name)
- [ ] Legacy migration rows: a TheCocktailDB hotlink is never picked up by `migrate:images`
- [ ] Cache header: a bucket file's response has `cache-control: max-age=31536000`

## Acceptance-criteria coverage
- AC-1: commands 1 to 3 · AC-2: UI 1, 2, command 3, value sourcing 1 to 4 · AC-3: UI 3, 4 · AC-4: UI 5 · AC-5: UI 6, command 6 · AC-6: command 6 · AC-7: command 8 · AC-8: command 9 · AC-9: command 7 · AC-10: UI 7 to 9 · AC-11: UI 7 · AC-12: commands 13, 14 · AC-13: commands 10, 11 · AC-14: UI 10 · AC-15: commands 4, 5
