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
| `src/app/page.tsx` | Home page |
| `src/app/providers.tsx` | App wide providers (e.g. TanStack Query) |
| `src/lib/supabase.ts` | Supabase client for web |

## Commands

```bash
# Dev server
pnpm --filter web dev

# Build
pnpm --filter web build

# Lint
pnpm --filter web lint
```

## Conventions

- Folder by feature under `src/app/` and `src/components/` as features land; not by technical layer.
- Non UI logic (types, Supabase client, pantry matching) comes from `@bartendingapp/shared`, never duplicated here.
- Server rendering / static generation used deliberately for public recipe pages to meet the SEO requirement (see `docs/specs/0001-stack-and-architecture.md`).

## Agent skills

- [nextjs-app-router-patterns](.agents/skills/nextjs-app-router-patterns/): `wshobson/agents`, Next.js App Router SSR/streaming/data fetching conventions

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
