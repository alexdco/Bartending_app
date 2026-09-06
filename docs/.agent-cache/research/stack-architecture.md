# Bartending App Tech Stack Research (Sept 2025)

## 1. Cross-platform Mobile + Web Framework

**Current Options:**
- **React Native + Expo** (most common): New Architecture (JSI + Fabric renderer) shipping in 0.83, eliminates bridge bottleneck. Expo SDK 52+ with EAS Build/Update/Submit. React Native for Web + tools like Solito and Next.js enable web share; Tamagui compiles to both native and web components. Production maturity: Very high, widely deployed.
- **Flutter** (growing): Web support marked production-ready for most use cases but with caveats—SEO and full accessibility remain limited; better for internal tools. Desktop/mobile mature; web less so. Performance improvements and WASM support shipped 2024-2025.
- **Separate native (Swift/Kotlin) + React/Next.js web**: No code share, highest control, steepest team cost.

**Recommendation:** React Native + Expo + Next.js for web. Most actively maintained, largest ecosystem, proven code reuse across platforms.

**Notable:** None deprecated recently; Flutter Web still carries SEO/accessibility warnings for public-facing sites.

---

## 2. Backend/API Layer

**Current Options:**
- **Supabase** (open-source PostgreSQL BaaS): Auth, storage, edge functions, all tied to Postgres with Row Level Security (RLS) enforced at DB level. Self-hosting available. ~$25/month starter.
- **Firebase** (Google ecosystem): Now includes Firebase Data Connect (managed PostgreSQL, launched 2024) alongside legacy Realtime DB and Firestore. All-in-one NoSQL tools ideal for quick MVPs. ~$0 free tier, pay-as-you-go.
- **Custom Node/Python API** (Fastify, Express, FastAPI): Full control, steeper ops/scaling burden. Pairs well with separate DB + auth provider.

**Recommendation:** Supabase for solo/small team. RLS at database level, better for structured data (recipes, pantry), SQL familiarity, open-source. Firebase if you want "zero ops" and don't mind vendor lock-in.

**Notable:** Firebase shifted from "NoSQL only" to multi-database strategy in 2024; Supabase remains PostgreSQL-first.

---

## 3. Database

**Current Options:**
- **PostgreSQL** (via Supabase): Mature, powerful for complex queries (pantry matching, recipe search). Offline/local sync via libraries like powersync or custom sync layers. Best for structured schema.
- **Firebase Firestore** (NoSQL): Real-time sync out of box, mobile SDKs baked in. Simpler eventual-consistency model, good for offline-first. Less ideal for complex recipe queries.
- **SQLite + sync layer** (hybrid): SQLite locally on mobile, sync to PostgreSQL backend. Libraries like WatermelonDB or Prisma handle sync complexity.

**Recommendation:** PostgreSQL (via Supabase) + SQLite on mobile with sync library. Structured recipe/pantry data fits relational model; SQLite on device handles offline.

**Notable:** None; both remain industry standard. Newer libraries like powersync abstract sync complexity.

---

## 4. Public Cocktail/Drink Recipe Data

**TheCocktailDB:**
- **Status:** Active as of Sept 2025. Free tier with test key "1" for development. Premium $10 one-time fee for production API key + app store release.
- **Rate limits:** Not publicly documented in API docs; free tier has unstated limits.
- **Pricing/commercial use:** Free tier for dev; $10 USD one-time for commercial release on app stores. Includes: multiple ingredient filters, full database access (vs 100-item limitation on free), latest/random image API, popular/recent lookups.
- **Credible alternatives:** 
  - Open Food Facts API (broader food DB, includes drinks)
  - Build custom scraper (labor-intensive, licensing unclear)

**Sources verified:**
- TheCocktailDB API docs: https://www.thecocktaildb.com/api.php

**Recommendation:** TheCocktailDB. Widely used, mature, low cost, commercial licensing clear.

---

## 5. Authentication

**Current Options:**
- **Supabase Auth**: Built-in, free tier included, supports OAuth (Google, GitHub), phone auth, email/password, Row Level Security (RLS) policies in Postgres. Works seamlessly with Supabase backend. No additional cost beyond BaaS tier.
- **Firebase Auth**: Free tier generous, OAuth built-in, real-time SDK integration. Google Cloud identity backend.
- **Hosted auth provider** (Auth0, Clerk): Independent of backend choice. Auth0 free tier: 7k monthly active users; Clerk similar. $25-50/month tier typical.

**Recommendation:** Supabase Auth (if using Supabase) or Firebase Auth (if using Firebase). No separate cost, integrated with BaaS. Optional guest mode: token-based session without account, stored locally.

**Notable:** None; both have generous free tiers. Auth0/Clerk add cost but offer more customization.

---

## 6. Hosting/Deployment

**Backend (API/Database):**
- **Supabase**: Managed PostgreSQL, edge functions (Deno). Starter ~$25/month, scales on demand. Includes DB, auth, storage, edge compute.
- **Firebase**: Managed multi-database, Cloud Functions free tier (2M invocations/month). Pay-as-you-go after free tier.
- **Vercel / Netlify** (edge + serverless): For custom Node/Python API. Vercel $20/mo for hobby tier + Postgres add-on (~$15/mo). Netlify similar.

**Web (Next.js/React):**
- **Vercel** (Next.js native): Free tier generous, $20/mo hobby. Automatic CI/CD, edge middleware for SEO. Easiest for Next.js.
- **Netlify**: Also free tier, good for React (via build). Similar pricing.

**Mobile (iOS/Android):**
- **Expo EAS Build/Submit**: $3-50/mo depending on builds/month. Simplifies CI/CD for React Native.
- **GitHub Actions** (self-hosted CI): Free tier for public repos, $0.008/minute for private. Need to manage signing certs.

**Recommendation:**
- Backend: Supabase ($25/mo starter) or Firebase (free tier generous, grow on demand).
- Web: Vercel ($0-20/mo depending on scale) + Next.js for SEO-friendly recipe pages.
- Mobile: Expo EAS ($10-30/mo for hobby volume) or GitHub Actions free tier.

**Total minimum:** ~$35-60/mo (Supabase + Vercel hobby + Expo). Firebase path could stay free for months.

---

## 7. AI for Drink Generation

**Model recommendation:** Claude 3.5 Haiku (now superseded by Claude Haiku 4.5 as of Sept 2025).

**Current pricing** ([Anthropic pricing docs](https://platform.claude.com/docs/en/about-claude/pricing)):
- **Claude Haiku 4.5:** $1 per million input tokens, $5 per million output tokens (standard rate).
- **Discounts:** Up to 90% via prompt caching, 50% via batch API.

**Why Haiku 4.5:** Fastest inference, lowest cost, matches Claude Sonnet 4.5 performance on coding and agent tasks (SWE-bench Verified 73.3%). Perfect for "light, fun suggestion" feature. ~1000-token drink recipe suggestion ≈ $0.005 cost (1k input, 300 output tokens).

**Alternatives:**
- **Claude Opus 4.5** ($5 input, $25 output): Overkill for recipe generation; 5-25x more expensive.
- **Open-source (Llama 2/Mistral)**: Free hosting trade-off against quality. Harder to deploy affordably; self-hosting on CPU adds ops burden.

**Recommendation:** Claude Haiku 4.5 via Anthropic API. Cost negligible at scale; quality excellent for creative task. Batch API (50% discount) ideal for async "feed me ideas" use case.

**Recent change:** Claude 3.5 Haiku was retired Sept 2025; Haiku 4.5 is current standard (slightly higher pricing, better performance).

---

## Summary Architecture

| Layer | Choice | Cost/mo (est.) | Notes |
|-------|--------|----------------|-------|
| Mobile + Web | React Native + Expo + Next.js | $0 (dev) | Shared logic, code reuse, Expo tooling simple |
| Backend | Supabase | $25 | PostgreSQL + Auth + Edge Functions; RLS for security |
| Database | PostgreSQL (Supabase) + SQLite (mobile) | included | Structured data, offline sync, relational queries |
| Recipes | TheCocktailDB | $10 (one-time) | Free dev, $10 commercial license, mature API |
| Auth | Supabase Auth | included | Built-in, guest sessions, OAuth optional |
| Hosting (web) | Vercel + Next.js | $20 | SEO optimized, auto CI/CD, edge middleware |
| Hosting (mobile) | Expo EAS | $10-30 | Simple build/submit for iOS/Android |
| AI (drink ideas) | Claude Haiku 4.5 API | <$5 (high volume) | $0.001/drink at scale; batch for async generation |
| **Total (MVP)** | | **$65-85/mo** | Includes generous free tier buffer; Firebase alt keeps $0-50/mo |

---

## References
- React Native Wrapped 2025: https://www.callstack.com/blog/react-native-wrapped-2025-a-month-by-month-recap-of-the-year
- Flutter Web 2025 readiness: https://medium.com/@tiger.chirag/flutter-web-in-2025-27d17cd77f65
- Supabase vs Firebase 2025: https://www.bytebase.com/blog/supabase-vs-firebase/
- TheCocktailDB API: https://www.thecocktaildb.com/api.php
- Anthropic Claude Pricing (current): https://platform.claude.com/docs/en/about-claude/pricing
