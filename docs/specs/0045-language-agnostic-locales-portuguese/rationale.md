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
