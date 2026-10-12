# 0038. Empty states, UX polish, and accessibility: rationale

Decision record for [index.md](index.md). `/develop` builds from `index.md`; this file explains why.

## Context

Scope feature 46 came out of the October 2026 app review: new visitors hit thin pages, a few UX details read wrong, and some controls are hard to use with assistive technology. This is an enhancement across existing web (Next.js) and mobile (Expo) screens, with non UI logic in `packages/shared`.

Reading the code and the live database (`BartendingAppWeb`, 2026-10-12) changed the picture in the scope row in several places:

- **Popular is empty because its data was never loaded.** All 432 live recipes have no `region`, `fame_score`, or `popularity_rank`. Spec 0010's `tag-regions.ts` (Claude Haiku proposes a region and a 0 to 100 fame score per recipe) and `apply-regions.ts` exist but were never run. The columns and `apply_region_proposals` exist live, yet no migration in the repo creates them, so a fresh database would not have them.
- **There is no usage signal to sort by.** Live there is 1 rating and 5 favorites, and no view tracking outside PostHog. Any "popular" order must come from something other than user behavior for now. The script only scores fame when it assigns a region, so drinks with no regional identity would get no score.
- **Search browse order is alphabetical** (`search_recipes` with an empty query orders by name), which surfaces "A. J.", "A1", "ABC".
- **Home for a new guest** shows only the hero and the pantry card: recommendations, recently viewed, and popular by region all return nothing.
- **Drink ideas already has an empty state.** The blank the review saw is either the loading phase or the match query returning mostly staple recipes for an empty pantry (its missing ratio ignores staples).
- **Service** returns `null` while the profile loads (and through three default retries on failure), and the linked branch returns `null` while the bar loads.
- **Ratings** at zero render five faint stars beside "No ratings yet", which looks like a zero star score. Mobile display stars are read glyph by glyph.
- **Web Back** is `router.back()` with no fallback, so a shared link visitor leaves the site. Mobile already falls back to home, except one raw call in Bartender build.
- **Favorite** on web already has `aria-pressed` but also flips its label, so the state is announced twice; on cards it is a button inside a link (invalid nesting). Mobile has the same nesting and uses `selected` instead of `checked`.
- **Smaller gaps**: recipe hero images have `alt=""`; nav dropdown items use `outline-none` with only a hover style; there is no skip link; some mobile rows are unlabeled `TouchableOpacity`; web lint only runs the few jsx-a11y rules bundled in `eslint-config-next`.

The forces: a small team, a Hardening phase (polish before launch, no new infrastructure), both platforms kept in parity, and the project rules (shared logic in `packages/shared`, explicit error returns, every string in en and es).

## Options considered

### Option 1: Fix in place, backed by the fame score

Fix each gap where it lives. Run the existing tagging pipeline once, with one change (fame for every recipe), and use that score for Popular, the default search order, and a home "Classics" row.

**Pros**:
- No new service, table, or dependency; reuses spec 0010's reviewed pipeline.
- One signal fills three empty surfaces at once.
- Each fix is small, local, and reversible.

**Cons**:
- Fame is an LLM judgment, frozen at tagging time, not real usage.
- New recipes need a rerun to get a score.

### Option 2: Fix in place, order by user signals

Same fixes, but order search and fill home from ratings and favorites (as `recommend_recipes` already does), falling back to A to Z.

**Pros**:
- Reflects real behavior and improves automatically as usage grows.
- No LLM step to review.

**Cons**:
- With 1 rating and 5 favorites, the result is A to Z in practice for the foreseeable future, so it does not fix the problem it is meant to fix.
- Popular would still be empty.

### Option 3: Hide what is empty

Remove Popular from navigation and drop empty home sections until data exists; leave search alphabetical.

**Pros**:
- Least work; nothing misleading on screen.

**Cons**:
- Hides features rather than making them work; the home page gets thinner, not richer.
- Does not address search order at all.

### Option 4: Blended ranking

Fame score now, weighted toward ratings and favorites as they accumulate.

**Pros**:
- Best long term order.

**Cons**:
- A weighting to design and tune with no data to tune it on; premature for this phase.

## Rationale

The core problem is a cold start: the app has no usage data and will not have much before launch, so any user driven signal (Option 2) leaves the pages exactly as empty as they are now. The fame score is the only signal available today, the pipeline that produces it already exists and has a human review step, and running it costs about a dollar of Haiku calls. Decoupling fame from region is the one change needed so every recipe can be ordered, while Popular by region keeps its own rule. Option 4 is where this should go once ratings and favorites are meaningful, and nothing in Option 1 blocks it; it is recorded as a follow up rather than built now.

For the polish and accessibility items, fixing in place is right because each issue is local and the components are shared within each app (one `BackButton`, one `FavoriteToggle`, one `EmptyState` per app). Per item calls made during the conversation:

- **Zero ratings**: hide the stars entirely rather than outline them; any star row next to "No ratings yet" can read as a score.
- **Back fallback**: the page's logical parent beats always home, because a shared recipe link visitor wants to keep browsing recipes. In app history is tracked with a small React context holding a depth counter (in app navigations add one, browser back events subtract one). A simple "has navigated" flag was rejected in the cross check: after landing on A, going to B, and coming back to A, the flag stays on and the next Back leaves the site. Runner up was a same origin `document.referrer` check, rejected because client side navigations never update the referrer.
- **Drink ideas**: skip the match query when the pantry is empty, rather than only rewording, so the page cannot show staples only matches or a loading blank.
- **Service**: a spinner and an error with Retry, rather than falling back to solo mode, so a failure is visible and recoverable instead of silently showing the wrong mode.
- **Favorite on cards**: move it beside the link with a stretched link, rather than remove it, to keep the quick action while making the markup valid. A fixed name plus `aria-pressed` is the accessible toggle pattern; a flipping label plus pressed state double announces.
- **Image alt**: name the hero, keep card images decorative, so a card is not read as "Negroni, Negroni".
- **Classics row**: a new `classic_recipes` function rather than reusing `search_recipes('')`, because the row must disappear when nothing is scored, and search does not return the score. Runner up was adding `fame_score` to search's return columns, rejected because it changes a contract both apps and the admin UI consume.
- **Skip link target**: a wrapper `div` with `tabIndex={-1}` around page content in the layout, because pages already render their own `<main>` and a second `main` would be invalid.
- **A11y regression guard**: jsx-a11y's recommended rules plus a manual keyboard and screen reader pass, rather than adding Playwright and axe now, because there is no browser test stack or CI yet (feature 2) and a new stack would outweigh the fixes it guards.
- **Mobile copy**: new strings go through i18next now, so feature 41 has less to convert later.

### Evidence: code locations found during design

| Item | Web | Mobile |
|---|---|---|
| Popular empty | `apps/web/src/app/[locale]/popular/page.tsx:32-43`, `popular/[region]/page.tsx` | `apps/mobile/src/app/popular.tsx:53-57, 93-97` |
| Drink ideas empty | `apps/web/src/drink-ideas/drink-ideas-page-client.tsx:171-185` | `apps/mobile/src/app/drink-ideas.tsx:152-160` |
| Home sections | `apps/web/src/homepage/home-page-client.tsx:46-53`, `recommendations-carousel.tsx:26-28` | `apps/mobile/src/app/index.tsx:43-50`, `homepage/recommendations-carousel.tsx:22-23` |
| Service blank | `apps/web/src/app/[locale]/service/layout.tsx:28-30`, `service/service-page-client.tsx:269` | `apps/mobile/src/app/service.tsx:228, 278-281`, `service/use-bartender-mode-guard.ts:21-25` |
| Ratings | `apps/web/src/ratings/recipe-rating.tsx:26-38`, `star-rating.tsx:32-37` | `apps/mobile/src/ratings/recipe-rating.tsx:28-31`, `star-rating.tsx:25-31` |
| Back | `apps/web/src/components/back-button.tsx` (22 call sites) | `apps/mobile/src/components/back-button.tsx:21`, raw call at `app/bartender-build/[kind]/[id].tsx:233` |
| Images | `apps/web/src/recipes/recipe-card.tsx:38-43`, `recipe-detail-header.tsx:35-41` | `apps/mobile/src/recipes/recipe-image.tsx:33-39` |
| Favorite | `apps/web/src/favorites/favorite-toggle.tsx:21-35`, nested in `recipe-card.tsx:35-47` | `apps/mobile/src/favorites/favorite-toggle.tsx:15-19`, nested in `recipes/recipe-card.tsx:27-41` |
| Nav focus | `apps/web/src/components/site-nav.tsx` (`outline-none` on dropdown items) | n/a |
| Unlabeled rows | n/a | `app/learn/index.tsx:36-56`, `app/learn/[category]/index.tsx:70-91`, `app/popular.tsx:73-80`, `app/quizzes/index.tsx:47` |
| Search order | `supabase/migrations/20261010140000_search_recipes_rank_fix.sql` (browse CTE and final `order by`) | same function |
| Tagging | `packages/shared/scripts/tag-regions.ts`, `apply-regions.ts` | same |

Live data check, 2026-10-12: 432 live recipes; 0 with `fame_score`, `region`, or `popularity_rank`; 1 rating; 5 favorites across 4 recipes.
