# 0011. SEO for public recipe pages — rationale

## Context

The web app exists specifically to carry organic search growth for the product, a goal stated directly in the stack decision (`docs/specs/0001-stack-and-architecture.md`). Despite that, the three public pages, recipe detail (`apps/web/src/app/recipes/[id]/page.tsx`), home search (`apps/web/src/app/page.tsx`), and popular by region (`apps/web/src/app/popular/page.tsx`), currently render with no page specific metadata at all: every page shows whatever generic title the root layout sets, there is no JSON-LD, no sitemap, and no robots file anywhere in the app.

Two of the three pages also have structural problems beyond missing metadata. Recipe URLs use the raw database identifier (`/recipes/<uuid>`), which carries no keyword value and reads poorly when shared. The popular page is a fully client rendered component: the region list and the recipes for the selected region are both fetched after the page mounts, with the region held in a query string (`?region=`), so a crawler that does not execute client JavaScript sees an empty page, and even one that does only ever sees one indexable URL no matter how many regions exist.

The recipe catalog itself is thin for some structured data fields Google's Recipe rich result guidelines recommend: there is no prep time, cook time, yield, or rating data in the schema (`packages/shared/src/database.types.ts`), only name, image, instructions, ingredients, alcoholic status, and glass. Recipes can also have a null image. Google's guidelines treat a missing recommended field as acceptable but treat a fabricated one, especially a placeholder image standing in for a specific dish, as a policy risk that can trigger a manual action against the site. This shapes how much structured data the pages can honestly emit.

No canonical site base URL exists anywhere in the web app's configuration today (checked `next.config.ts` and the web app's env references), which every one of canonical link tags, Open Graph tags, and the sitemap needs to build absolute URLs.

## Options considered

### Option 1: Fix in place, incremental metadata and structure additions

Add `generateMetadata` functions, a JSON-LD helper, a sitemap, a robots file, and the slug/region path changes directly to the existing three pages, without changing the underlying data fetching functions in `packages/shared` (`fetchRecipeDetail`, `searchRecipes`, `listPopularRegions`, `fetchPopularByRegion` all stay as they are).

**Pros**:
- No data migration, no new tables or columns; slugs and region path segments are computed at the routing layer from data that already exists.
- The popular page's data fetching functions (`listPopularRegions`, `fetchPopularByRegion`) are already plain async functions callable from a server component, so moving that page from client only to server rendered is a routing change, not a new data layer.
- Low risk: every change is additive (new files: `sitemap.ts`, `robots.ts`; new metadata exports) or a route level restructure that keeps the same underlying queries.

**Cons**:
- The popular page's client component still needs a real refactor (its current shape assumes it owns all its own data fetching and URL state via `useSearchParams`); this is more than a one line change even though the data layer does not move.
- Old `/recipes/<uuid>` links without a slug prefix need a redirect rule so already shared or already indexed links do not silently 404.

### Option 2: Rebuild the popular and recipe pages as fully static generated pages at build time

Use `generateStaticParams` to pre render every recipe and every region page at build time instead of on request, maximizing crawl speed and caching.

**Pros**:
- Fastest possible page loads for crawlers and users alike, since nothing is computed per request.
- Plays well with a CDN (Vercel's edge network) for near instant repeat visits.

**Cons**:
- The recipe catalog is imported from TheCocktailDB and can be refreshed; fully static generation means every catalog refresh needs a full site rebuild and redeploy to reflect new or changed recipes, adding an operational step that does not exist today.
- Region popularity rankings are computed from view and favorite counters per the stack spec's roadmap; those change continuously, and baking them into a build time static page means popularity data goes stale between deploys, which directly undermines the point of a "popular" page.

## Rationale

Option 1 fits the forces in Context directly: nothing about this problem is a data model gap, it is a missing presentation and routing layer on top of data that already exists (recipe fields, region names, popularity ranks are all already queryable). Option 2's static generation would fight the two things that already make this data dynamic by design, the recipe catalog's periodic refresh and the popularity counters' continuous change, both named as ongoing operational facts in the stack decision. Server rendering on request (Option 1) keeps every page's content current without adding a rebuild-on-every-change operational burden the team has not signed up for.

The redirect from old to new recipe URLs is not optional once slugs are added: any recipe link already shared or indexed under the bare id form would otherwise 404 the moment slugs ship, which is the opposite of the SEO goal this spec exists to serve.
