# Shared

## Overview

Non UI logic shared between `apps/web` and `apps/mobile`: the Supabase client, generated database types, and the pantry matching algorithm. Written once so both clients stay in sync.

## Key files

| File | Owns |
|---|---|
| `src/index.ts` | Public exports |
| `src/supabaseClient.ts` | Shared Supabase client setup |
| `src/pantryMatching.ts` | Pantry to recipe matching logic |

## Commands

Consumed via the `@bartendingapp/shared` workspace package; no standalone dev server. Test with `pnpm test` (vitest, repo-wide).

## Conventions

- Pure functions only: pantry matching and any future shared logic takes plain data in, returns plain data out, no side effects or Supabase calls buried inside.
- No UI code here; this package has no framework (React/RN) dependency.
- Exported types are the contract both apps build against; a breaking change here breaks both clients.

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
