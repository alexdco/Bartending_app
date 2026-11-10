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

**Fresh baseline, taken 2026-11-09** (475 live recipes; the 10-31 hashes no longer apply after catalog edits). **Superseded the same night:** the measure backfill after the `/debug` fix (translation gate now retranslates recipes whose measure rows were cascaded away by a reimport) rewrote Spanish measures, so take a new baseline right before the French migration instead of comparing to this one:

| what | n | hash |
|---|---|---|
| fetch_recipe_detail | 475 | `391b23a15d8e634e9af7877b383f00c9` |
| search limón | | `cae079ed67f0d55637eef3b9bd2f1b23` |
| search margarita | | `c8c9b3a6e4e6fc18bafe812a4bcfb239` |
| search ron | | `eecf6f637be5551276309f587bc6852f` |
| search naranja | | `d18b736be188a7bf190cbc3020a93ccf` |
| search café | | `426653f1d9424efb267898e085de7aaa` |
| search menta | | `e4715a8a88c81ab0af35d467e7d2a036` |
| search ginebra | | `b0da1b7126b39ab9e4cfeff575e4f0f4` |
| search fresa | | `44c3418c3e2d0d7f78126c249a5be00d` |

**Current baseline, taken 2026-11-09 after the measure backfill** (475 live recipes, run twice, identical both times). Compare against this before and after the French migration (spec 0046 AC-5). One Spanish recipe (Gluehwein) still owed its measures from a dropped batch when this was taken; if a `translate-catalog` rerun fills it, the `fetch_recipe_detail` hash moves for that reason alone, so take a fresh one then.

| what | n | hash |
|---|---|---|
| fetch_recipe_detail | 475 | `61b2e66b841c9b013677ecae12fa3c01` |
| search limón | | `a80df704e1e9c3a96a535609de046052` |
| search margarita | | `c8c9b3a6e4e6fc18bafe812a4bcfb239` |
| search ron | | `c286ab82309830ba7d4738e03910861a` |
| search naranja | | `78552d2cb4f988c6bab0c2d286264923` |
| search café | | `be1ec874ea112b2bb3e7fe63c84b2607` |
| search menta | | `0ee9e40edf86032adf9d448d5224d5cc` |
| search ginebra | | `e1577d7d52d7ddc556394a3c44997df0` |
| search fresa | | `87510690321062f8fcaa5cbcd4fe3fb0` |

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

- [x] Search `/pt` for a translated recipe name (Portuguese stemming), then for an untranslated recipe's English name → both found → AC-3
- [ ] `Accept-Language: pt-BR` on `/` and on `/pantry` → redirects to the `/en` path → AC-7
- [ ] Visit `/pt/`, then a bare path → lands on `/en`; the `NEXT_LOCALE` cookie says `pt` and is ignored → AC-7
- [ ] `user_preferences.locale = 'pt'` on a signed in user → bare path lands on `/en`, stored value untouched → AC-7, AC-15
- [ ] Language menu and production mobile card have no Português; a mobile dev or preview build does → AC-7, AC-8, AC-16
- [ ] `/sitemap.xml`, page alternates, and response headers have no `pt` → AC-7
- [ ] `/pt/` renders with `noindex`, a self canonical, and no alternates; `/robots.txt` still lists `/pt/...` private paths → AC-7

The six AC-7 steps above were never run before `pt` launched on 2026-11-04, and now no unlaunched locale exists to run them against. They carry over to French (spec 0046 AC-7), the first chance to see the gating live. Post launch, checked 2026-11-09 on a fresh build: `Accept-Language: pt-BR` and `pt-PT` on `/` and `/pantry` go to `/pt`, `fr-FR` goes to `/en`, a `NEXT_LOCALE=pt` cookie picks `pt`, every sitemap entry and `/pt/recipes/<slug>` carry `pt-BR` hreflang with a self canonical, and `/robots.txt` still lists the `/pt/...` private paths.

- [x] `/es/recipes/<slug>` has `<html lang="es">` and `es`/`en` hreflang → AC-14 (after launch, `pt-BR`)
- [x] Admin edit: saving Portuguese notes changes only the `pt` row; a recipe with no `pt` row shows the explicit error; a non admin gets `42501` → AC-11
- [x] `generate-drink-idea` with `locale: "pt"` returns Portuguese text and passes verification → AC-12

## Commands

- [x] `pnpm --filter @bartendingapp/shared translate-catalog --locale pt`, stop it partway, run again → the second run translates only the rest → AC-2, AC-9 (2026-11-09: a rerun translated only the 1 recipe, 4 ingredients, and 11 tags still missing, then a second rerun translated 0)
- [x] `pnpm --filter @bartendingapp/shared translate-catalog --locale en` and `--locale fr` → rejected → AC-9
- [ ] `pnpm --filter @bartendingapp/shared apply-recipe-notes` with an old `es` shaped file → rejected, no writes; with a recipe missing its `pt` row → reported under `pt` → AC-10

## Added 2026-11-03 (backfill and UI string draft)

- [ ] With `pt` active (web `/pt/...`, mobile dev build set to Português), browse home, search, a recipe, pantry, account, and the age gate → every label is Portuguese; the only English left is the brand and loanwords (Sour, Highball, Tiki, Frozen, Quizzes) → AC-1
- [x] Coverage SQL: every live recipe, ingredient, and tag that has an `es` translation row also has a `pt` row (expect 0 from each) → AC-2, AC-9

```sql
select 'recipes', count(*) from recipes r
where deleted_at is null
  and exists (select 1 from recipe_translations t where t.recipe_id = r.id and t.locale = 'es')
  and not exists (select 1 from recipe_translations t where t.recipe_id = r.id and t.locale = 'pt')
union all
select 'ingredients', count(*) from ingredients i
where exists (select 1 from ingredient_translations t where t.ingredient_id = i.id and t.locale = 'es')
  and not exists (select 1 from ingredient_translations t where t.ingredient_id = i.id and t.locale = 'pt')
union all
select 'tags', count(*) from tags g
where exists (select 1 from tag_translations t where t.tag_id = g.id and t.locale = 'es')
  and not exists (select 1 from tag_translations t where t.tag_id = g.id and t.locale = 'pt');
```

- [x] `/pt/recipes/<a lemon recipe>` says "limão-siciliano" and `/pt/recipes/<a lime recipe>` says "limão", never "lima" → AC-2

## Added 2026-11-04 (per locale notes backfill, step 5b)

You run these after applying migration `20261103120000_apply_recipe_translation_notes.sql` in the SQL editor. The SQL checks run inside `begin` / `rollback`, so they leave no trace.

### Commands

- [x] `pnpm --filter @bartendingapp/shared propose-recipe-notes --locale en` and `--locale xx` → exit nonzero before any Haiku call → AC-17
- [x] Clear one recipe's `pt` `bartender_tip` (set it to null), then `propose-recipe-notes --locale pt --limit 1` → `scripts/tagging/recipe-notes-proposals.pt.json` holds that recipe with only `bartender_tip` in `source` and `notes`, and `source` matches the English tip exactly → AC-17
- [ ] Run the same command again without `--force` → refuses, the file exists. With `--force` after the apply below → "Nothing to propose", no file written → AC-17 (2026-11-09: the refusal passes. The "Nothing to propose" half can't pass while 18 recipes still have empty `pt` notes, since `--limit 1` picks the next one)
- [ ] Hand edit a copy of the file with a blank note, a duplicate id, or `source` and `notes` keys that differ, then `apply-recipe-notes --locale pt` → rejected with every bad row listed, no writes → AC-18 (2026-11-09: each case alone is rejected with no writes, but a file with several bad rows lists only the first field error, so not every bad row is listed)
- [x] `apply-recipe-notes --locale pt` on the good file → "Applied pt notes for 1 of 1 recipes"; only that `pt` tip changed → AC-18
- [ ] Default `propose-recipe-notes` (no `--locale`) → each row's `translations` holds exactly the `CATALOG_TRANSLATION_LOCALES` blocks (only `es` before launch); a file with a `pt` block is rejected by `apply-recipe-notes` → AC-10

### Isolation (AC-17, AC-18)

Expect: the first `select` returns `{"gone": [], "stale": [], "missing_row": []}`, the `recipes` check returns 0 rows, and the translations check returns exactly 1 row: the `pt` row of that recipe, with only `bartender_tip` changed.

Passed 2026-11-09 (as a rolled back block): result `{"gone": [], "stale": [], "missing_row": []}`, no `recipes` change, one changed row (`pt` of A. J., tip only).

```sql
begin;
create temp table before_recipes on commit drop as
  select id, drink_style_note, bartender_tip, presentation_tip from recipes;
create temp table before_translations on commit drop as
  select recipe_id, locale, drink_style_note, bartender_tip, presentation_tip from recipe_translations;
create temp table target on commit drop as
  select r.id, r.bartender_tip from recipes r
  join recipe_translations t on t.recipe_id = r.id and t.locale = 'pt'
  where r.deleted_at is null and r.bartender_tip is not null
  order by r.name limit 1;

select apply_recipe_translation_notes('pt', jsonb_build_array(jsonb_build_object(
  'id', id,
  'source', jsonb_build_object('bartender_tip', bartender_tip),
  'notes', jsonb_build_object('bartender_tip', 'Teste de isolamento.')
))) from target;

select r.id from recipes r join before_recipes b using (id)
where (r.drink_style_note, r.bartender_tip, r.presentation_tip)
  is distinct from (b.drink_style_note, b.bartender_tip, b.presentation_tip);

select t.recipe_id, t.locale, b.bartender_tip as old_tip, t.bartender_tip as new_tip,
  t.drink_style_note is distinct from b.drink_style_note as style_changed,
  t.presentation_tip is distinct from b.presentation_tip as presentation_changed
from recipe_translations t join before_translations b using (recipe_id, locale)
where (t.drink_style_note, t.bartender_tip, t.presentation_tip)
  is distinct from (b.drink_style_note, b.bartender_tip, b.presentation_tip);
rollback;
```

### Stale, missing, and gone (AC-18)

Uses three different live recipes that have `pt` rows. Expect `stale` to list recipe A's `bartender_tip` only, `missing_row` to list B, `gone` to list C, and A's `pt` `presentation_tip` to read "Apresentação nova." while its `pt` `bartender_tip` is unchanged.

```sql
begin;
create temp table picks on commit drop as
  select r.id, r.bartender_tip, r.presentation_tip, row_number() over (order by r.name) as n
  from recipes r
  join recipe_translations t on t.recipe_id = r.id and t.locale = 'pt'
  where r.deleted_at is null and r.bartender_tip is not null and r.presentation_tip is not null
  order by r.name limit 3;

-- A: English tip changes after propose. B: its pt row disappears. C: soft deleted.
update recipes set bartender_tip = bartender_tip || ' (edited)' where id = (select id from picks where n = 1);
delete from recipe_translations where locale = 'pt' and recipe_id = (select id from picks where n = 2);
update recipes set deleted_at = now() where id = (select id from picks where n = 3);

select (select id from picks where n = 1) as a, (select id from picks where n = 2) as b,
  (select id from picks where n = 3) as c,
  apply_recipe_translation_notes('pt', (
    select jsonb_agg(jsonb_build_object(
      'id', id,
      'source', jsonb_build_object('bartender_tip', bartender_tip, 'presentation_tip', presentation_tip),
      'notes', jsonb_build_object('bartender_tip', 'Dica nova.', 'presentation_tip', 'Apresentação nova.')
    )) from picks
  )) as result;

select bartender_tip, presentation_tip from recipe_translations
where locale = 'pt' and recipe_id = (select id from picks where n = 1);
rollback;
```

### Rejects and grants (AC-18, security model)

- [x] `select apply_recipe_translation_notes('en', '[]')` and `('xx', '[]')` → error `22023`
- [x] A proposal with `notes` `{}`, a `glass` key, or a 241 character note → error `22023`, no writes
- [x] `select has_function_privilege('authenticated', 'public.apply_recipe_translation_notes(text, jsonb)', 'execute')` and the same for `anon` → both `false`

### Acceptance criteria coverage (this section)

- AC-10: default run step · AC-17: reject, one recipe, and rerun steps, isolation SQL · AC-18: file reject and apply steps, isolation SQL, stale/missing/gone SQL, rejects
