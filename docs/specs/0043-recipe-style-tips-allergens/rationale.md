# 0043. Rationale

## Context

The recipe detail page (spec 0004) shows a header, flavor profile, ingredients, and instructions. It doesn't say what kind of drink something is, how a pro would make it better, how to serve it, or whether it contains common allergens. The catalog has about 430 live recipes and about 290 ingredients in EN and ES. None of the four new kinds of content exists in the source data (TheCocktailDB has no tips or allergen fields).

Writing the text by hand at this scale isn't realistic. Generating it live on every page view would add cost, latency, and unreviewed text to a public, SEO indexed page. The project already has a proven pattern for one time AI content: Haiku proposes into a review file, a person reviews it, and a separate service role apply step writes it all or nothing (`tag-regions.ts` / `apply-regions.ts`, specs 0010 and 0038).

Allergen information is safety relevant. A wrong "no allergens" claim can hurt someone, and an allergen list that drifts away from the ingredient list (after an admin edit, a reimport, or a recipe cleanup) is a silent version of the same failure.

## Options considered

### Option 1: Everything per recipe from one Haiku pass

Generate style, both tips, and an allergen text per recipe in one reviewed backfill.

**Pros**: one script, one review file, the simplest schema.
**Cons**: the allergen text can disagree with the ingredient list and goes stale when ingredients change; 430 allergen paragraphs to review instead of 290 short tags; no way to tell "none" from "not checked".

### Option 2: Reviewed Haiku content in columns, allergens derived from ingredient tags (chosen)

Style and tips as reviewed columns; allergens as reviewed tags on ingredients, combined per recipe at read time.

**Pros**: allergens can't drift from the recipe; each ingredient is reviewed once and fixes spread everywhere; an honest "incomplete" state; style family can be filtered later.
**Cons**: two pipelines instead of one; a new admin page to maintain; cautious tagging flags generic ingredients.

### Option 3: Generate live in an Edge Function and cache it

Call Haiku on first view through the quota checked Edge Function and cache the result.

**Pros**: no backfill; new recipes get content automatically.
**Cons**: unreviewed AI text (including allergens) on public pages; cost and latency on a hot, crawled path; quota handling for anonymous crawlers.

## Rationale

You chose the reviewed backfill and derived allergens, and that is the right call. The safety force decides it: deriving allergens from ingredients makes "the list matches the recipe" a structural property instead of something a reviewer has to catch. Keeping `null` separate from `'{}'` gives an honest incomplete state. Option 3 fails on the same force and also puts AI cost on crawler traffic.

The aggregation runs in a pure shared function instead of in SQL so both apps render from one tested piece of code, and the RPC only exposes per ingredient data it already joins. The runner up was a SQL `jsonb` aggregate, which would work but is harder to unit test.

Admin note edits use a separate `admin_set_recipe_notes` RPC rather than more parameters on `admin_upsert_recipe`. Changing that function's signature means dropping and recreating a large function, and an older client calling it with fewer arguments would silently clear the notes. The cost is a two call save that isn't atomic. That is acceptable because retrying is safe and the failure is visible.

ES text comes from the same Haiku call as EN, so one review covers both. When an EN edit happens, the ES field is cleared rather than kept stale: a fallback to correct English beats a Spanish tip that contradicts it.
