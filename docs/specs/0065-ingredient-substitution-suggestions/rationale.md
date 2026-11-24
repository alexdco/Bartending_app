# 0065. Ingredient substitution suggestions: rationale

## Context

Bartender Mode (spec 0023) lets bar staff mark an ingredient 86'd (out of stock), and that state syncs to every teammate. Knowing an ingredient is out only solves half the problem. The bartender still has to decide on the spot what to use instead and how much, in the 2 to 3 second budget Quick Build is designed around. Spec 0023 deferred substitution on purpose as a follow up (feature 65).

The forces that shaped this decision:
- **Speed and connectivity.** Quick Build must render offline after a restart (0023 AC-6). Anything that needs a live call at the moment of use fails in exactly the "bar basement with bad signal" case.
- **The catalog is small and already enriched.** 398 ingredients, each with a Haiku classified `category` and reviewed `allergens`, produced by `propose` / review file / `apply` scripts. You apply live writes through the SQL editor.
- **Swaps are not symmetric.** Lemon and lime swap both ways, but agave for simple syrup differs from simple syrup for agave, and strength differs (absinthe for pastis).
- **Safety.** A swap can add an allergen, or turn a mocktail into an alcoholic drink.
- **Locales.** The app ships in 9 locales; any text shown must translate or fall back cleanly.
- **A missing prerequisite.** The 86'd marker 0023 AC-10 promised in Quick Build and search results was never built; only the Service menu list shows it. Swaps need somewhere to live in Quick Build.

## Options considered

### Option 1: Curated catalog table, seeded by Haiku (chosen)

A one off script asks Haiku for ranked one way swaps per ingredient; you review them in a file; an apply SQL file loads them into `ingredient_substitutes`. Swaps for the bar's 86'd ingredients ride in `fetch_bar_service_data`.

**Pros**: instant, offline, zero cost per view; reviewed quality; same pattern as category and allergens; reusable beyond Bartender Mode.
**Cons**: per ingredient, not aware of the recipe; needs a review pass over about 400 ingredients; new ingredients need a rerun.

### Option 2: Live Haiku call per recipe

A quota checked Edge Function asks Haiku for swaps given the recipe and the 86'd ingredient.

**Pros**: aware of the recipe; no curation; covers any ingredient immediately.
**Cons**: seconds of latency mid shift; fails offline; costs money per view; unreviewed output on a safety relevant surface (allergens, alcohol).

### Option 3: Curated table plus a live Haiku fallback

Option 1, with a live call when the table has nothing.

**Pros**: better coverage while the review is incomplete.
**Cons**: two code paths with different quality and failure modes; the fallback still fails offline, which is when it would matter most.

### Option 4: Rules only (same category, in stock)

Suggest in stock ingredients that share the 86'd ingredient's category.

**Pros**: no new data, no curation.
**Cons**: the categories are too coarse (any liqueur for any liqueur); suggestions would often be wrong, which erodes trust in the whole banner.

## Rationale

Offline and speed rule out anything live (Options 2 and 3) on the screen this feature serves. Option 4 is cheap but wrong too often for a tool bartenders must trust at a glance. Option 1 fits what the project already does well: Haiku proposes, a human reviews, SQL applies. It also keeps every runtime path deterministic and testable.

Per ingredient swaps (not per recipe) keep the review at about 400 rows instead of thousands. The optional note plus ratio carries most of the nuance a per recipe row would. One way rows were chosen because real swaps are lopsided in direction and amount.

Delivery through `fetch_bar_service_data`, rather than a new RPC, was chosen because that query is already persisted offline, already refetched when an 86 toggles, and already scoped to bar members. Swaps arrive with the 86 list they depend on, in one snapshot. Stock filtering happens on the client against that same snapshot, so the cached view stays self consistent offline. The runner up was a dedicated `fetch_ingredient_substitutes` RPC: cleaner separation, but a second persisted query and a second request at the moment speed matters.

The payload carries every locale's translations instead of taking a `p_locale` argument. That choice came from the cross check. A locale parameter would have put the locale into the query key, so switching language offline would lose the banner. It would also have changed the RPC signature (grants issued again, a risk of PostgREST overload confusion) and broken the exact key the 86 toggle invalidates. The extra bytes are small, because only currently 86'd ingredients are included, and choosing the locale moves into the pure, tested `pickSubstitutes`.

Calls made while writing the spec (not asked):
- **Ratio phrases snap to a fixed set** (0.25 to 4) with "about" when not exact, so every phrase is a translated UI string. The runner up was printing the raw multiplier, which reads like math mid shift.
- **Allergens: an unreviewed substitute shows "check allergens"** rather than nothing, since silence would read as safe. An unreviewed original counts as none, so every allergen the substitute has is flagged (errs safe).
- **"Alcoholic" means category `spirit` or `liqueur`.** That matches the categories that exist. Wine and beer sit in `other`, so a standalone house recipe using them may be treated as alcohol free; catalog recipes and based house recipes use the real `alcoholic_status` and are not affected.
- **The banner is built here.** It closes the Quick Build part of 0023 AC-10, because swaps have nowhere to live without it. The search result marker stays a 0023 follow up to keep this slice thin.
