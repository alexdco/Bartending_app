# Import job

## Overview

One time (and rerunnable) catalog loader. Pulls every drink from TheCocktailDB, plus the hand curated recipes in `src/customRecipes.json`, and writes them into our own Postgres tables through the `import_catalog` and `import_custom_recipes` RPCs. Clients never call TheCocktailDB live; this job is the only path in from that source. Spec: [docs/specs/0002-data-model.md](../../docs/specs/0002-data-model.md).

## Key files

| File | Owns |
|---|---|
| `src/index.ts` | TheCocktailDB import entry point (fetch, transform, `import_catalog` RPC, then translation and ingredient classification) |
| `src/theCocktailDb.ts` | TheCocktailDB REST fetch |
| `src/transform.ts` | Pure mapping from a TheCocktailDB drink to our recipe, ingredient, and tag rows |
| `src/importCustomRecipes.ts` | Custom recipe import entry point |
| `src/customRecipes.json`, `src/customRecipesSchema.ts` | Hand curated recipes and the zod schema that validates them before import |

## Commands

```bash
# Import the TheCocktailDB catalog
pnpm --filter @bartendingapp/import-job import

# Import the custom recipes in src/customRecipes.json
pnpm --filter @bartendingapp/import-job import:custom

# Lint / typecheck
pnpm --filter @bartendingapp/import-job lint
pnpm --filter @bartendingapp/import-job typecheck
```

Needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `packages/import-job/.env` (the root `.env.example` lists them), plus `ANTHROPIC_API_KEY` for the translation and classification steps. The service role key never leaves this server side job.

## Conventions

- Writes go through the import RPCs, not direct table inserts, so the import stays idempotent and reconciles against existing rows.
- Translation and classification reuse the shared modules (`@bartendingapp/shared/catalog-translation`, `@bartendingapp/shared/ingredient-classification`, `@bartendingapp/shared/units`); never reimplement them here.
- Keep `transform.ts` pure: plain data in, plain data out. Network and Supabase calls stay in the entry points.
- Admin made recipes (`recipes.source = 'admin'`, spec 0030) are managed from the web admin UI, not by this job.

_Drafted by /sync from the introducing change, worth a quick human pass._
