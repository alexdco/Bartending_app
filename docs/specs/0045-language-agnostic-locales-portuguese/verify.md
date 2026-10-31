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

If you add or edit a recipe or translation between runs, the `fetch_recipe_detail` hash moves for that reason alone; take a fresh baseline instead of comparing across catalog edits.

`match_recipes_to_pantry` reads the caller's own pantry (`auth.uid()`), which is empty in the SQL editor, so it is checked by hand in the app instead: with the same pantry, `/es/pantry` lists the same recipes in the same order before and after.
