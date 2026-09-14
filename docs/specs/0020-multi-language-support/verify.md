# Verify: multi language support · spec 0020 · updated 2026-09-13

_Steps derived from spec 0020 acceptance criteria, covering only the tracer bullet built so far (data model plus the i18n pipe on both apps). Recipe/ingredient content translation, the locale switch control, sign in merge, and slugs/sitemap are not built yet; their verify steps land with the follow up /develop run._

## UI / manual

- [ ] Visit `http://localhost:3000/` with no stored locale and an English browser → redirected once to `/en`, nav shows "Home, Search, Pantry, Drink ideas, Popular, Favorites" → AC-1, AC-3, AC-5
- [ ] Visit `http://localhost:3000/` with `Accept-Language: es` → redirected once to `/es`, nav shows "Inicio, Buscar, Despensa, Ideas de tragos, Populares, Favoritos" → AC-1, AC-3
- [ ] Visit `http://localhost:3000/es/pantry` directly (URL wins) even with no stored preference → page renders in Spanish, not redirected away → AC-5
- [ ] Open the mobile app (or `expo start --web`) on a device/simulator set to Spanish → tab labels show "Inicio, Buscar, Despensa, Ideas de tragos, Populares" → AC-1, AC-3
- [ ] Open the mobile app on a device/simulator set to an unsupported language (e.g. French) → tab labels fall back to English → AC-3

## Commands

- [ ] `pnpm --filter web build` → succeeds, route table lists `/en/*` and `/es/*` for every existing page → AC-5
- [ ] `pnpm --filter web typecheck` and `pnpm --filter mobile typecheck` → both pass
- [ ] `pnpm --filter shared typecheck` → passes with the new `recipe_translations`/`ingredient_translations`/`tag_translations`/`recipe_ingredient_translations` tables and `recipes_localized`/`ingredients_localized` views typed
- [ ] Query `select * from information_schema.tables where table_name in ('recipe_translations','ingredient_translations','tag_translations','recipe_ingredient_translations')` against the BartendingAppWeb project → all four exist with RLS enabled → AC-6, AC-9, AC-13, AC-14, AC-15, AC-17 (schema prerequisite)
- [ ] `select * from recipes_localized limit 1` and `select * from ingredients_localized limit 1` → both views return rows falling back to the English base columns (no translations exist yet, so every row must equal the untranslated `recipes`/`ingredients` row) → AC-2 (fallback behavior, prerequisite for later ACs)

## Acceptance-criteria coverage

- AC-1 (app chrome renders in the user's language) — covered by the nav label steps above; only the nav is translated so far, not full app chrome (deferred to the next /develop run)
- AC-3 (first visit locale detection from Accept-Language / device locale, English fallback) — covered by the redirect and mobile locale steps above
- AC-5 (locale prefixed URLs on web, URL wins over stored preference) — covered by the build route table and the direct `/es/pantry` visit
- AC-6, AC-9, AC-13, AC-14, AC-15, AC-17 (translation tables, hash gated re-translation, per locale search, pantry matching keyed on ingredient_id) — schema is live and typed; the actual translated content, catalog pipeline, and locale aware reads are not built yet, so full behavioral verification of these ACs waits for the follow up /develop run covering build plan steps 3-6
