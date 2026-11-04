# Verify: language agnostic locales and Brazilian Portuguese · spec 0045 · updated 2026-10-31
_Steps derived from spec 0045 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Spanish snapshot (AC-5)

Run this in the SQL editor before migration A, after migration A, and after migration B. Every row must match the baseline. `fetch_recipe_detail` covers every live recipe in `es`; each search row hashes the ordered `search_recipes` plus `search_ingredients` output for one Spanish term. (`recommend_recipes` is the documented exception and is not snapshotted.)

```sql
with detail as (
  select r.id, md5(d::text) as h
  from public.recipes r
  cross join lateral public.fetch_recipe_detail(r.id, 'es') d
  where r.deleted_at is null
),
q(term) as (values ('limón'),('margarita'),('ron'),('naranja'),('café'),('menta'),('ginebra'),('fresa')),
srch as (
  select q.term,
    (select md5(coalesce(string_agg(s::text, '|' order by ord), '')) from public.search_recipes(q.term, null, 50, 0, 'es') with ordinality s(id, ord)) as recipes_h,
    (select md5(coalesce(string_agg(i::text, '|' order by ord), '')) from public.search_ingredients(q.term, 50, 'es', true) with ordinality i(id, ord)) as ingredients_h
  from q
)
select 'fetch_recipe_detail' as what, count(*)::text as n, md5(string_agg(id::text || h, '' order by id)) as hash from detail
union all
select 'search ' || term, null, md5(recipes_h || ingredients_h) from srch;
```

**Baseline, taken 2026-10-31 before migration A** (run twice, identical both times):

| what | n | hash |
|---|---|---|
| fetch_recipe_detail | 468 | `21edf209e008f458980ec327b0f009ed` |
| search limón | | `19de3a10ab2de2477359cdaa4420d601` |
| search margarita | | `0f15b18b0df6f3bd93c32728860b1fee` |
| search ron | | `5e9872bc2813231d5f426f9e7bc78af1` |
| search naranja | | `f466016b02408dba53e9d98598ccaebb` |
| search café | | `2a87430dd339eb4d75a646a9e6efeb2e` |
| search menta | | `be2a46640e4e52cb3d4fbc067504bf04` |
| search ginebra | | `55134cfe5bf36df42867bb835d4c3798` |
| search fresa | | `59ecf4b337e7068ebf8b49c582043485` |

This baseline matched after migrations A, B, and C and after the Portuguese backfill. **Current `fetch_recipe_detail` hash: `4bed1a3246a5396ba5a67e146b81be40`** (468 rows), taken 2026-10-31 after deleting one Spanish measure row, "(ninguna)" on Limeade's lime peel, a line with no English measure. The search hashes did not change.

If you add or edit a recipe or translation between runs, the `fetch_recipe_detail` hash moves for that reason alone; take a fresh baseline instead of comparing across catalog edits.

`match_recipes_to_pantry` reads the caller's own pantry (`auth.uid()`), which is empty in the SQL editor, so it is checked by hand in the app instead: with the same pantry, `/es/pantry` lists the same recipes in the same order before and after.

## Structure (AC-4)

Run after migrations B and C. The first query returns no rows, the second returns exactly one row.

```sql
-- Locale aware functions that still name a locale or its search config.
select p.oid::regprocedure
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosrc ~ '''(es|pt|spanish|portuguese)''';

select p.oid::regprocedure
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'recommend_recipes';

-- Check constraints on a locale column: only (locale <> 'en') may appear.
select conrelid::regclass, pg_get_constraintdef(oid)
from pg_constraint
where contype = 'c' and pg_get_constraintdef(oid) ~ 'locale';
```

## UI / manual

- [ ] Search `/pt` for a translated recipe name (Portuguese stemming), then for an untranslated recipe's English name → both found → AC-3
- [ ] `Accept-Language: pt-BR` on `/` and on `/pantry` → redirects to the `/en` path → AC-7
- [ ] Visit `/pt/`, then a bare path → lands on `/en`; the `NEXT_LOCALE` cookie says `pt` and is ignored → AC-7
- [ ] `user_preferences.locale = 'pt'` on a signed in user → bare path lands on `/en`, stored value untouched → AC-7, AC-15
- [ ] Language menu and production mobile card have no Português; a mobile dev or preview build does → AC-7, AC-8, AC-16
- [ ] `/sitemap.xml`, page alternates, and response headers have no `pt` → AC-7
- [ ] `/pt/` renders with `noindex`, a self canonical, and no alternates; `/robots.txt` still lists `/pt/...` private paths → AC-7
- [ ] `/es/recipes/<slug>` has `<html lang="es">` and `es`/`en` hreflang → AC-14 (after launch, `pt-BR`)
- [ ] Admin edit: saving Portuguese notes changes only the `pt` row; a recipe with no `pt` row shows the explicit error; a non admin gets `42501` → AC-11
- [ ] `generate-drink-idea` with `locale: "pt"` returns Portuguese text and passes verification → AC-12

## Commands

- [ ] `pnpm --filter @bartendingapp/shared translate-catalog --locale pt`, stop it partway, run again → the second run translates only the rest → AC-2, AC-9
- [ ] `pnpm --filter @bartendingapp/shared translate-catalog --locale en` and `--locale fr` → rejected → AC-9
- [ ] `pnpm --filter @bartendingapp/shared apply-recipe-notes` with an old `es` shaped file → rejected, no writes; with a recipe missing its `pt` row → reported under `pt` → AC-10
