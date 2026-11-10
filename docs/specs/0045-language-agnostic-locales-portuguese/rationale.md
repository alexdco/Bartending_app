# 0045. Rationale: language agnostic locales and Brazilian Portuguese

## Context

Spec 0020 shipped Spanish and claimed a third language would be "a config change plus a backfill run, not a migration." The code says otherwise:
- The four translation tables each carry `check (locale in ('es'))`, and `user_preferences.locale` carries `check (... in ('en','es'))`.
- `recipe_translations.name_search` is generated as `to_tsvector('spanish', name)`, a schema level hardcode that can't serve a second translated language.
- Twelve live functions resolve locale with `case when p_locale in ('es') ...`, and search hardcodes `websearch_to_tsquery('spanish', ...)`. An unrecognized code silently falls back to English, so adding `pt` to TS alone would look like it works while serving English everywhere.
- The recipe notes pipeline (spec 0043) uses `es_*` fields in the review file and in `apply_recipe_notes`.
- `site-nav.tsx` and mobile `account.tsx` hardcode `["en","es"]`, and `generate-drink-idea` keeps its own list.

Other forces: Spanish UI translation isn't finished (feature 41), so any new language would chase strings twice. Search engines index whatever is linked, so an incomplete language must stay undiscoverable. You apply migrations by hand in the SQL editor, so fewer and smaller migrations per language matter. Spanish is live and must not change.

## Options considered

### Option 1: `supported_locales` table plus helper functions (chosen)

A small table (code, text search config) is the SQL list. Foreign keys replace the checks, a trigger fills `name_search`, and two helpers replace every inline `case`.

**Pros**: the next language is one insert. Each layer has one list. The foreign keys reject unknown codes at write time.
**Cons**: one larger migration now. `name_search` moves from a generated column to a trigger. Each read gains a tiny lookup.

### Option 2: one SQL helper function with the list written in

An immutable `resolve_locale()`/`locale_search_config()` with a hardcoded `CASE`. The checks are widened, and `name_search` stays generated, using a `CASE` expression.

**Pros**: no new table. Immutable helpers can be used in generated columns and indexes.
**Cons**: every new language still needs a migration that replaces the helpers and rebuilds the generated column. There are two lists (TS and the function), and nothing can join against the SQL one.

### Option 3: widen the existing hardcodes in place

Change `in ('es')` to `in ('es','pt')` in twelve functions and five constraints, and add a `CASE` for search.

**Pros**: the smallest diff today, with no new concepts.
**Cons**: the next language repeats the whole sweep, and every missed spot fails silently as English. This is exactly how 0020's claim went wrong.

## Rationale

The silent English fallback is the deciding force. A language added to TS but missed in one SQL function never errors, it just quietly serves English. Only Option 1 makes the database itself know the list, so the parity test and the foreign keys catch drift loudly. Option 2 halves the sweep but keeps a per language migration, which matters when you apply every migration by hand. The cost of Option 1 is one trigger replacing a generated column on a table of about 430 rows, a small, contained change.

Brazilian Portuguese (code `pt`) was chosen for reach alongside a Latin American Spanish audience. Keeping the main language code only matches how `en`/`es` work, so detection and routing need no region logic. `pt-BR` is still announced to search engines through `LOCALE_HREFLANG`. Fallback goes straight to English, not through Spanish: English is the source text, so it is always present and always accurate, and one rule keeps every query a single join.

Gating with `LAUNCHED_LOCALES` (a code list) won over a PostHog flag because routing, the sitemap, and hreflang are decided at build and render time on the server, where a remote flag adds a network dependency to SEO pages. Making recipe notes and admin editing per locale (rather than auto translating notes) keeps Portuguese tips under the same human review as Spanish ones, and it makes the next language free.

## Notes backfill for a new locale (added 2026-11-03)

### Context

The notes pipeline was built (build step 5a) to propose English and every locale together, for recipes missing an English note. Every recipe already has reviewed English notes, so a plain run finds nothing for Portuguese, and `--all` would regenerate and then overwrite reviewed English and Spanish text. The validator also needs every locale block on every row, so a Portuguese only file can't pass. An admin edit to an English note clears that field in every locale (spec 0043 AC-10), so an empty translated note already means "needs translating," whether it is new or went stale.

### Options considered

**Option A: a `--locale` pass that translates the reviewed English notes, per field (chosen).** Its own review file and its own apply function, which writes only that locale's rows. **Pros**: English and other locales can't be touched by construction, not by care; the same tool refills fields cleared by English edits in any locale; the next language needs nothing new. **Cons**: a second file shape and a second SQL function; notes follow the English wording, so they read a little less native.

**Option B: the same pass, but writing fresh notes from the recipe alone.** **Pros**: more natural text in each language. **Cons**: Portuguese tips can drift from or contradict the reviewed English ones, and the reviewer has no source to check against.

**Option C: fold notes into `translate-catalog`.** **Pros**: reuses hash gating and one job per locale. **Cons**: skips the review file, which is the whole reason the notes pipeline exists apart from the catalog translation.

**Option D: loosen `apply_recipe_notes` so English fields and locale blocks are all optional.** **Pros**: one function. **Cons**: weakens the checks on the English path and mixes two contracts in one payload, so a mistake in a backfill file could reach `recipes`.

### Rationale

The deciding force is that reviewed text must be impossible to overwrite by accident, not merely unlikely. Option A gets that from the shape: the file has no English, and the function never writes `recipes`. Per field filling follows directly from the English edit rule, which clears one field at a time, so filling whole blocks would rewrite reviewed Portuguese beside the empty field. A file per locale keeps a days long native review from blocking new recipe imports. The default run moves to `CATALOG_TRANSLATION_LOCALES` because that is exactly where translation rows exist, so it stops paying for notes that would only be skipped.

Calls made while writing (you may override any):
- **Stale check on apply**: each file row carries its English `source` text, and apply skips and reports any field whose English changed since propose. It guards the real window of a long review. Runner up: no check, relying on the reviewer.
- **Gone, not an error, for a deleted recipe**: a recipe soft deleted during a days long review is reported and skipped, so one deletion never blocks the backfill. Malformed rows still reject the whole file. Runner up: raise, as the default apply does (found by the cross check).
- **Overwrite, not fill only, on apply**: one rule, matching English today, chosen by you. Runner up: fill only with a second report.
- **Batch size 20** for the `--locale` pass, since output is one language and often one field. Runner up: 10, as the default run uses.
- **Selection as a pure function** (`planLocaleNoteBackfill`), so the rule that protects reviewed text is unit tested without a database. Runner up: inline in the script.
- **Migration D, not an edit to C**: you weren't sure whether C is live, and a new function applies cleanly either way.
