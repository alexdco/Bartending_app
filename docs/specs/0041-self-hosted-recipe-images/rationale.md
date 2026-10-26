# 0041. Self hosted recipe images: rationale

## Context

Every recipe image is shown straight from someone else's server. Catalog recipes load TheCocktailDB's `strDrinkThumb` URLs on every page view, and the admin recipe form takes a pasted URL, which recently led to Imgur entries in `apps/web/next.config.ts`. If TheCocktailDB is down, rate limits us, or changes its URLs, every catalog card shows a broken or empty image. Imgur's terms target community sharing, not serving a commercial app's images, and Imgur has blocked UK visitors since late 2025. The project already treats TheCocktailDB recipe *data* as imported once and never called live from clients (root `AGENTS.md`); images are the one exception.

Two data problems make this worse. `import_catalog` and `import_custom_recipes` both set `image_url = excluded.image_url` on every run, so any image you fix on a catalog or custom recipe is silently put back by the next import. The 21 custom recipes all have `imageUrl: null`, so today the only way to give them an image is a pasted link to an outside host.

The forces: the stack is Supabase on the Free plan (1 GB storage, 5 GB egress, and no Storage image transformations, which are Pro only), Next.js on Vercel Hobby (5,000 image transformations a month), and Expo on mobile, where `expo-image` shows whatever size it is given. The app already runs a public Supabase bucket (`comment-photos`, spec 0032) with client side resizing and a daily orphan sweep, so that pattern is proven here. One person (the admin) adds images; the catalog is about 700 recipes.

TheCocktailDB's terms add a constraint. They require crediting them as the source, and they don't clearly say whether copying their images onto our own storage is allowed. Publishing to an app store needs their paid Premium key either way.

## Options considered

### Option 1: Keep hotlinking, but use TheCocktailDB's size variants

Keep `image_url` pointing at TheCocktailDB, append `/medium` (350px) for cards, and keep accepting pasted URLs (Imgur or others) in the admin form.

**Pros**:
- No storage, no new code paths beyond a URL suffix; zero storage cost.
- Smaller card downloads right away.

**Cons**:
- Doesn't fix the core problem: their outage or a hotlink block still blanks every image, and Imgur links can still break.
- No answer for custom recipes beyond outside hosts, and the import still overwrites admin fixes.

### Option 2: Our own Supabase Storage bucket with fixed size WebP files (chosen)

A public `recipe-images` bucket on the existing project. Admin uploads are cropped and encoded in the browser into a hero and a card WebP; the import job uses sharp to do the same for TheCocktailDB thumbs, gated by a flag until copying is confirmed allowed. Two columns record each image's origin so the import respects admin choices.

**Pros**:
- Reuses the vendor, auth model, policy style, and sweep pattern the project already runs for comment photos.
- Works on the Free plan with no transformations, and serves small files to mobile.
- Content hashed names allow one year caching with no stale images.

**Cons**:
- Fixed sizes: adding a third size later means reprocessing.
- Uses Free plan storage and egress, which heavy traffic could strain.
- A native dependency (sharp) in the import job.

### Option 3: Cloudflare R2 plus Cloudflare Images

Store originals in R2 (no egress fees) and let Cloudflare Images resize on the fly for any client.

**Pros**:
- No egress cost at any traffic; any size on demand for web and mobile.
- Takes image work off Vercel entirely.

**Cons**:
- A new vendor, account, API token, and upload path, outside the Supabase RLS model the rest of the app uses.
- Admin uploads need a signed upload endpoint (an Edge Function) instead of a storage policy.
- Paid per image delivered beyond the free allowance; more to operate for one admin and about 700 images.

### Option 4: Cloudinary

Upload to Cloudinary and use its URL based transformations (crop, format, size).

**Pros**:
- Best in class transformations and automatic format choice (AVIF, WebP).
- A generous free tier for this catalog size.

**Cons**:
- Another vendor and credential, with the same upload endpoint problem as Option 3.
- Its credit based pricing is harder to predict, and moving off it later means rewriting every URL.

## Rationale

The problem is reliability and control, not resizing power. Option 1 is cheapest but leaves the outage, hotlink, and Imgur risks in place, which is the whole reason for this spec. Options 3 and 4 solve it with more capability than about 700 images and one admin need, at the cost of a new vendor, a new credential, and an upload path outside the Supabase policy model. That is exactly the sprawl root `AGENTS.md` steers away from (basis: your AGENTS.md, Supabase is the backend for storage and auth).

Option 2 reuses what already works in this codebase. Spec 0032 proved a public bucket, client side resizing, strict storage policies, and a daily orphan sweep (basis: spec 0032, recipe comment photos). The Free plan has no image transformations (basis: Supabase pricing and image transformation docs), so two fixed WebP sizes made at upload time are the simplest way to serve light cards to mobile without the Pro plan. Serving cards `unoptimized` on web also keeps most images out of Vercel's 5,000 a month Hobby quota (basis: Vercel image optimization limits). Content hashed, never overwritten files let the cache last a year without stale images (basis: immutable cache busting by content hash).

The catalog copy step is built but switched off by default because TheCocktailDB's terms don't clearly allow copying images (basis: TheCocktailDB terms of use). Building admin uploads first delivers value now (custom recipes, Imgur replacement) without betting on their answer. The `image_origin` column fixes the existing bug where every import undoes admin image fixes, a problem regardless of where files live. The rollout follows the strangler pattern: hotlinks and bucket files run side by side and recipes move one at a time, so nothing breaks at any step (basis: strangler pattern for live migrations).

## Evidence: terms and limits checked on 2026-10-26

- TheCocktailDB: the test key `1` is for development or educational use; "You cannot publish apps to an appstore unless you are a paid subscriber" (Premium listed as a one time $10, possibly out of date). On copying: "You can scrape, copy and modify any content returned from the API, as long as you use the official end points", with no explicit wording on rehosting images. Credit: "must mention us as the source of the data" and "should link back to our website where appropriate". Image variants: `/small` 200px, `/medium` 350px, `/large` 500px; originals 700px.
- Supabase Free plan: 1 GB file storage, 5 GB egress, 5 GB cached egress, 50 MB max upload; Storage image transformations are not included (Pro and above).
- Vercel Hobby: 5K image transformations, 300K cache reads, and 100K cache writes a month; past the limit new images fail with 402; Hobby is for non commercial personal use only.

Not confirmed: TheCocktailDB's explicit position on rehosting images (the follow up email settles it), and their current Premium price.

## References

**Project sources**:
- Root `AGENTS.md`: Supabase for storage and auth, recipe data imported once and never called live, shared logic in `packages/shared`, explicit error returns
- `apps/web/AGENTS.md`: every remote image host needs a `remotePatterns` entry
- Spec 0032 (recipe comment photos): public bucket, client side resize, storage policies, orphan sweep
- Spec 0030 (admin recipe management): `admin_upsert_recipe` and the admin form
- Spec 0036 (recipe catalog cleanup): import idempotence (AC-4)
- `supabase/migrations/20261012140000_preserve_taste_tags_on_import.sql`: the current `import_catalog` and `import_custom_recipes` image overwrite

**Practices & standards**:
- Strangler pattern for live migrations
- Immutable cache busting by content hash
- Least privilege storage policies (admin only writes, service role for batch jobs)

**Links** (web verified 2026-10-26):
- TheCocktailDB API: https://thecocktaildb.com/api.php
- TheCocktailDB terms of use: https://www.thecocktaildb.com/terms_of_use.php
- Supabase pricing: https://supabase.com/pricing
- Supabase Storage image transformations: https://supabase.com/docs/guides/storage/serving/image-transformations
- Vercel image optimization limits and pricing: https://vercel.com/docs/image-optimization/limits-and-pricing
