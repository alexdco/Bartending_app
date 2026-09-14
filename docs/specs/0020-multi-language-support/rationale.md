# 0020. Multi language support: rationale

## Context

The app is English only today. Recipe data (`recipes.name`, `recipes.instructions`, `ingredients.name`, `tags.name`) was imported once from TheCocktailDB, a public English language source, and stored as plain text with no locale dimension (spec 0002). App UI strings across `apps/web` and `apps/mobile` are hardcoded English, with no translation library installed on either platform. `docs/scope/scope.md` lists "Multi language / internationalization" under Deferred, tagged "needs a decision", meaning the product intentionally shipped English only through its first fourteen slices and is now choosing whether and how to add a second language.

The forces at play: pantry matching (spec 0002, 0006) depends on ingredients resolving to one canonical identity regardless of display language, so any translation approach must not fork that identity. The recipe catalog is reimported periodically (spec 0002's import job) and reconciled automatically; any translation approach that requires a manual step per recipe conflicts with that automation. The project already operates one AI integration (spec 0007, Claude Haiku via a quota checked Edge Function) and one SEO investment (spec 0011, slugged indexable recipe URLs); both are directly relevant infrastructure a translation approach can reuse or must not undermine. The consequence of not deciding this now, per the scope's own framing, is staying English only indefinitely with no path for a non English speaking user to get the core value of the app (reading real recipe instructions) even if the surrounding chrome were translated.

## Options considered

### Option 1: Translate UI and recipe content, AI translated recipe data cached in Postgres

Every app string goes through a standard i18n library. Recipe, ingredient, and tag names/instructions get a per language row in new translation tables, populated by calling the existing Claude Haiku integration once per recipe per language, cached indefinitely, and refreshed only when the source recipe or the language list changes.

**Pros**:
- Full experience in each language: nothing left in English that shouldn't be.
- Reuses the AI integration and quota pattern already proven in spec 0007; no new vendor or contract.
- Caching means the AI cost is paid once per recipe per language, not per page view.

**Cons**:
- Adds three new tables and a locale dimension to every catalog read path (search, detail, popular by region).
- Machine translated cocktail terminology (measures, garnish names) is not human reviewed; quality depends on the model, not a linguist.

### Option 2: Translate UI strings only, recipe content stays English

Standard i18n library for app chrome; recipe data (name, instructions, ingredients) is never translated regardless of locale.

**Pros**:
- No database schema change, no translation pipeline, no new AI cost.
- Much smaller build: a well understood, purely front end i18n setup.

**Cons**:
- A Spanish speaking user gets a half translated app: navigation and buttons in Spanish, but the actual content they came for (recipes) stuck in English. This undercuts the entire point of the feature for anyone who does not already read English recipe instructions comfortably.

### Option 3: Translate everything using a professional human translation service

Same UI scope as Option 1, but recipe content is exported, sent to a translation vendor or freelancer, and imported back by hand.

**Pros**:
- Highest quality, linguist reviewed cocktail terminology.

**Cons**:
- Manual export or import pipeline, not automatable; breaks the existing reimport job's assumption that the catalog refreshes itself end to end (spec 0002).
- Real per word cost per language, recurring on every new or changed recipe from every future reimport, not a one time cost.

**This option is not chosen.** The project has no existing vendor relationship for translation, and the recurring manual step conflicts with spec 0002's automated reconciliation pipeline; Follow-up notes it as a possible quality upgrade path once usage justifies the cost.

## Rationale

Recipe search and detail (spec 0004) is the app's core loop; leaving recipe content English only (Option 2) would translate the frame around the product but not the product itself, which does not meet the actual goal of a Spanish speaking user having a native experience. Between AI translation and a human service (Option 3), the project already runs a quota checked Claude Haiku integration for AI generated drink ideas (spec 0007) with an established pattern for calling and caching Anthropic output; extending that pattern to catalog translation reuses proven infrastructure instead of standing up a new vendor relationship, and keeps translations current automatically through the existing reimport job (spec 0002) rather than adding a manual step that job was specifically designed to avoid.

Keeping `ingredients.id` as the single canonical key for matching, with translations as a separate display only table, follows directly from spec 0002's own reasoning for canonicalizing ingredient identity: pantry matching (AC-4 there, AC-6 here) must never depend on which language a name happens to be displayed in, so the matching column can never itself be locale specific.

Locale prefixed URLs on web extend spec 0011's SEO investment (indexable, crawlable, unique per language) rather than trading it away for a simpler cookie based approach; mobile has no equivalent SEO concern, so the added complexity of locale namespaced routes there is not justified by any 0011-shaped benefit.

## Cross check

An independent review of the drafted spec surfaced eight gaps before this spec was finalized, four load bearing enough to block a build: the recipe slug source was unspecified (resolved: slug is computed from the locale resolved name, AC-12); `generate-drink-idea`'s pantry verification would have failed on every Spanish call because it checked a localized ingredient name against an English pantry set (resolved: Claude also returns an English `source_name` per ingredient, verified against that instead, AC-10); several read paths (recipe detail, pantry, favorites, homepage, `match_recipes_to_pantry`'s display strings) are plain PostgREST embeds, not the five RPCs the first draft extended, and would have stayed English only (resolved at the time by `recipes_localized`/`ingredients_localized` views, see *Correction* below for why that resolution was itself wrong, AC-13); and the migration added no search index for the new translation tables, which would have made AC-7 unsatisfiable as drafted (resolved: per locale FTS/trigram indexes, unioned with the English match so an untranslated recipe stays findable, AC-14). Four smaller gaps were also resolved: the `user_preferences.locale` update mechanism now mirrors spec 0018's existing column scoped upsert pattern instead of introducing a new RPC; a `source_name_hash` column bounds re-translation to genuinely changed recipes (AC-17); the sign in merge rule for a guest's local locale versus a stored account value is now explicit (AC-16); and the translation scope for `measure`/`glass`/`region` is now stated rather than left implicit (AC-15).

## Correction (2026-09-13): locale resolution for the embed based read paths

The `recipes_localized`/`ingredients_localized` views chosen above to close the "several read paths are plain PostgREST embeds" gap were justified in the original spec as resolving locale "via a session parameter, the same mechanism Postgres RLS policies already use for `auth.uid()`." That justification does not hold. `auth.uid()` requires no custom wiring because Supabase's PostgREST layer verifies the caller's JWT and populates `request.jwt.claims` automatically before any query executes; there is no equivalent automatic channel for an arbitrary session GUC like `request.locale`. Nothing in this codebase ever called `set_config('request.locale', ...)`, no `db.pre-request` hook was configured, and no client sent a header such a hook could read. The views' `current_setting('request.locale', true)` lookup always returned null, so both views always resolved to plain English, silently.

**Options considered for the fix**:

**Option A: PostgREST custom header + `db.pre-request` hook.** Supabase genuinely supports this pattern (unlike the bare session GUC originally specified): a Postgres function registered as `db.pre-request` in `supabase/config.toml` reads a custom HTTP header via `current_setting('request.headers', true)::json` and calls `set_config` before each query. This would let `.from(table).select(...)` embed syntax keep working unchanged. Rejected because it introduces a second, different locale passing mechanism alongside the explicit `.rpc()` parameter already used everywhere else (`search_recipes`, `match_recipes_to_pantry`, and the four others build plan step 4 wired), a hidden, request scoped, config file dependent channel is harder to reason about and test than an explicit function argument, and every client (web and mobile alike) would still need new code to attach the header on every request, no less code than switching to `.rpc()`.

**Option B (chosen): convert the four affected reads to Postgres RPC functions taking `locale` as an explicit parameter.** `fetch_recipe_detail`, `fetch_pantry_items`, `fetch_favorite_recipes`, `fetch_recipes_by_ids` replace the `recipes_localized`/`ingredients_localized` embed reads, matching the pattern the other five locale aware reads already use successfully. No hidden state, no separate infrastructure configuration, and one locale passing mechanism for every catalog read in the app rather than two.

**Rationale**: consistency with the proven pattern outweighs the marginal convenience `.from().select()` embed syntax offered; the project already committed to explicit `locale` RPC parameters for the majority of catalog reads (build plan step 4), and a second mechanism for a minority of them is exactly the kind of inconsistency that produces bugs like this one. This was only caught because build plan step 5 was still unbuilt when reviewed; had it shipped, every recipe detail page, pantry list, favorites list, and recently viewed carousel would have silently stayed English only regardless of the caller's selected locale.
