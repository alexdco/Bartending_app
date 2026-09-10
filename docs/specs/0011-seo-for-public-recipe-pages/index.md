# 0011. SEO for public recipe pages

**Date**: 2026-09-07
**Status**: In Progress

## Summary

This decision adds real search engine optimization (SEO, the practice of making pages easy for Google and other search engines to find, understand, and rank) to the three public browsing pages on web: recipe detail pages, the home search page, and the popular by region page. Today none of them have a unique title, a description, structured data, or a real sitemap, which means the app is nearly invisible to organic search even though the web app was chosen specifically to carry that growth channel. The work adds per page metadata, JSON-LD (a small script tag search engines read to understand a page's content, here a "Recipe") on recipe pages, a sitemap and robots file, and cleaner URLs, including moving the popular page off a query only region filter and onto its own indexable path per region.

## Requirements

**User stories**:
- As a home bartender searching a search engine for a drink by name or ingredient, I want to land directly on the right recipe page with a clear, relevant result, so I can find what I am looking for without extra clicks.
- As the product owner, I want the public recipe, search, and popular pages to be fully indexable and to earn rich, clickable search results, so the web app delivers the organic growth channel it was built for.

**Acceptance criteria**:
- **AC-1**: Every recipe detail page renders a unique `<title>` and meta description generated from that recipe's real name and ingredients, not a generic site wide default.
- **AC-2**: Every recipe detail page with a real (non null) image emits valid Recipe JSON-LD (name, image, ingredients, instructions, and a category derived from alcoholic status and glass); a recipe with no image renders normal metadata but no JSON-LD block for that recipe.
- **AC-3**: Recipe URLs are of the form `/recipes/<name-slug>-<id>` (e.g. `/recipes/margarita-a1b2c3d4-e5f6-...`, the recipe's full UUID); the route resolves any URL whose trailing segment matches a UUID regardless of the slug text before it, so a renamed recipe's old shared links keep working; a request for an id that does not resolve to a live, non deleted recipe returns a real HTTP 404 via `notFound()`. The bare old `/recipes/<uuid>` form (no slug) issues a permanent (HTTP 308) redirect to the new slugged URL, which is the sole canonical form; the old form is never listed in the sitemap and never itself carries a canonical tag pointing at itself.
- **AC-4**: The home search page's `<title>` and meta description reflect the active search query when one is present (e.g. `?q=margarita`), and fall back to a generic search description when there is none; a search results page with a non empty `q` param carries a `noindex` meta tag (it is a thin, duplicate content variant of the same page for search engine purposes) while the bare `/` stays indexable.
- **AC-5**: The popular by region page moves from a `?region=` query parameter to a per region path, `/popular/[region]`, where each known region is a real, crawlable, server rendered URL with its own title and description naming that region; `/popular` on its own issues a redirect (HTTP 307) to the first region returned by `listPopularRegions()` (whose ordering that function/RPC already defines); an old `/popular?region=<name>` link redirects (HTTP 308, the query form is permanently replaced) to the matching `/popular/<region-slug>` path.
- **AC-6**: A request to `/popular/<region>` for a region slug that does not match any known region (after slugifying every real region and comparing, see Feature design) returns a real HTTP 404 via `notFound()`.
- **AC-7**: `/sitemap.xml` lists every non deleted recipe's canonical (slugged) URL, the home page, and every real popular region URL; it never lists the old bare `/recipes/<uuid>` form.
- **AC-8**: `/robots.txt` allows crawling of the public pages (home, search, recipes, popular) and disallows `/account`, `/auth`, and `/pantry`.
- **AC-9**: Recipe pages, the search page, and popular region pages each emit a canonical `<link>` tag and Open Graph tags (title, description, and image when the recipe has one) pointing at absolute URLs built from a single configured site base URL.

## Decision

**Chosen option**: Option 1: Fix in place, incremental metadata and structure additions

Add per page `generateMetadata`, a shared JSON-LD helper, `sitemap.ts`, `robots.ts`, a slug helper, and a server rendered `/popular/[region]` route, all built on the existing data fetching functions in `packages/shared`, with a redirect from the old bare `/recipes/<uuid>` URL shape to the new slugged one.

**Implementation skills**: `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`)

## Feature design

**Data model sketch**: No schema changes. Slugs are computed at the routing layer from `recipe.name` (a pure `slugify` function, not stored); region path segments are computed the same way from the region strings `listPopularRegions` already returns. No migration.

**Slug algorithm** (shared helper, used for both recipe names and region names): Unicode normalize (NFKD) and strip diacritics (e.g. "Piña Colada" → "pina colada"), lowercase, replace any run of non alphanumeric characters (including `&`, apostrophes, whitespace) with a single `-`, trim leading/trailing `-`, cap at 60 characters. An empty result (a name with no alphanumeric characters) falls back to the literal string `"recipe"` or `"region"`. Collisions between two different recipes' slugs are harmless and expected: the id suffix is always the authoritative lookup key, the slug text is cosmetic only.

**Recipe URL id parsing**: recipe ids are full UUIDs (36 characters, containing dashes themselves), so the route cannot split on the last `-`. The `[slug]` route param is matched against a trailing UUID pattern (regex `[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`, case insensitive); everything before that match is the cosmetic slug text and is discarded. A param with no trailing UUID match returns `notFound()` immediately, no lookup attempted.

**Region slug matching**: region strings are never un-slugified (not reliably invertible for names like "Cote d'Ivoire" or "Trinidad & Tobago"). Instead, on each request the route calls `listPopularRegions()`, slugifies every real region name with the same helper above, and compares the incoming path param against that computed set. A match resolves to the original, unslugified region string for the data query; no match returns `notFound()`. On the rare case two distinct region names slugify to the same value, the first match in `listPopularRegions()`'s own return order wins.

**API surface**: No new backend endpoints or edge functions. All data continues to flow through the existing `packages/shared` functions (`fetchRecipeDetail`, `searchRecipes`, `listPopularRegions`, `fetchPopularByRegion`), called from server components instead of, for the popular page, only from client hooks.

| Route | Renders | Key inputs | Auth | Not found behavior |
|---|---|---|---|---|
| `/recipes/[slug]` | Recipe detail + metadata + JSON-LD | `slug` param, parsed for a trailing id | none (public) | `notFound()` if id does not resolve to a live, non deleted recipe |
| `/recipes/[id]` (legacy, old bare id form) | Redirect | `id` param | none (public) | Permanent redirect to `/recipes/<slug>-<id>` when the recipe exists; `notFound()` otherwise |
| `/` | Search + metadata | `q` search param (optional) | none (public) | n/a |
| `/popular/[region]` | Popular recipes for one region, server rendered, + metadata | `region` param, slugified | none (public) | `notFound()` if the slug matches no known region |
| `/popular` | Redirect to the first available region's path | none | none (public) | n/a |
| `/sitemap.xml` | Generated sitemap | none | none (public) | n/a |
| `/robots.txt` | Generated robots file | none | none (public) | n/a |

**Value sourcing** (every value each page must produce, computes, or displays names where it comes from):
| Page / action | Value produced | Source |
|---|---|---|
| Recipe detail metadata | Title, description | `fetchRecipeDetail`'s `name` and `ingredients` (existing fields) |
| Recipe detail JSON-LD | name, image, ingredients, instructions, recipeCategory | `fetchRecipeDetail`'s `name`, `imageUrl`, `ingredients`, `instructions` (existing fields); `recipeCategory` is `"Cocktail"` when `alcoholicStatus` is alcoholic, `"Mocktail"` when non alcoholic, else `"Drink"` (schema.org's `recipeCategory` means the type of dish, not glassware; `glass` is not emitted in JSON-LD, it stays a page level chip only); JSON-LD omitted entirely when `imageUrl` is null |
| Recipe detail canonical/OG URL | Absolute canonical URL, OG image URL | `recipe.id` + computed slug, joined with the new `NEXT_PUBLIC_SITE_URL` env var |
| `/recipes/[slug]` route resolution | The real recipe | The numeric/uuid suffix parsed out of the `slug` param (text before it is ignored for lookup), passed to the existing `fetchRecipeDetail(id)` |
| Search page metadata | Title, description | The `q` search param when present, else a static fallback string |
| `/popular/[region]` route resolution | The real region value | The `region` path param, un-slugified and matched against `listPopularRegions()`'s real region strings; no match -> `notFound()` |
| Popular region metadata | Title, description | The matched region string + `fetchPopularByRegion(region)`'s recipe count |
| Sitemap entries | Every recipe URL, every region URL | `fetchRecipeDetail`-equivalent bulk query filtered `deleted_at IS NULL`, `listPopularRegions()`, all joined with `NEXT_PUBLIC_SITE_URL` |
| Canonical/OG base URL (all pages) | The absolute site origin | New `NEXT_PUBLIC_SITE_URL` env var, set per Vercel environment |

**Key invariants**:
- A soft deleted recipe (`deleted_at IS NOT NULL`) never appears in the sitemap and never resolves to a live page; the existing `deleted_at IS NULL` filter in `fetchRecipeDetail` and the sitemap's own query both enforce this.
- A recipe with a null `imageUrl` never emits a JSON-LD block; normal `<title>`/meta tags still render.
- The slug portion of a `/recipes/[slug]` URL is never used for lookup, only the trailing UUID; a stale slug from a renamed recipe still resolves, it never 404s.
- The new slugged recipe URL is always the sole canonical form; the old bare `/recipes/<uuid>` form always redirects (308) rather than rendering directly, and is never in the sitemap.
- A search results page (`/?q=<non-empty>`) always carries `noindex`; the bare `/` never does.
- `/robots.txt` always disallows `/account`, `/auth`, `/pantry`.

**Security model**: No change to authorization; every page in scope is already public with no session check. No sensitive data is newly exposed: JSON-LD and metadata expose only fields already rendered on the page today (name, image, ingredients, instructions).

**Configuration required**:
- `NEXT_PUBLIC_SITE_URL`: the app's absolute production base URL (e.g. `https://bartendingapp.example.com`), used to build canonical links, Open Graph URLs, and the sitemap's absolute entries. Set per Vercel environment (production uses the real domain; preview/dev can fall back to Vercel's own deployment URL).

**Critical test scenarios**:
- Happy path: visiting `/recipes/margarita-<id>` renders the page with a unique title, description, and valid Recipe JSON-LD, verifies **AC-1**, **AC-2**.
- Old URL form: visiting `/recipes/<id>` (no slug) redirects to `/recipes/margarita-<id>`, verifies **AC-3**.
- Missing image: a recipe with `imageUrl: null` renders normal metadata with no JSON-LD script tag on the page, verifies **AC-2**.
- Not found: visiting `/recipes/anything-<bad-id>` or a deleted recipe's id returns a real 404 status, verifies **AC-3**.
- Search query metadata: visiting `/?q=margarita` renders a title mentioning "margarita"; visiting `/` with no query renders the generic fallback title, verifies **AC-4**.
- Popular region routing: visiting `/popular/mexico` server renders Mexico's popular recipes with a title naming Mexico; visiting `/popular` redirects to the first available region, verifies **AC-5**.
- Popular region not found: visiting `/popular/not-a-real-region` returns a real 404 status, verifies **AC-6**.
- Sitemap and robots: `/sitemap.xml` includes every non deleted recipe and every real region URL and excludes deleted recipes; `/robots.txt` disallows `/account`, `/auth`, `/pantry`, verifies **AC-7**, **AC-8**.
- Canonical/OG: every in scope page's rendered HTML includes a canonical `<link>` and Open Graph tags built from `NEXT_PUBLIC_SITE_URL`, verifies **AC-9**.

## Build plan

1. Add `NEXT_PUBLIC_SITE_URL` to the web app's env configuration and a small shared helper (`packages/shared` or a web local util) that builds absolute URLs from it, satisfies **AC-9**.
2. Add the shared `slugify` helper and the trailing UUID regex parser (ignore slug text for lookup); move the recipe detail route to `/recipes/[slug]` and add a permanent (308) redirect route for the old bare `/recipes/[id]` form, satisfies **AC-3**.
3. Add `generateMetadata` to the recipe detail page (unique title/description from name + ingredients) and a JSON-LD helper invoked only when `imageUrl` is non null, satisfies **AC-1**, **AC-2**.
4. Add `generateMetadata` to the home search page, reading the `q` search param for a dynamic title/description, and a `noindex` robots meta tag when `q` is non empty, satisfies **AC-4**.
5. Refactor the popular page: move region and recipe fetching to a server component at `/popular/[region]`, server rendering the initial region's content; region switching after load can still use client navigation between region paths; add the `/popular` redirect (307) to the first region from `listPopularRegions()` and a redirect (308) from the old `/popular?region=<name>` form to the matching `/popular/<region-slug>` path; add `generateMetadata` per region, satisfies **AC-5**.
6. Add `notFound()` handling for an unmatched region slug in `/popular/[region]`, satisfies **AC-6**.
7. Add `apps/web/src/app/sitemap.ts` querying non deleted recipes and real regions, and `apps/web/src/app/robots.ts` disallowing `/account`, `/auth`, `/pantry`, satisfies **AC-7**, **AC-8**.
8. Add canonical link and Open Graph tags to all three pages' `generateMetadata` functions, using the `NEXT_PUBLIC_SITE_URL` helper from step 1, satisfies **AC-9**.

## Consequences

**Positive**:
- The web app finally has the crawlable, indexable surface the stack decision assumed it would have from the start; recipe, search, and popular pages become real organic search entry points.
- Cleaner, keyword bearing URLs are more shareable and more trustworthy looking to a human clicking a search result or a shared link.
- No schema or migration risk: everything here is additive at the routing and rendering layer.

**Negative / tradeoffs**:
- The popular page gains real implementation complexity: it moves from one simple client component to a server rendered route per region plus a thinner client layer for in page interaction, more code to maintain than the current single component.
- JSON-LD coverage is partial by design (no prep time, yield, or rating) since the data does not exist yet; recipes qualify for baseline indexing but not every optional Google rich result enhancer until that data is added later.
- The old bare `/recipes/[id]` URL form must be kept alive indefinitely as a permanent (308) redirect target so already indexed links are not lost during the migration to the new canonical URL; it is a small permanent maintenance surface, never rendered directly again.

**Neutral**:
- `NEXT_PUBLIC_SITE_URL` is a new operational value someone must remember to set correctly per Vercel environment; a wrong value silently produces wrong canonical/OG URLs rather than an error.

## Follow-up

- [ ] Once the recipe schema gains prep time, yield, or rating data (tracked separately, not in this spec's scope), extend the JSON-LD helper to include those fields for a stronger Recipe rich result.
- [ ] Confirm with Vercel project settings what `NEXT_PUBLIC_SITE_URL` should resolve to per environment (production domain vs preview deployments) before this ships.
