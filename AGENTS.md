# Bartending App

## Stack

- **Language / Runtime**: TypeScript, Node >= 20
- **Repository layout**: pnpm workspaces + Turborepo monorepo (`apps/web`, `apps/mobile`, `packages/shared`)
- **Mobile**: React Native via Expo (managed, custom dev client), React Navigation, TanStack Query, EAS Build/Submit
- **Web**: Next.js (App Router), deployed to Vercel
- **Backend**: Supabase (Postgres, Auth with anonymous sessions, Storage, Edge Functions, row level security)
- **Recipe data**: TheCocktailDB, imported once into our own Postgres tables (never called live from clients)
- **AI**: Anthropic Claude, Haiku tier, called only from a quota checked Supabase Edge Function
- **Observability**: Sentry, across React Native, Next.js, and Supabase Edge Functions
- **Package manager**: pnpm

Full rationale and the proposed stack table: [docs/specs/0001-stack-and-architecture.md](docs/specs/0001-stack-and-architecture.md).

## Build approach

**Tracer Bullet**: prove the whole pipe works end to end with one thin real thread, then thicken it one segment at a time.

## Commands

```bash
# Install
pnpm install

# Dev server (both apps)
pnpm dev

# Dev server (one app)
pnpm web      # turbo run dev --filter=web
pnpm mobile   # turbo run start --filter=mobile

# Build
pnpm build

# Test
pnpm test     # vitest run, repo-wide

# Lint
pnpm lint
```

## Specs

Stored in `docs/specs/`. Format: `docs/specs/NNNN-title.md`.

## Rules

- Functional and immutable by default: pure functions, no shared mutable state, side effects pushed to the edges (network, I/O, Supabase calls). Prefer composition over classes.
- Data is immutable: `const`, `readonly`, no in place mutation. Use `map`/`filter`/`reduce` over imperative loops where it reads better.
- TypeScript strict mode everywhere, no `any`, especially at the `packages/shared` boundary consumed by both apps.
- Folder by feature inside each app (e.g. `recipes/`, `pantry/`), not by technical layer.
- One consistent error handling pattern across mobile and web, especially for Supabase and Edge Function calls; prefer explicit error returns over throwing for expected failures.
- ESLint + Prettier across the monorepo (web keeps `eslint-config-next`, mobile keeps `expo lint`).
- Pre-commit: lint + format + typecheck must pass before a commit lands.
- Testing: vitest, unit + integration, tests live beside the source (`*.test.ts`). See `test-preferences.json`.
- CI: a basic GitHub Actions workflow runs lint, typecheck, and test on every push (not yet installed, tracked under feature 2 in `docs/scope/scope.md`).
- Non UI logic (types, the Supabase client, pantry matching) lives once in `packages/shared`, imported by both apps; never duplicated per app.

## Git

- integration: on
- branch prefix: feat/
- commit: per-milestone

## Agent skills

- [supabase-postgres-best-practices](.agents/skills/supabase-postgres-best-practices/): `supabase/agent-skills`, Postgres/Supabase schema, RLS, migrations, and query conventions
- [react-native-best-practices](.agents/skills/react-native-best-practices/): `callstackincubator/agent-skills`, React Native/Expo performance and native module conventions
- [nextjs-app-router-patterns](.agents/skills/nextjs-app-router-patterns/): `wshobson/agents`, Next.js App Router SSR/streaming/data fetching conventions
- [vitest](.agents/skills/vitest/): `antfu/skills`, Vitest testing conventions (mocking, coverage, fixtures)
- [sentry-get-started](.agents/skills/sentry-get-started/): `getsentry/sentry-for-ai`, guided Sentry setup across React Native, Next.js, and Supabase Edge Functions

MCP servers: sentry (recommended, official, OAuth at https://mcp.sentry.dev/mcp), thecocktaildb (recommended, community server wrapping TheCocktailDB's REST API)

## Context files

- [apps/web/AGENTS.md](apps/web/AGENTS.md) (Next.js web app: stack, commands, conventions)
- [apps/mobile/AGENTS.md](apps/mobile/AGENTS.md) (Expo/React Native mobile app: stack, commands, conventions)
- [packages/shared/AGENTS.md](packages/shared/AGENTS.md) (shared types, Supabase client, pantry matching logic)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
