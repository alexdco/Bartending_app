# Shared

## Overview

Non UI logic shared between `apps/web` and `apps/mobile`: the Supabase client, generated database types, and the pantry matching algorithm. Written once so both clients stay in sync.

## Key files

| File | Owns |
|---|---|
| `src/index.ts` | Public exports |
| `src/supabaseClient.ts` | Shared Supabase client setup |
| `src/pantryMatching.ts` | Pantry to recipe matching logic |
| `src/database.types.ts` | Generated Supabase types; regenerate after every migration |
| `src/tokens.ts` | Design token values, source of truth for web theme CSS and mobile theme |
| `src/<feature>.ts` (e.g. `shoppingList.ts`, `comments.ts`) | Per feature data access: functions take a `SupabaseClient<Database>` as their first argument |
| `scripts/` | One off catalog and content jobs (classification, translation, Learn articles, quizzes) run with `tsx` |

## Commands

Consumed via the `@bartendingapp/shared` workspace package; no standalone dev server. Test with `pnpm test` (vitest, repo-wide). Typecheck with `pnpm --filter @bartendingapp/shared typecheck`. Content jobs run as package scripts, e.g. `pnpm --filter @bartendingapp/shared translate-catalog` (see `package.json` for the full list).

## Conventions

- Pure functions only: pantry matching and any future shared logic takes plain data in, returns plain data out, no side effects or Supabase calls buried inside.
- No UI code here; this package has no framework (React/RN) dependency.
- Exported types are the contract both apps build against; a breaking change here breaks both clients.
- Server only modules that call Anthropic or need the service role key (translation, classification, Learn article and quiz generation) stay out of the `src/index.ts` barrel and are exposed as subpath exports in `package.json` (e.g. `@bartendingapp/shared/catalog-translation`), so they never reach a client bundle.

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
