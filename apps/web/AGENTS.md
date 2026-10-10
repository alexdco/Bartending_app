<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Web

## Overview

The public facing recipe browsing and search site, built with Next.js App Router. Carries the SEO requirement for public recipe pages, deployed to Vercel.

## Key files

| File | Owns |
|---|---|
| `src/app/layout.tsx` | Root layout |
| `src/app/[locale]/page.tsx` | Home page (every route lives under `src/app/[locale]/`) |
| `src/app/[locale]/providers.tsx` | App wide providers (e.g. TanStack Query) |
| `src/i18n/` | next-intl routing, request config, and locale aware navigation helpers |
| `messages/en.json`, `messages/es.json` | UI strings per locale |
| `src/app/theme.generated.css` | Generated from `packages/shared/src/tokens.ts`; never edit by hand |
| `src/lib/supabase.ts` | Supabase client for web |

## Commands

```bash
# Dev server
pnpm --filter web dev

# Build
pnpm --filter web build

# Lint
pnpm --filter web lint

# Typecheck
pnpm --filter web typecheck

# Regenerate theme CSS from shared tokens (runs automatically before dev and build)
pnpm --filter web run generate-theme
```

## Conventions

- Folder by feature under `src/<feature>/` (e.g. `src/recipes/`, `src/pantry/`, `src/shopping-list/`); route files in `src/app/[locale]/` stay thin and render the feature's page client. Shared UI primitives live in `src/components/`. Not by technical layer.
- Every user facing string goes through next-intl, with the key added to both `messages/en.json` and `messages/es.json`; links use the helpers in `src/i18n/navigation.ts` so the locale is kept.
- Non UI logic (types, Supabase client, pantry matching) comes from `@bartendingapp/shared`, never duplicated here.
- Every remote image host shown through `next/image` needs an entry in `next.config.ts` `images.remotePatterns` (today TheCocktailDB and the Supabase `comment-photos` bucket).
- Server rendering / static generation used deliberately for public recipe pages to meet the SEO requirement (see `docs/specs/0001-stack-and-architecture.md`).

## Agent skills

- [nextjs-app-router-patterns](.agents/skills/nextjs-app-router-patterns/): `wshobson/agents`, Next.js App Router SSR/streaming/data fetching conventions
- [tailwind-4-docs](.agents/skills/tailwind-4-docs/): `lombiq/tailwind-agent-skills`, Tailwind CSS v4 docs snapshot, utilities, configuration, and v3 to v4 gotchas
- Declined: next-intl-app-router skill (`liuchiawei/agent-skills`), radix-ui-design-system skill (`sickn33/agentic-awesome-skills`), Tailwind and Radix community MCP servers

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
