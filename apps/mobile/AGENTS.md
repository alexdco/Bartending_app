# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Mobile

## Overview

The native iOS and Android app, built with React Native via Expo (managed, custom dev client), using Expo Router for navigation and TanStack Query for server state.

## Key files

| File | Owns |
|---|---|
| `src/app/_layout.tsx` | Root layout / navigation shell |
| `src/app/index.tsx` | Home screen |
| `src/lib/supabase.ts` | Supabase client for mobile |
| `src/constants/theme.ts` | Theme tokens |

## Commands

```bash
# Dev server
pnpm --filter mobile start

# iOS / Android
pnpm --filter mobile ios
pnpm --filter mobile android

# Lint
pnpm --filter mobile lint
```

## Conventions

- Folder by feature under `src/app/` and `src/components/` as features land; not by technical layer.
- Non UI logic (types, Supabase client, pantry matching) comes from `@bartendingapp/shared`, never duplicated here.
- Native module access goes through Expo config plugins (managed workflow with a custom dev client), not bare React Native ejection.
- Pantry local cache uses Expo SQLite (or AsyncStorage) as a thin cache; Postgres via Supabase remains the source of truth.

## Agent skills

- [react-native-best-practices](.agents/skills/react-native-best-practices/): `callstackincubator/agent-skills`, React Native/Expo performance and native module conventions

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
