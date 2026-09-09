# 0016. Personalized homepage — rationale

## Context

The app's landing surface is currently search first: web's `/` route runs the recipe search page directly (`apps/web/src/app/page.tsx`), and mobile's Home tab (`apps/mobile/src/app/index.tsx`) is still the unmodified Expo starter screen, unused for real content (mobile's dedicated Search tab already carries the real search experience). Four personalization features have since shipped with their own dedicated pages: recipe recommendations (spec 0009), drink ideas from pantry (spec 0006), popular drinks by region (spec 0010), and recently viewed tracking (built as part of spec 0009). None of them appear on first load; a user has to already know a tab or link exists to see personalized content.

The engineer supplied a reference screenshot of a generic recipe blog template (light theme, unrelated branding) purely for layout inspiration: a hero banner, a row of filter pills, card grids, and labeled sections. It is not a styling target; this app's dark charcoal and green design system (`docs/design/design.md`) stays as is.

No horizontal scrolling carousel component exists in either app today; every existing list (search results, drink ideas, recommendations, popular by region) renders as a vertical grid or infinite list on its own full page. This feature is the first to need a horizontal, capped preview list per section.

Recipe favoriting (spec 0015) also shipped since these four features, but is deliberately left out of the homepage in this pass: it has no natural "browse a set of drinks" shape (a user's favorites are already a short, self curated list they check directly via `/favorites`, not a discovery surface), so it is not one of the four carousels here.

Three integration points needed by this feature do not exist in the code as first assumed, and are decided below rather than left for `/develop` to invent: `packages/shared` has no bulk "fetch recipes by ids" function (recently viewed only stores ids), `useRecipeRecommendations` requires a specific recipe's id (it exists to power the detail page's "you may also like," not a recipe agnostic homepage), and both platforms' popular by region screens resolve their selected region from page level state, not a shareable link parameter.

## Options considered

### Option 1: Reuse each feature's existing infinite query hook unmodified, take only the first page

The homepage's carousels call each feature's existing TanStack Query hook (`useDrinkIdeas`, `useRecipeRecommendations`, `usePopularByRegion`) unmodified, rendering only `data.pages[0]` and never calling `fetchNextPage`.

**Pros**:
- Zero new fetch functions; reuses the exact hook a dedicated page already uses.

**Cons**:
- Only genuinely shares a cache entry for drink ideas, whose query key (`['drinkIdeas']`) carries no per screen state. Recommendations' query key embeds `currentRecipeId` (a specific recipe's page), which the homepage has none of; a homepage call would need its own key regardless, so the "shared cache" benefit does not hold there. Also risks a builder passing a smaller `pageLimit` to "match" the 10 item cap, which would poison the shared cache entry with a mismatched page size and break the dedicated page's infinite scroll end of list check.

### Option 2: New lightweight, non paginated fetch functions sized for a homepage preview

Add a second, smaller fetch function per data source (e.g. `fetchDrinkIdeaPreview`) that takes a fixed small limit and skips the infinite query wrapper entirely.

**Pros**:
- Slightly less client side machinery per carousel; a fetch shaped exactly for a 10 item preview.

**Cons**:
- Doubles the fetch functions per data source (one for the dedicated page, one for the homepage), a second code path to keep in sync as each feature evolves; directly against this project's rule that non UI logic lives once in `packages/shared`.

### Option 3: Call each source's existing shared fetch function directly under a homepage owned query key, per carousel

Each carousel runs its own `useQuery` (not the dedicated page's hook) calling the same underlying `packages/shared` fetch function (`fetchDrinkIdeaMatches`, `fetchRecipeRecommendations`, `fetchPopularByRegion`) with a homepage scoped query key (e.g. `['home', 'drinkIdeas']`), always requesting the source's normal page size, then slicing to 10 client side.

**Pros**:
- No fetch function duplication (still one function per source in `packages/shared`, satisfying the project's rule) and no forced sharing of a cache entry that would not actually help (recommendations) or could actively hurt (drink ideas, if a builder is tempted to shrink the page size).
- Each carousel's query key and behavior is decided explicitly here, rather than inherited from a page whose key shape was designed for a different screen.

**Cons**:
- Drink ideas loses automatic warm cache reuse with the dedicated Drink Ideas page (a real, if narrow, win of Option 1 for that one source): visiting the homepage then the Drink Ideas page refetches once more than it would under Option 1.

## Rationale

The cross check surfaced that a single uniform choice does not fit all four sources: `useRecipeRecommendations` requires a specific recipe's id to build its query key, which a recipe agnostic homepage cannot supply without either lying about the type or widening the hook's signature for a screen it was never designed for; forcing Option 1 there would mean inventing a new hook shape anyway, just inside the wrong file. Drink ideas has no such mismatch, and its cache entry doing double duty (kept warm by the existing pantry mutation invalidation from spec 0006) is a genuine benefit worth keeping. Recently viewed is not one of these fetch backed sources at all; see the index's Feature design data model note on the new bulk lookup it needs.
