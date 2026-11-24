# 0065. Ingredient substitution suggestions in Quick Build

**Date**: 2026-11-23
**Status**: In Progress

## Summary

When an ingredient is 86'd (out of stock) at a bar, Quick Build Mode now shows a banner at the top. The banner says which ingredients are out and offers up to three swaps for each, with the adjusted amount and a short note, or says plainly that no good swap exists. The swaps come from a small catalog table that Haiku seeds once and you review, so they are instant, free per view, and work offline. This spec also builds the Quick Build 86'd banner itself, which spec 0023 planned but never shipped.

## Requirements

**User stories**:
- As a bartender mid shift, I want Quick Build to tell me what to use instead of an 86'd ingredient, and how much, so I can still make the drink without stopping to think.
- As a bartender, I want a plain "no good substitute" message when there is none, so I know to tell the guest rather than improvise badly.
- As a bartender making a mocktail, I want swaps that never add alcohol, so an alcohol free drink stays alcohol free.
- As the catalog owner, I want swaps seeded by Haiku and reviewed by me, so suggestions are sensible without me writing 400 entries by hand.

**Acceptance criteria**:
- **AC-1**: In Quick Build Mode on mobile and web, when the user has a current bar selected (`useCurrentBar`) and the open recipe (catalog or house) uses at least one non staple ingredient whose `bar_ingredient_stock.is_86d` is true for that bar, a banner shows at the top of the screen with one block per distinct 86'd ingredient id (deduped), in the recipe's ingredient order, each headed `{ingredient} is 86'd` using the ingredient name Quick Build already shows. Staples (`isStaple`, for example Ice and Water) never get a block. With no current bar selected, no 86'd ingredient, or no bar service data available (loading, error, or nothing cached offline), no banner renders, and the banner never delays or blocks the recipe itself. This closes the Quick Build part of spec 0023 AC-10.
- **AC-2**: Each block lists up to 3 substitutes in ascending `rank`. A substitute that is itself 86'd at the current bar is skipped, and the next ranked one fills its place. A swap labeled "already in this drink" (AC-8) still counts toward the 3.
- **AC-3**: Each listed substitute shows its localized name, its adjusted amount, and its localized note when one exists. The adjusted amount scales the original amount by `ratio` and is formatted with the same `formatAmountInUnit` Quick Build uses (current locale passed in). Rules: an oz, ml, or cl amount shows in the unit selected on the toggle; a range (`amountMaxValue` set) scales both ends; any other unit (dash, tsp, count) scales the number and keeps its own unit; in parts mode, the original ingredient's `computeParts` value is scaled by `ratio`.
- **AC-4**: An amount is unparseable when `amountValue` or `amountUnit` is null (for example "top up"). Then a substitute with `ratio` other than 1 shows a ratio phrase from the UI strings instead of an amount, and a substitute with `ratio` 1 shows no amount line. Phrases exist for 0.25, 0.33, 0.5, 0.67, 0.75, 1.25, 1.5, 2, 3, and 4. A ratio within ±0.01 of a step uses that phrase; any other ratio uses the nearest step's phrase with an "about" prefix.
- **AC-5**: The block says so plainly when nothing can be suggested. If the ingredient's `substitutes_reviewed_at` is set and no substitute remains after the alcohol rule (AC-6), it shows "No good substitute". If substitutes remain after the alcohol rule but every one is 86'd, it shows "No substitute in stock". If `substitutes_reviewed_at` is null and there are no rows, the block shows only the 86'd heading, with no claim either way.
- **AC-6**: When the open recipe is alcohol free, substitutes whose `ingredients.category` is `spirit`, `liqueur`, or null (not classified yet) are never shown. A recipe is alcohol free only when: a catalog recipe has `alcoholic_status = 'non_alcoholic'` (any other value, including null, is not); a house recipe with a `base_recipe_id` uses its base recipe's status the same way; a standalone house recipe is alcohol free only when none of its ingredients has category `spirit` or `liqueur`.
- **AC-7**: A substitute that adds an allergen shows an allergen tag naming it, using the existing allergen labels from spec 0043 (`ALLERGENS` in `packages/shared/src/allergens.ts` and their UI strings). The tag lists every allergen in the substitute's `allergens` that is not in the original ingredient's `allergens` (an original with null allergens counts as none). A substitute whose `allergens` is null shows a "check allergens" tag instead.
- **AC-8**: A substitute that is already an ingredient of the same recipe shows an "already in this drink" label.
- **AC-9**: Notes show in the app's current locale from `ingredient_substitute_translations`, falling back to the English `note` when there is no translation row or its `source_note_hash` no longer matches `note_hash`. Substitute names use the existing `ingredient_translations` with English fallback. The locale is chosen on the client from translations shipped in the payload, so the RPC and its query key carry no locale. Banner strings (heading, empty lines, labels, ratio phrases) exist in all 9 supported locales.
- **AC-10**: The banner, swaps included, renders from the persisted offline cache with no network, after a full app or tab restart, for any bar whose service data was loaded before (same guarantee as spec 0023 AC-6), and still renders after switching the app language while offline. Toggling an ingredient's 86 status updates the banner on the next service data fetch, with no extra query.
- **AC-11**: On the Service screen's current menu list (mobile and web), an item that already shows the 86'd warning also shows a "swap available" hint when at least one of its 86'd ingredients has a substitute that would be listed under AC-2 and AC-6.
- **AC-12**: When the banner renders, the app sends one PostHog event `substitutes_shown` per 86'd ingredient block, with `ingredient_id`, `shown_count` (0 to 3), `outcome` (`shown`, `none_known`, `none_in_stock`, or `not_reviewed`), `recipe_kind` (`catalog` or `house`), and `platform`. It fires at most once per mounted Quick Build screen for each recipe, ingredient, and outcome combination: unit toggles, re-renders, background refetches, and locale changes never send it again. It sends nothing else about the user or the bar, goes through the existing PostHog clients (`apps/web/src/analytics/posthog-client.ts`, `apps/mobile/src/analytics/posthog-client.ts`), and is skipped when analytics are disabled (`isAnalyticsDisabled` on mobile, the web consent state).
- **AC-13**: A seeding script in `packages/shared/scripts` asks Haiku for up to 5 ranked one way swaps per ingredient (substitute, ratio, optional note), choosing only from existing ingredient ids, and writes a review file you edit. A matching apply script refuses entries you have not marked reviewed in that file, trims notes, checks every DB rule, and writes a SQL file that you run in the SQL editor. For each ingredient in the file, in one transaction, it deletes that ingredient's existing swap rows, inserts the reviewed ones, and sets `substitutes_reviewed_at`. Ingredients reviewed with zero swaps get the timestamp too. You can rerun it for only the ingredients where `substitutes_reviewed_at` is null.
- **AC-14**: `translate-catalog` translates swap notes into every non English supported locale, storing `source_note_hash`, and skips rows whose translation hash already matches.
- **AC-15**: The database rejects, whatever the write path: a swap of an ingredient for itself, `rank` outside 1 to 5 or repeated for the same ingredient, `ratio` outside 0.25 to 4, a note that is blank or over 120 characters after trimming, and a translation for an unknown locale. Clients (anon and authenticated) can read swaps and translations but cannot insert, update, or delete them.

## Decision

**Chosen option**: Option 1: Curated catalog table seeded by Haiku, delivered through the bar service data.

Swaps live in a reviewed `ingredient_substitutes` table, are returned (with their translations) for the bar's currently 86'd ingredients inside `fetch_bar_service_data` (already persisted offline), and are filtered, localized, and ranked on the client by one pure function in `packages/shared`.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `react-native-best-practices` (`callstackincubator/agent-skills`, `.agents/skills/react-native-best-practices/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`) · `posthog-instrumentation` (`posthog/posthog-for-claude`, `.agents/skills/posthog-instrumentation/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

| Table | Column | Type | Null | Constraint / notes |
|---|---|---|---|---|
| `ingredient_substitutes` (new) | `ingredient_id` | uuid | no | FK `ingredients.id` `on delete cascade`; PK part |
| | `substitute_ingredient_id` | uuid | no | FK `ingredients.id` `on delete cascade`; PK part; check `<> ingredient_id` |
| | `rank` | smallint | no | check `between 1 and 5`; unique (`ingredient_id`, `rank`) |
| | `ratio` | numeric(4,2) | no | default `1`; check `between 0.25 and 4` |
| | `note` | text | yes | check `note = btrim(note) and char_length(note) between 1 and 120` |
| | `note_hash` | text | yes | generated always as `md5(note)` stored (the one definition of the hash; null when `note` is null) |
| | `created_at`, `updated_at` | timestamptz | no | `set_updated_at` trigger |
| `ingredient_substitute_translations` (new) | `ingredient_id`, `substitute_ingredient_id` | uuid | no | composite FK to `ingredient_substitutes` `on delete cascade` |
| | `locale` | text | no | FK `supported_locales.code`; check `<> 'en'` |
| | `note` | text | no | same trim and 1 to 120 check |
| | `source_note_hash` | text | no | the `note_hash` it was translated from |
| | `created_at`, `updated_at` | timestamptz | no | PK (`ingredient_id`, `substitute_ingredient_id`, `locale`) |
| `ingredients` (changed) | `substitutes_reviewed_at` | timestamptz | yes | null = not reviewed; set with zero rows = no good substitute |

Relationships: an ingredient has 0 to 5 substitutes (1:N, one way rows; a two way pair is two rows). A substitute row has 0 to 8 translations (1:N). Index: the PK covers lookups by `ingredient_id`; add an index on `substitute_ingredient_id` for the cascade delete. Rows are one way: "if `ingredient_id` is out, use `substitute_ingredient_id`".

**State transitions**: none (catalog data; an ingredient moves from unreviewed to reviewed when the apply SQL sets `substitutes_reviewed_at`).

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `fetch_bar_service_data` (changed RPC, same signature) | `rpc` | `p_bar_id` uuid (req), unchanged | existing `menu`, `house_recipes`, `stock_86`, plus `house_recipes[].alcohol_free` boolean and a new `substitutes` jsonb (below) | bar member, not anonymous (unchanged) | `42501` not a member (unchanged) |
| `fetchBarServiceData(client, barId)` (`packages/shared/src/bar.ts`) | function | client, `barId` (unchanged) | `BarServiceData` with new `substitutes: BarIngredientSubstitutes[]` and `houseRecipes[].alcoholFree` | caller's session | throws the RPC error, as today |
| `fetchQuickBuildRecipeDetail` (changed, `bar.ts`) | function | unchanged | `QuickBuildRecipeDetail` gains `alcoholicStatus: string \| null` from `fetch_recipe_detail.alcoholic_status` | unchanged | unchanged |
| `pickSubstitutes(input)` (new, `packages/shared/src/substitutes.ts`) | pure function | `ingredientId`, the bar's `substitutes`, `stock86`, `recipeIngredientIds`, `alcoholFree`, `locale`, `limit` (3) | `{ outcome: 'shown' \| 'none_known' \| 'none_in_stock' \| 'not_reviewed', items[] }`, each item with localized name and note, ratio, `addedAllergens`, `allergensUnknown`, `alreadyInDrink` | none (pure) | none; never throws |
| `formatSubstituteAmount(input)` (new, same file) | pure function | original `amountValue`, `amountMaxValue`, `amountUnit`, original parts value (parts mode), `ratio`, selected unit, `locale` | `{ kind: 'amount', text } \| { kind: 'ratio_phrase', key, approximate } \| { kind: 'none' }` | none | none |

`substitutes` shape: one entry per ingredient with `bar_ingredient_stock.is_86d = true` at the bar:
`{ ingredient_id, reviewed (bool, from substitutes_reviewed_at is not null), allergens (text[] | null), items: [{ substitute_ingredient_id, name (English), name_translations ({locale: name}), rank, ratio, note (English or null), note_hash, note_translations ({locale: {note, source_note_hash}}), category, allergens (text[] | null) }] }`. Items are ordered by `rank` with all ranks included (up to 5). Stock filtering, locale choice, and the hash check happen in `pickSubstitutes`, so a cached snapshot filters against its own `stock_86` and works in any locale offline.

Outcome mapping: rows exist and at least one survives both filters → `shown`; reviewed (or rows exist) but none survive the alcohol rule → `none_known` ("No good substitute"); some survive the alcohol rule but all are 86'd → `none_in_stock`; not reviewed and no rows → `not_reviewed` (heading only).

Quick Build data wiring: both Quick Build screens add `useCurrentBar()` then `useBarServiceData(barId)` with `enabled: barId != null`, reusing the existing `["bar-service-data", barId]` key unchanged (so `use-bar-mutations.ts` invalidation and `use-bar-removal-eviction.ts` keep working). The persister buster moves from `bartender-mode-v1` to `bartender-mode-v2` on both `apps/web/src/app/[locale]/providers.tsx` and `apps/mobile/src/app/_layout.tsx`, kept identical.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Banner shows | Which ingredients are 86'd | `stock_86` from `fetch_bar_service_data`, intersected with the open recipe's ingredient ids |
| Banner shows | Current bar | `useCurrentBar()` (existing current bar storage), newly called by both Quick Build screens |
| Banner shows | 86'd heading name | the Quick Build ingredient `name` already rendered for that line |
| Banner shows | Staple exclusion | `QuickBuildIngredient.isStaple` |
| Banner order | Block order | the recipe's ingredient order as Quick Build renders it, deduped by ingredient id |
| Swap list | Candidate swaps and rank | `substitutes[].items` (column `ingredient_substitutes.rank`) |
| Swap list | Stock filter | `stock_86` in the same service data snapshot |
| Swap list | Substitute name | `items[].name_translations[locale]` (from `ingredient_translations`), else `items[].name` |
| Swap list | Note text | `items[].note_translations[locale].note` when its `source_note_hash` equals `items[].note_hash`, else `items[].note` |
| Swap list | `locale` | the app's current locale (web `useLocale()`, mobile the active i18next language), passed to `pickSubstitutes`, never to the RPC |
| Adjusted amount | Original amount and unit | `QuickBuildIngredient.amountValue`, `amountMaxValue`, `amountUnit` (catalog from `fetch_recipe_detail`, house from `bar_recipe_ingredients`) |
| Adjusted amount | Parts value | the original line from `computeParts(ingredients)`, as Quick Build already computes it |
| Adjusted amount | Display unit | Quick Build's selected unit (`quick-build-unit-storage`) |
| Adjusted amount | Formatting | `formatAmountInUnit` in `packages/shared/src/units.ts`, with the current locale |
| Adjusted amount | Multiplier | `ingredient_substitutes.ratio` |
| Ratio phrase | Phrase key | nearest step of 0.25, 0.33, 0.5, 0.67, 0.75, 1.25, 1.5, 2, 3, 4; exact when within ±0.01, else `approximate` ("about" prefix); one UI string per step, 9 locales |
| Empty outcome | Reviewed or not | `substitutes[].reviewed`, from `ingredients.substitutes_reviewed_at is not null` |
| Alcohol rule | Recipe is alcohol free | catalog: new `QuickBuildRecipeDetail.alcoholicStatus === 'non_alcoholic'`; house: `serviceData.houseRecipes` entry with the same id, its new `alcohol_free` computed in the RPC (base recipe's `alcoholic_status = 'non_alcoholic'` when `base_recipe_id` is set, else no ingredient in `spirit`/`liqueur`) |
| Alcohol rule | Substitute is alcoholic | `items[].category` in `spirit`, `liqueur`, or null |
| Allergen tag | Labels | `ALLERGENS` in `packages/shared/src/allergens.ts` and the existing allergen UI strings (spec 0043) |
| Allergen tag | Added allergens | `items[].allergens` minus `substitutes[].allergens` (null original counts as empty) |
| Allergen tag | Unknown | `items[].allergens is null` |
| Already in drink | Label | `substitute_ingredient_id` in the open recipe's ingredient ids |
| Menu hint | Swap available | `pickSubstitutes` over each menu item's 86'd ingredients, with that house recipe's `alcohol_free` |
| Analytics | Event props | derived from `pickSubstitutes` output, recipe kind from the Quick Build route `kind`, platform from the app |
| Analytics | Dedupe key | `recipeId + ingredientId + outcome`, held in a ref for the screen's mount; a `useEffect` sends only unseen keys |

**Key invariants**:
- Swaps are one way; the DB enforces no self swap, rank 1 to 5 unique per ingredient, ratio 0.25 to 4, note trimmed 1 to 120.
- A substitute that is 86'd at the bar, or alcoholic in an alcohol free recipe, is never displayed.
- "No good substitute" only appears for a reviewed ingredient; an unreviewed ingredient never claims there is none.
- The filter and ranking logic exists once, in `pickSubstitutes`, used by both apps and by both the banner and the menu hint.
- A stale note translation never shows; it falls back to English.

**Security model**:
- `ingredient_substitutes` and `ingredient_substitute_translations`: RLS on, `select` for `anon` and `authenticated` (same as `ingredients`); `insert`/`update`/`delete` revoked from both. Writes only come from the apply SQL that you run in the SQL editor.
- The bar specific view (which ingredients are 86'd, house recipe status) stays inside `fetch_bar_service_data`, which keeps its member check, anonymous rejection, `security definer`, and pinned `search_path`.
- No personal data, so no compliance scope. The analytics event carries no user or bar identifiers beyond PostHog's own distinct id.

**Configuration required**: none new. The seeding script uses the existing `ANTHROPIC_API_KEY` that the other catalog scripts already read. It calls Haiku 5.5 (`claude-haiku-5-5`, the model the comment screening function in spec 0062 uses), defined as a constant in the new script; the older catalog scripts still pin `claude-haiku-4-5-20251001` and are not changed here.

**Critical test scenarios**:
- Happy path: lime 86'd, a Daiquiri in Quick Build shows "Lime is 86'd" with lemon first, at the adjusted amount in ml after toggling to ml, verifies **AC-1**, **AC-2**, **AC-3**.
- Stock skip: lemon (rank 1) also 86'd, so the rank 2 and rank 3 swaps show, plus rank 4 if it exists, verifies **AC-2**.
- Empty outcomes: a reviewed ingredient with zero rows shows "No good substitute"; one with all swaps 86'd shows "No substitute in stock"; an unreviewed one shows only the heading, verifies **AC-5**.
- Mocktail: a `non_alcoholic` recipe never lists a liqueur swap, and a standalone house recipe with no spirit or liqueur behaves the same, verifies **AC-6**.
- Allergen and already in drink: an orgeat swap for simple syrup shows a tree nuts tag; lemon in a recipe that already uses lemon shows "already in this drink", verifies **AC-7**, **AC-8**.
- Unparseable amount: "top up" soda with a 0.5 ratio swap shows "1/2 the amount", verifies **AC-4**.
- Offline: load the bar, force close, reopen in airplane mode (web: network off, tab reopened); the banner and its swaps still render, verifies **AC-10**.
- Locale: in `es`, the note shows in Spanish; after the English note changes (hash mismatch), it shows the new English note; switching to `fr` while offline still shows the banner, verifies **AC-9**, **AC-10**, **AC-14**.
- Amount edge cases: a 1 to 1.5 oz range with ratio 0.5 shows 0.5 to 0.75 oz; 2 dashes with ratio 0.5 shows 1 dash; parts mode scales the part value, verifies **AC-3**.
- No bar data: with no current bar, or bar data loading or failed, the recipe renders immediately with no banner; a duplicate 86'd ingredient shows one block; an 86'd Ice shows none, verifies **AC-1**.
- Analytics: toggling oz/ml and a background refetch send no second `substitutes_shown` for the same ingredient, verifies **AC-12**.
- Auth/permission: a non member calling `fetch_bar_service_data` still gets `42501`; an authenticated client `insert` into `ingredient_substitutes` is rejected, verifies **AC-15**.

## Build plan

Tracer Bullet: the first slice runs one real swap from the database to the Quick Build banner on web, then later slices add each piece.

1. Migration (written as a file, applied by you in the SQL editor, with a rollback file): `ingredient_substitutes` (with the generated `note_hash`), `ingredient_substitute_translations`, `ingredients.substitutes_reviewed_at`, constraints, RLS, revokes; `create or replace` of `fetch_bar_service_data` with the same one argument signature (so the existing grants and anon revoke still apply), adding `house_recipes[].alcohol_free` and `substitutes` with their translation maps. Seed a handful of hand written rows (lime, lemon, simple syrup) in the same apply file so the thread has real data. Regenerate `database.types.ts`, satisfies **AC-15**, and the data layer for **AC-1**, **AC-2**, **AC-6**, **AC-9**.
2. `packages/shared`: `substitutes.ts` with `pickSubstitutes` and `formatSubstituteAmount` (pure, unit tested beside the source); `fetchBarServiceData` mapping `substitutes` and `alcoholFree`; `fetchQuickBuildRecipeDetail` mapping `alcoholicStatus`; exported types, satisfies **AC-2** through **AC-9**.
3. Web thin thread: in `quick-build-page-client.tsx`, add `useCurrentBar()` and `useBarServiceData(barId)` (enabled only with a bar, never blocking the recipe), then render the 86'd banner: one deduped block per non staple 86'd ingredient with swaps, amounts, empty lines, labels, and tags; English strings first; bump the buster to `bartender-mode-v2` in `providers.tsx`, satisfies **AC-1** through **AC-8**, **AC-10** (web).
4. Mobile parity: the same wiring and banner in `apps/mobile/src/app/bartender-build/[kind]/[id].tsx`, and the same `bartender-mode-v2` buster in `_layout.tsx`, satisfies **AC-1** through **AC-8**, **AC-10** (mobile).
5. Menu "swap available" hint on the Service screen (`apps/web/src/service/service-page-client.tsx`, `apps/mobile/src/app/service.tsx`), satisfies **AC-11**.
6. Strings: banner heading, empty lines, labels, allergen tag text, and ratio phrases in all 9 locales on both apps, satisfies **AC-9**.
7. Analytics: `substitutes_shown` on both apps through the existing PostHog clients, gated on the analytics flag, deduped per mount by `recipeId + ingredientId + outcome`, satisfies **AC-12**.
8. Seeding pipeline: `propose-ingredient-substitutes.ts` (Haiku 5.5, batches over ingredients with null `substitutes_reviewed_at`, writes a review file through the existing `review-file.ts` helper, passes the ingredient list and categories so Haiku can only pick existing ingredient ids) and `apply-ingredient-substitutes.ts` (refuses unreviewed entries, trims notes, validates against the DB rules, writes an apply SQL file that deletes then inserts each ingredient's rows in one transaction and sets `substitutes_reviewed_at`); package scripts for both. You then run the proposal, review it, and apply it across the catalog, satisfies **AC-13**.
9. Note translations: extend `translate-catalog.ts` to cover swap notes for every non English locale with the hash skip, and produce its apply SQL, satisfies **AC-14**, **AC-9**.

## Consequences

**Positive**:
- A swap shows instantly and offline, with no per view cost and no new query, because it rides on data Quick Build already persists.
- One pure function decides what shows, so web, mobile, the banner, and the menu hint cannot disagree.
- The swap table is reusable later for home recipe pages and pantry ideas, with no schema change.
- It closes the Quick Build part of spec 0023 AC-10, which was never built.

**Negative / tradeoffs**:
- Swaps are per ingredient, not per recipe, so a swap that is fine in a sour but wrong in a stirred drink shows in both. The note has to carry that nuance.
- Quality depends on your review of about 400 ingredients; until the review is applied, most 86'd ingredients show only the heading.
- `fetch_bar_service_data` returns a larger payload (swaps plus every locale's translations, limited to currently 86'd ingredients), and the persister buster bump drops every user's offline Bartender Mode cache once on upgrade.
- Quick Build now loads the bar service data too, so opening it with a bar selected costs one more request (usually already cached from the Service screen).
- Teammate 86 changes still only appear on the next service data refetch (existing behavior), so a swap can briefly suggest something a teammate just 86'd.
- New ingredients added by the import job have no swaps until you rerun the seeding script.

**Neutral**:
- One migration, applied by you in the SQL editor, plus two new scripts following the existing propose, review, and apply pattern.
- Bar owners cannot add or hide swaps for their bar yet.

## Follow-up

- [ ] Search result 86'd marker (the rest of spec 0023 AC-10) is still unbuilt; it stays a 0023 follow up.
- [ ] Bar specific swaps (owner adds or hides a swap for their bar) once real use shows the catalog swaps fall short.
- [ ] An admin page to edit swaps, if review files become painful to maintain.
- [ ] Reuse the swap table on home recipe pages and in pantry drink ideas as a separate feature.
- [ ] Have the import job (or a freshness check, spec 0056) flag new ingredients with null `substitutes_reviewed_at` so they get reviewed.
