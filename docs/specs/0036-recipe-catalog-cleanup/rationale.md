# 0036. Recipe catalog cleanup: rationale

## Context

The catalog (426 TheCocktailDB recipes plus a few custom and admin ones) was imported once and is rerun by `packages/import-job`. It carries the source's data problems: duplicate and misspelled drinks, crude names that are indexed and searchable, glass names that differ only by capitals, inconsistent ingredient casing, instructions that mention ingredients the recipe doesn't list, and Ice and Water offered as things to add to a pantry or shopping list. Pantry matching also counts Ice and Water as missing, which lowers the match quality for 64 recipes.

The binding constraint is the import itself. `import_catalog` upserts on `source_id` and sets `name`, `glass`, and `deleted_at = null` on every run. Its reconciliation soft deletes any catalog row missing from the payload. So any fix made directly on the live rows is undone by the next import. Instructions are the exception: since migration `20260920000000` they're only written on first insert.

Recipe URLs end in the recipe UUID, and the page already redirects to the canonical slug when a name changes. `recipes_select` hides soft deleted rows from anon and authenticated users. The workspace is repo wide: `supabase/`, `packages/import-job`, `packages/shared`, `apps/web`, `apps/mobile`. Live writes go through the dashboard SQL editor, not MCP.

## Options considered

### Option 1: Curated overrides file applied in the import transform (chosen)

A zod validated JSON file in the import job, keyed by source id, applied by pure functions before the RPC.

**Pros**: reviewable in git; a reimport reapplies it; fits the `customRecipes.json` pattern; every change can be undone by editing the file.
**Cons**: needs an import run to go live; no admin UI; tied to TheCocktailDB ids.

### Option 2: Curation columns in the database

`hidden_at`, `display_name`, and similar columns that `import_catalog` never touches, edited by SQL or a future admin screen.

**Pros**: takes effect instantly; could gain an admin UI later.
**Cons**: the rules live as data with no review trail; every read path must coalesce display and source columns; glass and ingredient casing would need parallel columns too.

### Option 3: One time SQL migration

Fix the rows directly once.

**Pros**: cheapest; no code.
**Cons**: the next import undoes names, glasses, and hides, so it only works if the import never runs again, and the import is the path for new catalog drinks and translations.

## Rationale

Option 3 fails on the import reset described above. Between 1 and 2, the cleanup consists of judgment calls (which drink is the duplicate, which name is crude, what a glass should be called) that you want reviewed and versioned, and the volume is small (10 hides, about 40 glass values). Option 1 keeps the source of truth in one diffable place and keeps `transform.ts` pure, per `AGENTS.md`. Option 2's instant edits matter only once someone besides you curates the catalog; it becomes the better fit if the "Import job vs admin edits" decision later moves curation into the admin UI.

Smaller calls made while writing the spec:
- **Hide by omission**: hidden drinks are left out of the payload so the existing reconciliation soft deletes them, rather than adding a new hide path to the RPC. Runner up: a `hidden` flag on each drink, which is more explicit but duplicates reconciliation.
- **Redirect lookup through a security definer function** (`resolve_recipe_redirect`) rather than loosening `recipes_select`, so hidden rows stay unreadable and a crude recipe returns nothing.
- **Favorites and pins move on merge; ratings and comments stay**: favorites and pins are a user's intent to find the drink again, while ratings and comments describe that specific row. No user data is attached to any of the 10 recipes today.
- **`search_ingredients` gains `include_staples`** rather than filtering in the client, because the admin form and the pantry share the RPC and only the pantry should drop staples.
- **Casing functions and maps in `packages/shared`**: admin saves need them, and `AGENTS.md` keeps non UI logic in shared.
- **Glass names in sentence case, ingredient names in Title Case**: each matches what most existing rows already use (`Cocktail glass` 101 rows; ingredient names mostly Title Case).
- **Staples counted as present, not dropped from totals**, so the "x of y" counts still describe the whole recipe.

## Evidence: live catalog inventory (2026-10-11, `BartendingAppWeb`)

**Duplicate candidates** (trigram similarity of 0.6 or higher). Merged: Planter’s Punch `178368` into Planter's Punch `17191` (1.00), Long Island Tea `11002` into Long Island Iced Tea `17204` (0.80), Vodka And Tonic `12460` into Vodka Tonic `178364` (0.75), Cuba Libra `13751` into Cuba Libre `11288` (0.69), Holloween Punch `12954` into Halloween Punch `178313` (0.68). Kept separate as distinct drinks: Martini and Dry Martini, Royal Fizz and Royal Gin Fizz, Frozen Daiquiri variants, Tequila Surprise and Tequila Sunrise, Thai Coffee and Thai Iced Coffee, Drinking Chocolate and Chocolate Drink. None of the merged rows has favorites, ratings, comments, or aliases.

**Crude names hidden**: Orgasm, Royal Bitch, Pink Panty Pulldowns, Deep Throat Cocktail, Dirty Nipple. Mild names kept: Brain Fart, Kiss me Quick, Nutty Irishman, Screwdriver.

**Glass values (41, with row counts)**: Balloon Glass 3 · Beer Glass 2 · Beer mug 3 · Beer pilsner 2 · Brandy snifter 3 · Champagne flute 5 / Champagne Flute 2 · Cocktail glass 101 / Cocktail Glass 2 · Coffee mug 12 / Coffee Mug 4 · Collins glass 29 / Collins Glass 28 · Copper Mug 1 · Cordial glass 2 · Coupe 1 / Coupe Glass 1 · Highball glass 79 / Highball Glass 20 · Hurricane glass 6 · Irish coffee cup 6 · Jar 1 · Margarita glass 4 · Margarita/Coupette glass 2 · Martini Glass 4 · Mason jar 2 · Nick and Nora Glass 3 · Old-fashioned glass 36 / Old-Fashioned glass 3 · Pint glass 3 · Pitcher 5 · Pousse cafe glass 1 · Punch bowl 7 / Punch Bowl 1 · Rocks glass 2 · Shot glass 24 / Shot Glass 1 · Whiskey Glass 1 · Whiskey sour glass 14 · White wine glass 2 · Wine Glass 4.

**Ingredient casing outliers**: `blackstrap rum`, `demerara Sugar`; mixed conventions such as `Sweet Vermouth` and `Green Creme de Menthe` next to `Soda water` and `Carbonated water`. Measures carry descriptors (`1 oz red` on Americano's Sweet Vermouth, which renders as "1 oz red Sweet Vermouth"); measure text is out of scope here.

**Staples**: Ice (36 recipes) and Water (28 recipes); 0 pantry rows and 0 shopping list rows reference them. Soda water (19), Carbonated water (12), and Tonic water (8) stay normal ingredients.

**Other observations**: `ingredients.category` is null for all 299 rows (the spec 0022 classification backfill hasn't run); not part of this spec.
