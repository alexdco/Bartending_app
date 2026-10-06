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
| `src/components/app-tabs.tsx` | Native tab bar; hidden routes are declared here with `hidden` |
| `src/i18n/index.ts`, `src/i18n/locales/` | i18next setup and UI strings per locale (`en.json`, `es.json`) |

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

- Folder by feature under `src/<feature>/` (e.g. `src/recipes/`, `src/pantry/`, `src/shopping-list/`) for hooks and components; Expo Router screens in `src/app/` stay thin. Shared UI primitives live in `src/components/`. Not by technical layer.
- Every user facing string goes through i18next, with the key added to both `src/i18n/locales/en.json` and `es.json`.
- Non UI logic (types, Supabase client, pantry matching) comes from `@bartendingapp/shared`, never duplicated here.
- Native module access goes through Expo config plugins (managed workflow with a custom dev client), not bare React Native ejection.
- Pantry local cache uses Expo SQLite (or AsyncStorage) as a thin cache; Postgres via Supabase remains the source of truth.

## Agent skills

- [react-native-best-practices](.agents/skills/react-native-best-practices/): `callstackincubator/agent-skills`, React Native/Expo performance and native module conventions
- [i18next-localization](.agents/skills/i18next-localization/): `i18next/i18next-cli`, i18next setup, wrapping strings in `t()`, and key extraction

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
