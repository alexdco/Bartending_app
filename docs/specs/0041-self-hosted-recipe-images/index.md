# 0041. Self hosted recipe images

**Date**: 2026-10-26
**Status**: Accepted

## Summary

Recipe images move into our own public Supabase Storage bucket (a file store that serves files by URL), `recipe-images`, instead of loading from TheCocktailDB, Imgur, or any pasted link. You, as admin, upload a photo in the admin recipe form; the browser crops it square and saves two WebP sizes (a 1000px hero and a 400px card). The import job can copy TheCocktailDB's images into the bucket the same way, but that copy step stays switched off until TheCocktailDB confirms copying is allowed. Each recipe records where its image came from, so the import never overwrites an image you uploaded, and a daily job deletes files nothing points to anymore.

## Requirements

**User stories**:
- As the site admin, I want to upload a photo for any recipe (including the 21 custom recipes that have none), so every recipe can have an image we control.
- As the site admin, I want to replace or remove a recipe's image, and have the import respect that, so my fixes stick.
- As any visitor, on web or mobile, I want recipe images to keep showing even when TheCocktailDB or Imgur is down or blocks hotlinks.
- As a mobile visitor, I want list and card images to be small files, so lists load fast on a phone connection.
- As the site owner, I want TheCocktailDB credited where its recipes appear, so we honor their terms.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: A public `recipe-images` bucket exists that accepts only `image/webp` files of at most 2 MB. Anyone can read files by public URL. Only a signed in admin (`public.is_current_user_admin()` true) can insert, select (for removal), or delete objects under `recipes/`, and only with names matching `recipes/<uuid>/<16 hex>-(hero|card).webp`. A non admin or guest upload is rejected by storage policy. Only the service role writes under `catalog/`.
- **AC-2**: In the admin recipe form (create and edit), the admin picks a JPEG, PNG, or WebP file of at most 15 MB whose short side is at least 600px. The browser center crops it to a square and encodes it again (dropping all metadata) into a hero WebP (side = the smaller of 1000px and the source short side) and a 400px card WebP, both named with the same 16 hex content hash. After the recipe saves, both files upload to `recipes/<recipe_id>/<hash>-hero.webp` and `-card.webp` with a one year cache header, and the recipe's `image_url` becomes the hero's public URL with `image_origin = 'admin_upload'`. The form no longer has a free text image URL field.
- **AC-3**: A file of the wrong type, over 15 MB, or under 600px on its short side shows a clear, localized message and uploads nothing. If the browser can't encode WebP, the form says so and uploads nothing.
- **AC-4**: Replacing an image writes a new pair of files under a new hash (files are never overwritten), and the page then shows the new image with no stale cached copy.
- **AC-5**: The admin can remove a recipe's image. The recipe then has `image_url = null` with `image_origin = 'admin_upload'` (an explicit "no image"), web and mobile show the existing placeholder, and no later import fills it back in.
- **AC-6**: Neither `import_catalog` nor `import_custom_recipes` ever changes `image_url`, `image_origin`, or `image_source_url` on a recipe whose `image_origin` is `admin_upload`. Running either import twice leaves an admin uploaded (or admin removed) image untouched.
- **AC-7**: With the `--copy-images` flag, the catalog import copies each TheCocktailDB thumb that has no stored copy yet, or whose thumb URL differs from `image_source_url`. It downloads the 700px thumb, center crops it square, writes a hero WebP (no upscaling) and a 400px card WebP to `catalog/<source_id>/<hash>-hero.webp` and `-card.webp` with a one year cache header, and stores the hero URL with `image_origin = 'catalog_copy'` and `image_source_url` set to the thumb URL. A recipe already `catalog_copy` with an unchanged thumb URL triggers no download and no upload.
- **AC-8**: If downloading or encoding one thumb fails during `--copy-images`, that recipe keeps (or gets) the TheCocktailDB URL as `image_origin = 'external_hotlink'`, the import logs the `source_id` and reason, the rest of the import finishes, and the next run tries that recipe again. The run ends with a summary line: copied, unchanged, failed.
- **AC-9**: Without `--copy-images` (the default until permission is confirmed), the import keeps today's behavior for new or changed thumbs (hotlink, `external_hotlink`, `image_source_url` = thumb) and never downgrades an existing `catalog_copy` whose thumb URL is unchanged.
- **AC-10**: A shared `recipeImageUrl(url, size)` helper returns the card URL (`-hero.webp` swapped for `-card.webp`) for our bucket URLs when `size = 'card'`, the URL unchanged for `'hero'` or for any other host, and `null` for `null`. Every recipe card and list image on web and mobile uses the `card` size; the recipe detail hero, JSON-LD `image`, and Open Graph image use the hero URL.
- **AC-11**: On web, card images from our bucket render through `next/image` with `unoptimized` (served as is); the hero still goes through the optimizer. `next.config.ts` allows `/storage/v1/object/public/recipe-images/**` on the project host.
- **AC-12**: A daily job deletes every `recipe-images` object older than 24 hours that no recipe references (a pair is referenced when `image_url` equals its hero URL). Files from a save that is still in progress (under 24 hours old) are never deleted.
- **AC-13**: A one time command, `pnpm --filter import-job migrate:images` (with `--dry-run`), copies every recipe whose `image_origin = 'external_hotlink'` and whose host is not TheCocktailDB into `recipes/<recipe_id>/…` as `admin_upload`, using the same processing as AC-2, and prints each failure with its recipe id and URL. Running it a second time changes nothing. Once it reports zero remaining, the Imgur entries are removed from `next.config.ts`.
- **AC-14**: The recipe detail page on web and mobile shows a small localized credit, "Recipe and image from TheCocktailDB", linking to `https://www.thecocktaildb.com`, only for recipes imported from TheCocktailDB (`source = 'catalog'` and `source_id` not starting with `custom:`). Custom and admin recipes show no credit. Strings exist in `en.json` and `es.json` (web) and the mobile equivalents.
- **AC-15**: The database enforces: `image_url` not null means `image_origin` not null; `image_url` null means `image_origin` is null or `admin_upload`. The migration backfills every existing row with an image to `external_hotlink`, and sets `image_source_url = image_url` on catalog rows whose URL is on TheCocktailDB.

## Decision

**Chosen option**: Option 2: Our own Supabase Storage bucket with fixed size WebP files, copy on import gated by permission

Recipe images live in a public `recipe-images` bucket on the existing Supabase project as content hashed hero and card WebP files. Admin uploads go there now, and the import job copies TheCocktailDB images there once copying is confirmed allowed.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`) · `react-native-best-practices` (`callstackincubator/agent-skills`, `.agents/skills/react-native-best-practices/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`)

Calls settled here (pick, why, runner up):
- **Image setting is its own database function**, `admin_set_recipe_image(p_recipe_id, p_hero_url)`, and `admin_upsert_recipe` drops `p_image_url`. A new recipe has no id until it saves, and the storage path needs that id, so the form saves the details first, then uploads, then sets the image. Runner up: a client generated uuid passed into the upsert, which mixes two failure modes into one call.
- **`admin_set_recipe_image` checks that both files really exist** in `storage.objects` under `recipes/<p_recipe_id>/`, so a typo or a foreign URL can never be saved (this is what makes "upload only" true). Runner up: a URL pattern check alone, which can't catch a missing card file.
- **Content hash** = the first 16 hex characters of the SHA-256 of the hero bytes, shared by both files of a pair. Runner up: a random uuid, which loses the "same image, same name" property the import uses to skip work.
- **WebP quality 0.82** in the browser and sharp `quality: 82` in Node: visually clean for photos at about 60 to 120 KB per hero. Runner up: 0.9, which costs about 40% more bytes for no visible gain at these sizes.
- **sharp** (a Node image library) is added to `packages/import-job` only; the browser uses canvas `toBlob('image/webp')`. Runner up: jimp, which is pure JS but much slower and weaker at WebP.
- **The orphan sweep is a sibling Edge Function**, `cleanup-orphan-recipe-images`, with its own daily pg_cron entry, mirroring `cleanup-orphan-comment-photos`. A failure in one sweep never blocks the other. Runner up: a second pass inside the existing function, one less deploy but a muddier name and shared failure.
- **The credit is a returned flag**, `is_cocktaildb_recipe boolean`, added to `fetch_recipe_detail`, so neither client needs to know the `custom:` rule. Runner up: returning `source` and `source_id` and deciding in `packages/shared`, which leaks import internals into both apps.
- **Errors use the project's explicit result pattern** (no throws for expected failures) in the shared image module, and unexpected upload failures go to Sentry as they do for comment photos.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

`recipes` (existing table, two new columns):

| Column | Type | Null | Notes |
|---|---|---|---|
| `image_url` | text | yes | unchanged; holds the **hero** URL (or an external hotlink during the transition) |
| `image_origin` | text | yes | `check (image_origin in ('catalog_copy', 'admin_upload', 'external_hotlink'))` |
| `image_source_url` | text | yes | the TheCocktailDB thumb URL this image came from (catalog rows only) |

Table check constraint (AC-15): `(image_url is not null and image_origin is not null) or (image_url is null and (image_origin is null or image_origin = 'admin_upload'))`.

Storage bucket `recipe-images` (public, `allowed_mime_types = ['image/webp']`, `file_size_limit = 2097152`):

| Path | Written by | Notes |
|---|---|---|
| `catalog/<source_id>/<hash>-hero.webp`, `-card.webp` | import job (service role) | `source_id` because a new catalog recipe has no `id` yet when the copy runs |
| `recipes/<recipe_id>/<hash>-hero.webp`, `-card.webp` | admin (storage policy) | also used by the one time legacy migration |

Relationships: one recipe points to zero or one image pair. No new tables.

Changed database functions:
- `import_catalog(drinks jsonb, …)`: each drink carries `imageUrl`, `imageOrigin`, `imageSourceUrl` (decided by the job). The `on conflict … do update` sets the three image columns only `where recipes.image_origin is distinct from 'admin_upload'` (a `case` per column, so the rest of the row still updates).
- `import_custom_recipes`: same guard; custom drinks pass `imageOrigin = null` when `imageUrl` is null.
- `admin_upsert_recipe`: `p_image_url` removed. Insert writes no image; update leaves the image columns alone.
- `admin_set_recipe_image(p_recipe_id uuid, p_hero_url text)` (new, `security definer`, `set search_path = ''`, admin only): `null` removes the image (`image_url = null`, `image_origin = 'admin_upload'`); a URL must end in `/storage/v1/object/public/recipe-images/recipes/<p_recipe_id>/<16 hex>-hero.webp`, and both that object and its `-card.webp` sibling must exist in `storage.objects`. It sets `image_origin = 'admin_upload'` and `image_source_url = null`.
- `fetch_recipe_detail`: adds `is_cocktaildb_recipe boolean` (`r.source = 'catalog' and r.source_id !~ '^custom:'`). Its return type changes, so it is dropped and recreated, with grants restored.
- `is_recipe_image_referenced(p_name text) returns boolean` (new, service role only): true when some recipe's `image_url` ends with `/recipe-images/` plus the hero name of that pair.

**State transitions** (`image_origin`, per recipe):
- `null` → `external_hotlink` (import, no copy) · `catalog_copy` (import with `--copy-images`) · `admin_upload` (admin sets or removes)
- `external_hotlink` → `catalog_copy` (successful copy) · `admin_upload` (admin, or the legacy migration)
- `catalog_copy` → `catalog_copy` (thumb changed, copied again) · `external_hotlink` (thumb changed, copy failed or flag off) · `admin_upload` (admin)
- `admin_upload` → `admin_upload` only (the import never moves a recipe out of it)

**API surface**:

| Action | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `processRecipeImage(file)` | web helper (`apps/web/src/admin/`) | `File` | `{ ok, hero: Blob, card: Blob, hash }` or `{ ok: false, reason }` | none (client) | `unsupported_type`, `too_large`, `too_small`, `webp_unsupported`, `decode_failed` |
| `uploadRecipeImage(client, recipeId, images)` | `packages/shared/src/recipeImages.ts` | recipe id, hero and card blobs, hash | `{ ok, heroUrl }` | admin session | storage 403, network |
| `setRecipeImage(client, recipeId, heroUrl \| null)` | shared, calls RPC `admin_set_recipe_image` | recipe id, hero URL or null | `{ ok }` | admin session | `not admin`, `invalid image url`, `image files missing`, `recipe not found` |
| `recipeImageUrl(url, size)` | shared pure function | URL or null, `'hero' \| 'card'` | URL or null | none | none |
| `recipeImagePath(scope, key, hash, size)` | shared pure function | `'catalog' \| 'recipes'`, id, hash, size | bucket object name | none | none |
| `pnpm --filter import-job import [--copy-images] [--dry-run]` | CLI | flags, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | summary: copied, unchanged, failed | service role | per recipe failures logged, never fatal |
| `pnpm --filter import-job migrate:images [--dry-run]` | CLI | same env | list of migrated and failed recipes | service role | per recipe failures listed |
| `cleanup-orphan-recipe-images` | Edge Function, daily pg_cron | optional `{"dryRun": true}` | count deleted, or the list it would delete | `sb_secret_...` key on the `apikey` header (the `secret_key` Vault secret); see *Cron auth* | 401 `unauthorized` (logs key shapes, never values); batch failures to Sentry |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Admin upload | recipe id in the path | the saved recipe's id (returned by `admin_upsert_recipe` on create, or the edited recipe's id) |
| Admin upload | hash | SHA-256 of the encoded hero bytes, first 16 hex (Web Crypto `crypto.subtle.digest`) |
| Admin upload | hero side | `min(1000, source short side)`; source short side ≥ 600 enforced first |
| Admin upload | public hero URL | `client.storage.from('recipe-images').getPublicUrl(path)` |
| Catalog copy | whether to copy | current row's `image_origin` and `image_source_url` (read by the job before the run) compared to the drink's `strDrinkThumb` |
| Catalog copy | storage key | the drink's `source_id` (TheCocktailDB `idDrink`) |
| Catalog copy | hero side | the thumb's short side (700 today), never upscaled |
| Card image on web and mobile | card URL | `recipeImageUrl(image_url, 'card')`, derived from `image_url` |
| Detail credit | show or hide | `fetch_recipe_detail.is_cocktaildb_recipe` |
| Credit link | URL | constant `https://www.thecocktaildb.com` in `packages/shared` |
| Sweep | accepted keys | Edge Function env: `SUPABASE_SERVICE_ROLE_KEY` plus every value in `SUPABASE_SECRET_KEYS` (JSON object) |
| Sweep cron | key it sends | Vault secret `secret_key` (seeded as a placeholder; the real `sb_secret_...` value is set by hand in the SQL editor) |
| Sweep | object age | `storage.objects.created_at` |
| Sweep | referenced or not | `is_recipe_image_referenced(name)` against `recipes.image_url` |
| Legacy migration | which rows | `image_origin = 'external_hotlink'` and the host is not `www.thecocktaildb.com` |
| Cache header | lifetime | constant `31536000` seconds (one year) in `packages/shared` |

**Key invariants**:
- Files in `recipe-images` are never overwritten (`upsert: false`); a changed image is always a new hash, so the one year cache can't serve a stale image.
- A recipe with `image_origin = 'admin_upload'` is never changed by either import.
- Every `image_url` saved through the admin path points at a hero whose card sibling exists (checked in `admin_set_recipe_image`).
- The check constraint in AC-15 always holds.
- Non UI logic (URL helper, path builder, upload and set calls, result types) lives once in `packages/shared/src/recipeImages.ts`; only canvas processing lives in `apps/web`, and only sharp processing in `packages/import-job`.

**Security model**:
- Read: public (bucket is public; recipe images are not sensitive).
- Write under `recipes/`: admins only, via storage policies `recipe_images_storage_insert`, `_select`, and `_delete` using `(select public.is_current_user_admin())` plus the strict name regex in AC-1. No update policy (files are immutable).
- Write under `catalog/`: service role only (no policy grants it to `authenticated`).
- `admin_set_recipe_image`: `security definer`, raises `not admin` unless `is_current_user_admin()`; execute revoked from `public` and `anon`, granted to `authenticated`.
- `is_recipe_image_referenced`: execute granted to `service_role` only.
- **Cron auth** for `cleanup-orphan-recipe-images` (differs from the comment sweep on purpose): on this project the Edge Function env holds new `sb_secret_...` keys, even under `SUPABASE_SERVICE_ROLE_KEY`, so the legacy service role JWT the comment sweep sends as `Authorization: Bearer` never matches. The pg_cron job (migration `20261027010000_recipe_image_sweep_secret_key.sql`, which replaces the job from `20261026130000`) sends the `secret_key` Vault secret on the `apikey` header; secret keys are not JWTs, so they don't go in `Authorization: Bearer`. The function accepts the legacy key or any `SUPABASE_SECRET_KEYS` value, presented as a Bearer token or an `apikey` header, compared in constant time, and builds its Supabase client with the key that matched. A rejected call returns 401 and logs only which key variables exist and the shape (`jwt`, `sb_secret`, or `other`, plus length) of what was sent, never a key value.
- Images are encoded again through canvas or sharp, so no EXIF or location data is ever stored. No PII is involved; no compliance scope applies.

**Configuration required**:
- No new env vars. The import job reuses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; the Edge Function reads `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_SECRET_KEYS`, all provided by the platform.
- One new Vault secret, `secret_key`: the migration seeds `REPLACE_ME_VIA_DASHBOARD_SQL_EDITOR`, and you set the real `sb_secret_...` value (Settings > API Keys) once in the SQL editor with `vault.update_secret`. Until you do, every scheduled run returns 401.
- New dependency: `sharp` in `packages/import-job` only.

**Critical test scenarios**:
- Happy path: admin creates a recipe, uploads a 1200px JPEG, and both WebP files appear under `recipes/<id>/`; the detail page shows the hero and the card shows the 400px file, verifies **AC-2**, **AC-10**, **AC-11**
- Replace then sweep: replace the image; a day later only the new pair remains, verifies **AC-4**, **AC-12**
- Import safety: upload for a custom recipe, run `import:custom` and `import` twice; the image is unchanged; remove it and rerun, and it stays removed, verifies **AC-5**, **AC-6**
- Copy idempotence: run `import --copy-images` twice; the second run copies zero, verifies **AC-7**
- Copy failure: make one thumb URL 404 (fixture); that recipe stays `external_hotlink`, the import completes, and the summary shows 1 failed, verifies **AC-8**
- Flag off: a `catalog_copy` row with an unchanged thumb stays `catalog_copy`, verifies **AC-9**
- Validation: a 500px PNG, a 20 MB JPEG, and a GIF are each rejected with no upload, verifies **AC-3**
- Auth: a non admin signed in user's direct storage upload to `recipes/…` gets 403, and calling `admin_set_recipe_image` raises `not admin`, verifies **AC-1**
- Forged URL: `admin_set_recipe_image` with another recipe's path, or a hero whose card is missing, raises, verifies **AC-1**, **AC-2**
- Constraint: an update setting `image_url` with a null `image_origin` fails, verifies **AC-15**
- Helper units: `recipeImageUrl` for our URL, an Imgur URL, a TheCocktailDB URL, and `null`, verifies **AC-10**
- Credit: shown on a TheCocktailDB recipe, hidden on a `custom:` and an admin recipe, verifies **AC-14**

## Build plan

Ordered for the Tracer Bullet approach: slice 1 proves one admin uploaded image flows end to end (database, storage, shared, web admin, web display); later slices thicken it.

**Slice 1: one admin upload, end to end**
1. Migration `<ts>_recipe_images.sql`: add `image_origin` and `image_source_url` with the check, backfill per AC-15, then the table check constraint; create the `recipe-images` bucket and its storage policies; add `admin_set_recipe_image`; drop `p_image_url` from `admin_upsert_recipe` (drop and recreate with the new signature, grants restored); add the `admin_upload` guard to `import_catalog` and `import_custom_recipes`. Regenerate `database.types.ts`. Satisfies **AC-1**, **AC-6**, **AC-15**
2. `packages/shared/src/recipeImages.ts`: constants (bucket, cache seconds, sizes, credit URL), `recipeImagePath`, `recipeImageUrl`, `uploadRecipeImage`, `setRecipeImage` with explicit result types; export from `index.ts`; update `adminRecipes.ts` for the removed `imageUrl` save param; unit tests beside it. Satisfies **AC-2**, **AC-10**
3. `apps/web/src/admin/process-recipe-image.ts` (canvas decode, size checks, center crop, two WebP encodes, WebP support check, hash) with tests for the pure size math; replace the URL field in `admin-recipe-form.tsx` with a file picker plus preview, "Remove image", and the save, then upload, then set flow, with localized errors in `en.json` and `es.json`. Satisfies **AC-2**, **AC-3**, **AC-4**, **AC-5**
4. `next.config.ts`: add the `recipe-images` remote pattern on the project host. Satisfies **AC-11**

**Slice 2: card sizes everywhere**
5. Web: every card and list image (`recipe-card.tsx`, carousels, pantry, popular, recommendations, drink ideas, more like this) uses `recipeImageUrl(url, 'card')`, with `unoptimized` when the URL is in our bucket; the hero, JSON-LD, and OG keep the hero URL. Satisfies **AC-10**, **AC-11**
6. Mobile: the same `card` swap at every `RecipeImage` call site except the detail header. Satisfies **AC-10**

**Slice 3: the import**
7. `packages/import-job`: add `sharp`; read current image state per `source_id` before the run; decide `imageOrigin` and `imageSourceUrl` per drink; implement `--copy-images` (download, crop, encode, upload to `catalog/<source_id>/…`, per recipe failure fallback to hotlink, summary line); pass the three fields to `import_catalog`. Tests for the decide function (all transitions above) and the failure fallback with a fake fetcher. Satisfies **AC-7**, **AC-8**, **AC-9**

**Slice 4: cleanup**
8. `supabase/functions/cleanup-orphan-recipe-images` plus `is_recipe_image_referenced` and its daily pg_cron migration, mirroring the comment sweep (24 hour grace, Sentry on failure) except for auth: the cron sends the `secret_key` Vault secret on the `apikey` header (see *Cron auth*). Satisfies **AC-12**

**Slice 5: legacy links**
9. `packages/import-job/src/migrateImages.ts` plus the `migrate:images` script (sharp, the same crop and sizes as AC-2, `recipes/<id>/…`, `--dry-run`, idempotent); run it, then remove the Imgur entries from `next.config.ts`. Satisfies **AC-13**

**Slice 6: credit**
10. Migration: drop and recreate `fetch_recipe_detail` with `is_cocktaildb_recipe`; shared `RecipeDetail` type; a credit line in the web and mobile detail views with localized strings. Satisfies **AC-14**

## Migration plan

**Strategy**: strangler (old hotlinks and new bucket files are served side by side; recipes move over one at a time)
**Phases**:
1. Ship slices 1 and 2: new columns, bucket, and admin uploads. Every existing image keeps working as `external_hotlink`.
2. Ship slices 3 and 4 with `--copy-images` off. Imports record `image_source_url` but still hotlink.
3. Run slice 5's legacy migration; when it reports zero remaining, remove Imgur from `remotePatterns`.
4. When TheCocktailDB confirms copying is allowed, run `import --copy-images`. Keep `www.thecocktaildb.com` in `remotePatterns` until no `external_hotlink` row on that host remains.
**Rollback**: every phase leaves `image_url` a working URL, so reverting code is safe. The new columns are nullable; reverting slice 1's function changes restores the URL field. Bucket files can stay (they only cost storage).
**Risks**: Safari may not encode WebP from canvas (handled by the AC-3 message; the admin uses Chrome, Firefox, or Edge). A sweep bug could delete live files; the 24 hour grace and the referenced check guard it, and the first runs should log what they would delete before deleting.

## Consequences

**Positive**:
- Images keep working through TheCocktailDB or Imgur outages, rate limits, and hotlink blocks (and Imgur's UK block).
- Mobile cards download about 400px files instead of 700px or more; on web, cards stop using Vercel's monthly transformation quota.
- Admin image fixes and removals finally stick across imports, which today silently undo them.
- Every stored image is encoded again, so no hidden photo metadata is ever published.

**Negative / tradeoffs**:
- More storage and egress on the Free plan: about 700 pairs at roughly 150 KB is about 100 MB of the 1 GB, and heavy traffic can approach the 5 GB monthly egress. Watch it in the Supabase dashboard.
- The import job gains a native dependency (sharp) and network heavy work when `--copy-images` runs (about 700 downloads the first time).
- Two image sizes are baked in. A new size later means reprocessing every image (or moving to Pro plan transformations).
- The catalog half is blocked on a reply from TheCocktailDB; until then catalog images still hotlink.
- `admin_upsert_recipe` changes its signature, so any caller still passing `p_image_url` breaks until updated (only `adminRecipes.ts` today).

**Neutral**:
- `image_url` keeps its meaning (the URL to show), so the roughly 15 SQL read functions and both apps' data layers need no change beyond the card swap.
- One more Edge Function and cron entry to watch, alongside the comment sweep. Its cron auth uses a different header and Vault secret than the older sweeps, so the two patterns live side by side until the follow up below aligns them.

## Follow-up

- [ ] Email TheCocktailDB to ask whether copying API images into our own storage (with credit) is allowed; record the answer in this spec's `rationale.md`. Until then, run the import without `--copy-images`.
- [ ] Buy TheCocktailDB's Premium API key: their terms say you can't publish to an app store without being a paid subscriber, and `packages/import-job/src/theCocktailDb.ts` hardcodes the test key `1`. This blocks the store launch in spec 0040, not just images.
- [ ] Vercel's Hobby plan is for non commercial personal use only; decide on Pro before monetizing (outside this spec).
- [ ] Run `/scope` to enroll this spec as a feature, replacing the deferred "Self host recipe images" item.
- [ ] The older cron jobs, `cleanup-orphan-comment-photos` (spec 0032) and `cleanup-anonymous-accounts` (spec 0017), still send the legacy `service_role_key` JWT as `Authorization: Bearer` and compare it only against `SUPABASE_SERVICE_ROLE_KEY`. If that variable holds an `sb_secret_...` key here too, they are probably returning 401 every night without anyone noticing. You may want to check their Edge Function logs and, if so, move them to the *Cron auth* pattern above (best as a small cross cutting spec, outside this one).
- [ ] A placeholder cocktail glass image is still a TODO in `apps/mobile/src/recipes/recipe-image.tsx`; it could live in this bucket later.
