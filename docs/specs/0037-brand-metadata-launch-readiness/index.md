# 0037. Brand, metadata, and launch readiness

**Date**: 2026-10-12
**Status**: In Progress

## Summary

The product is called Cocktailist everywhere: web titles, the header, privacy copy, the mobile app name, and the store listing. Every web page gets its own translated title in the form "Page | Cocktailist", and public pages also get their own description. A branded share card, a web manifest, and one icon set are all generated from the existing glass mark. Both apps ask once, on first visit, whether you are of legal drinking age where you live. A "no" blocks the app politely for that session, and nothing about the answer leaves the device. The mobile app drops its Expo template identity (name `mobile`, blue splash, Expo logo) and gets a real bundle ID, ready for the manual store steps listed at the end.

## Requirements

**User stories**:
- As a visitor, I see one product name, Cocktailist, in the header, browser tab, search results, shared links, and the installed app, so the product feels like one thing.
- As a visitor, I can tell my browser tabs apart because each page has its own title.
- As someone sharing a link, I get a branded preview card instead of a blank one.
- As an app store reviewer, I see an age confirmation and a responsible drinking notice that match an alcohol themed app.
- As someone under the legal drinking age, I am politely turned away and am not tracked.
- As the developer, I change the icon once and regenerate every size for both apps with one command.

**Acceptance criteria**:
- **AC-1**: The name "Bartending App" appears in no user facing string: web messages (`en.json`, `es.json`), web components, mobile `app.json`, mobile locale files. The header, root title, privacy copy, manifest, OG card, and mobile display name all read "Cocktailist". A unit test fails if "Bartending App" appears in `apps/web/messages/*.json`, `apps/mobile/src/i18n/locales/*.json`, or any `.ts`/`.tsx` file under `apps/web/src/` or `apps/mobile/src/` (the test file itself excluded).
- **AC-2**: Every web page renders `<title>` as "<page title> | Cocktailist", translated per locale, through a `title.template` on the locale layout, using the exact titles in the *Route titles* table. The home page uses the absolute title in `home.siteTitle`. No two different page types share a title. A locale scoped not found page (`[locale]/not-found.tsx`) titles itself "Page not found".
- **AC-3**: Each indexable page has its own translated meta description: home, search, recipe detail, more like this, popular index, popular region, learn index, learn category, learn article, quizzes index, quiz detail, drink ideas, privacy. Private pages (pantry, account, account reset password, auth callback, favorites, shopping list, every admin page, every service page) have a unique title and fall back to the site description.
- **AC-4**: The site description reads "Cocktail recipes, drink ideas from what's in your pantry, and bartending know how for home bartenders." in English, with a Spanish translation in `es.json`.
- **AC-5**: Any page without its own image shares a generated 1200x630 PNG card per locale: the glass mark, "Cocktailist", and the translated tagline, on the charcoal background with the green accent. Recipe pages keep the recipe photo as `og:image`. `og:site_name` is "Cocktailist" on every page, including pages that set their own `openGraph` (a test renders `og:site_name` and `og:image` for each route type).
- **AC-6**: `/manifest.webmanifest` is served with `name` and `short_name` "Cocktailist", the English description, `start_url` "/", `display` "standalone", `background_color` and `theme_color` set to the dark token `bg` (`#121212`), and icons at 192, 512, and maskable 512. Chrome DevTools reports the app as installable.
- **AC-7**: The favicon (`favicon.ico`, 16/32/48), `icon.svg`, the 180px `apple-icon.png`, the manifest PNGs, and every Expo icon and splash image come from one source SVG through `pnpm icons` (which overwrites the existing create-next-app `favicon.ico` in place). Running it twice in a row on the same machine leaves `git status` clean; a pixel size test checks every output on any machine.
- **AC-8**: The mobile `app.json` has name "Cocktailist", slug and scheme `cocktailist`, `ios.bundleIdentifier` and `android.package` set to `com.cocktailist.app`, brand icon, adaptive icon, and splash on charcoal, and no template blue (`#208AEF`, `#E6F4FE`). The animated splash overlay shows the brand mark, not the Expo logo. A password reset email on mobile opens the app at `cocktailist://auth/callback`; on an install that hasn't confirmed age yet, the gate shows first and the reset screen is showing once the user taps yes (mobile has no exempt routes).
- **AC-9**: On a first web visit to any page that isn't exempt, a modal asks `ageGate.question` (see *Gate copy*) before any page content can be used. The page stays visible under a semi opaque scrim (never hidden with `display` or `visibility`), but nothing behind it is clickable or focusable. On later loads, after a "yes", the page paints with no gate and no flash of the gate, and before a "yes", content never flashes before the gate.
- **AC-10**: "Yes" is stored on the device only (web `localStorage` key `age-confirmed` = `"1"`, mobile `AsyncStorage` same key and value) and that browser or install never asks again. No network request, database write, or analytics event records the answer.
- **AC-11**: "No" replaces the question with a polite blocked screen (`ageGate.blockedTitle` and `ageGate.blockedBody`) that has no retry control. The block lasts for that browser tab on web (`sessionStorage` key `age-denied`; a newly opened tab asks again) and until the app process restarts on mobile (in memory). It is not recorded anywhere else.
- **AC-12**: `/privacy` and `/auth/callback` (bare and under every locale prefix, with an optional trailing slash) never show the gate, on first load and after client navigation into them; navigating out of them shows the gate again if unanswered. `/account/reset-password` is not exempt. The blocked screen links to the privacy page.
- **AC-13**: On mobile the gate covers the whole app on launch, after i18n is ready, until answered. A deep link opened while unconfirmed lands on its target route once the user confirms.
- **AC-14**: A responsible drinking line ("Please drink responsibly.", translated) shows on the gate, in the web footer on every page, and on the mobile Account screen.
- **AC-15**: On web the cookie consent banner does not render until the gate is confirmed (or the route is exempt). On mobile the PostHog client is not initialized (so no event and no `identify` can be sent) until the gate is confirmed. Gate outcomes are never sent to PostHog.
- **AC-16**: If storage is blocked or throws (private mode, quota), the gate still works for the current page or app session, asks again on the next load, and never crashes or leaves the page stuck behind the overlay.
- **AC-17**: The gate is an accessible modal: `role="dialog"`, `aria-modal`, a labelled title, focus moved into it on show (web: the yes button; mobile: `AccessibilityInfo.setAccessibilityFocus` on the title), the page behind it `inert` on web, Tab kept inside it, the Android back button doing nothing while it shows, fully keyboard operable, readable in light and dark themes, and translated in English and Spanish on both apps.

## Decision

**Chosen option**: Cocktailist everywhere through a shared brand constant; a title template plus per page metadata; a generated OG card; one SVG source driving every icon through a committed `sharp` script; and an age confirmation stored on the device only, gated before paint on web and as a full screen overlay on mobile.

Store the age answer on the device, render the web gate from the server with its visibility decided by an inline head script before paint, and keep everything about the gate off the network.

**Implementation skills**: `nextjs-app-router-patterns` (`wshobson/agents`, `.agents/skills/nextjs-app-router-patterns/`) · `react-native-best-practices` (`callstackincubator/agent-skills`, `.agents/skills/react-native-best-practices/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: no schema change. Device state only:

| Store | Key | Value | Lifetime |
|---|---|---|---|
| web `localStorage` | `age-confirmed` | `"1"` | until site data is cleared |
| web `sessionStorage` | `age-denied` | `"1"` | browser session (the tab) |
| mobile `AsyncStorage` | `age-confirmed` | `"1"` | until uninstall or data clear |
| mobile React state | (none) | denied flag | until the app process restarts |

The value `"1"` is a version. If the gate wording ever has to change in a way that needs everyone to answer again, bump it to `"2"` and treat any other value as unanswered.

**State transitions** (gate, per device):
`unknown` → (storage read) → `confirmed` | `denied` | `ask`; `ask` → (yes) → `confirmed`; `ask` → (no) → `denied`; `denied` → (session ends) → `ask`. Exempt routes resolve to `exempt` regardless of state and render normally.

**Shared logic** (`packages/shared`, pure, unit tested):
- `src/brand.ts`: `BRAND_NAME = "Cocktailist"`, `BRAND_BUNDLE_ID = "com.cocktailist.app"`, `BRAND_SCHEME = "cocktailist"`, `TITLE_SEPARATOR = " | "`. Export from `index.ts`.
- `src/ageGate.ts`: `AGE_CONFIRMED_KEY`, `AGE_DENIED_KEY`, `AGE_GATE_VERSION = "1"`, `AGE_GATE_EXEMPT_PATTERN` built from `SUPPORTED_LOCALES`, which today yields exactly `^(?:/(?:en|es))?/(?:privacy|auth/callback)/?$` (no flags), and `resolveAgeGateState({ confirmedValue, denied, pathname }): "exempt" | "confirmed" | "denied" | "ask"`.

**Web surfaces** (`apps/web`):

| Surface | Change |
|---|---|
| `src/app/[locale]/layout.tsx` `generateMetadata` | `title: { template: "%s | Cocktailist", default: <home absolute title> }`, `description` (AC-4), `applicationName`, `openGraph.siteName`, `manifest` comes from the file convention |
| `src/app/[locale]/layout.tsx` `generateViewport` | `themeColor` per `prefers-color-scheme` from the token `bg` values |
| `src/app/[locale]/layout.tsx` head | second inline script beside `themeInitScript`: reads both storage keys in `try`, tests `location.pathname` against `new RegExp(<AGE_GATE_EXEMPT_PATTERN.source>)`, sets `html[data-age]` to `exempt`, `ok`, `denied`, or `ask` (`ask` if storage throws) |
| `src/app/[locale]/layout.tsx` `<html>` | add `suppressHydrationWarning` (the head scripts change attributes before hydration) |
| `src/app/[locale]/page.tsx` | `title: { absolute: t("siteTitle") }`, own description |
| every route in *Route titles* without `generateMetadata` | add one: title from the table, description for indexable ones; `quizzes/[slug]` gains a description |
| `src/app/[locale]/not-found.tsx` (new) | minimal page with `common.notFoundTitle` as title and an `EmptyState` linking home |
| `src/lib/open-graph.ts` (new) | `buildOpenGraph(locale, overrides)`: returns `siteName: BRAND_NAME`, `locale`, and the overrides. Every page that sets `openGraph` calls it, because Next merges metadata shallowly per key and a page's own `openGraph` would otherwise drop the layout's `siteName`. Pages with their own image pass it; others leave `images` unset so the file convention card applies (confirm in build output, AC-5 test) |
| `src/app/[locale]/opengraph-image.tsx` | `next/og` `ImageResponse`, 1200x630, its own `generateStaticParams` returning every locale, Fraunces read with `readFile(join(process.cwd(), "src/assets/fonts/Fraunces-SemiBold.ttf"))`, colors from `@bartendingapp/shared` tokens, `alt` from `home.ogTagline` |
| `src/assets/fonts/Fraunces-SemiBold.ttf` + `OFL.txt` | committed font (kept inside `apps/web` so Vercel file tracing includes it) |
| `src/app/manifest.ts` | `MetadataRoute.Manifest` per AC-6; description from `getTranslations({ locale: "en", namespace: "home" })`. The proxy matcher already skips paths with a dot, so `/manifest.webmanifest` is not locale redirected |
| `src/app/icon.svg`, `src/app/apple-icon.png`, `src/app/favicon.ico` (overwritten), `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | generated outputs |
| `src/age-gate/age-gate-store.ts` (new) | external store read with `useSyncExternalStore`: holds gate state, initialized from `html[data-age]` on the client; server snapshot `"ask"`. Writes storage on answer (through `age-gate-storage.ts`) and, in a layout effect on every state or pathname change, sets `document.documentElement.dataset.age` and toggles `inert` on `#app-content` |
| `src/age-gate/age-gate.tsx` (new) | client component, server rendered into the locale layout after `#app-content`; CSS shows it only for `html[data-age="ask"]` or `"denied"`; recomputes `exempt` from `usePathname()` with `resolveAgeGateState`; traps Tab; scrim is semi opaque over still visible content |
| `src/age-gate/age-gate-storage.ts` | `try` wrapped get and set for both keys; on failure falls back to in memory state (AC-16) |
| `src/app/globals.css` | `html[data-age="ask"] #app-content, html[data-age="denied"] #app-content { pointer-events: none; user-select: none; }` (covers the gap before hydration sets `inert`); gate shown only for those two values; never `display: none` or `visibility: hidden` on `#app-content` |
| `src/components/site-logo.tsx` | wordmark text from `BRAND_NAME` |
| `src/components/site-footer.tsx` | responsible drinking line |
| `src/app/[locale]/providers.tsx` | wrap `SiteNav`, children, and `SiteFooter` (moved in from the layout) in `<div id="app-content">`; render `ConsentBanner` only when the gate store reads `confirmed` or `exempt` |
| `messages/en.json`, `messages/es.json` | "Bartending App" replaced by "Cocktailist"; keys in *Gate copy* and *Route titles*; `common.notFoundTitle` |
| `public/file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg` | delete (unreferenced create-next-app leftovers) |

**Mobile surfaces** (`apps/mobile`):

| Surface | Change |
|---|---|
| `app.json` | `name`, `slug`, `scheme`, `ios.bundleIdentifier`, `android.package`, `android.adaptiveIcon.backgroundColor`, splash `backgroundColor` per AC-8; remove `ios.icon` (`./assets/expo.icon`) so iOS uses the generated `icon.png` |
| `assets/images/*` | generated `icon.png`, `android-icon-foreground.png`, `android-icon-background.png`, `android-icon-monochrome.png`, `splash-icon.png`, `favicon.png`, plus `brand-mark.png` for the animated splash; delete `expo-logo.png`, `expo-badge*.png`, `react-logo*.png`, `tutorial-web.png`, `logo-glow.png`, `assets/expo.icon` once unreferenced |
| `src/components/animated-icon.tsx`, `.web.tsx` | use `brand-mark.png`, drop the glow |
| `src/components/web-badge.tsx` | delete (unused template) |
| `src/age-gate/age-gate-overlay.tsx` (new) | absolute fill view rendered after `<AnimatedSplashOverlay />` so it sits above both it and `AppTabs` (`AppTabs` mounts immediately underneath, so the router state, including a deep link target, is kept); `accessibilityViewIsModal`; `AccessibilityInfo.setAccessibilityFocus` on the title; a `BackHandler` listener returning `true` while shown (`predictiveBackGestureEnabled` stays `false`) |
| `src/age-gate/use-age-gate.ts` (new) | reads `AsyncStorage` once on mount, holds denied in state, uses `resolveAgeGateState` with `pathname` `null` (no exempt routes on mobile) |
| `src/analytics/posthog-client.ts` | remove the import time `tryInit()`; export `initAnalytics()`; `identify` and capture helpers stay no ops while `client` is `null` |
| `src/app/_layout.tsx` | the existing early `return null` waits on both i18n and the gate read (the read must not add to splash time beyond that); call `initAnalytics()` then `identify` only once confirmed |
| `src/app/account.tsx` | responsible drinking line near the privacy policy row |
| `src/i18n/locales/*` | `ageGate` keys, `account.responsibleDrinking` |
| `package.json` | `name` stays `mobile` (workspace filter `--filter=mobile` depends on it) |

Expo web (`app.json` `web` output) gets the same behavior for free, since `AsyncStorage` maps to `localStorage` there; it is not a supported target and gets no extra work.

**Gate copy** (web `ageGate` namespace; mobile the same keys under `ageGate`):

| Key | en | es |
|---|---|---|
| `title` | Before you come in | Antes de entrar |
| `question` | Are you of legal drinking age where you live? | ¿Tienes la edad legal para beber donde vives? |
| `yes` | Yes, I am | Sí, la tengo |
| `no` | No | No |
| `blockedTitle` | Come back later | Vuelve más adelante |
| `blockedBody` | Cocktailist is for people of legal drinking age. Come back when you're of age. | Cocktailist es para personas con la edad legal para beber. Vuelve cuando la tengas. |
| `privacyLink` | Privacy Policy | Política de privacidad |
| `responsibleDrinking` | Please drink responsibly. | Bebe con responsabilidad. |

The footer (`footer.responsibleDrinking`) and mobile Account (`account.responsibleDrinking`) reuse the same sentence. The privacy page adds `privacy.ageGateBody`: "The age confirmation answer is stored only on your device." / "La respuesta a la confirmación de edad se guarda solo en tu dispositivo."

**Route titles** (the part before " | Cocktailist"; existing keys reused where they exist):

| Route | Title key | en | es | Description |
|---|---|---|---|---|
| `/` | `home.siteTitle` (absolute) | Cocktailist: cocktail recipes and pantry ideas | Cocktailist: recetas de cócteles e ideas con tu despensa | `home.metaDescription` (existing) |
| `/search` | `search.metaTitle` (existing) | Search recipes | Buscar recetas | existing |
| `/recipes/[slug]` | recipe name | (data) | (data) | existing (spec 0011) |
| `/recipes/[slug]/more-like-this` | `moreLikeThis.metaTitle` | More like {name} | Más como {name} | `moreLikeThis.metaDescription`: "Cocktails and mocktails similar to {name}." / "Cócteles y mocktails parecidos a {name}." |
| `/popular` | `popular.title` (existing) | Popular drinks by region | Bebidas populares por región | `popular.indexMetaDescription`: "See which cocktails and mocktails are popular in each region." / "Descubre qué cócteles y mocktails son populares en cada región." |
| `/popular/[region]` | `popular.metaTitle` (existing) | Popular drinks in {region} | Bebidas populares en {region} | existing |
| `/learn` | `learn.title` (existing) | Learn | Aprende | `learn.metaDescription`: "Short guides to spirits, techniques, and tools for home bartenders." / "Guías breves sobre destilados, técnicas y herramientas para bartenders en casa." |
| `/learn/[category]` | `learn.categoryMetaTitle` (existing) | {label} articles | Artículos de {label} | existing |
| `/learn/[category]/[slug]` | article title | (data) | (data) | article `summary` (spec 0033) |
| `/quizzes` | `quizzes.title` (existing) | Quizzes | Cuestionarios | existing |
| `/quizzes/[slug]` | quiz title | (data) | (data) | `quizzes.detailMetaDescription`: "Take the {title} quiz and test your bartending knowledge." / "Haz el cuestionario {title} y pon a prueba lo que sabes de coctelería." |
| `/drink-ideas` | `drinkIdeas.title` (existing) | Drink ideas | Ideas de bebidas | `drinkIdeas.metaDescription`: "Get cocktail ideas from the ingredients you already have." / "Obtén ideas de cócteles con los ingredientes que ya tienes." |
| `/privacy` | `privacy.metaTitle` (existing) | Privacy Policy | Política de privacidad | existing, brand fixed |
| `/pantry` | `pantry.title` (existing) | Your pantry | Tu despensa | site fallback |
| `/favorites` | `favorites.title` (existing) | Favorites | Favoritos | site fallback |
| `/shopping-list` | `shoppingList.title` (existing) | Shopping list | Lista de compras | site fallback |
| `/account` | `account.metaTitle` | Account | Cuenta | site fallback |
| `/account/reset-password` | `account.resetPasswordMetaTitle` | Reset password | Restablecer contraseña | site fallback |
| `/auth/callback` | `account.callbackMetaTitle` | Signing you in | Iniciando sesión | site fallback |
| `/admin/comments` | `admin.commentsMetaTitle` | Comment moderation | Moderación de comentarios | site fallback |
| `/admin/recipes` | `admin.recipesMetaTitle` | Manage recipes | Gestionar recetas | site fallback |
| `/admin/recipes/new` | `admin.newRecipeMetaTitle` | New recipe | Nueva receta | site fallback |
| `/admin/recipes/[id]/edit` | `admin.editRecipeMetaTitle` | Edit recipe | Editar receta | site fallback |
| `/service` | `service.metaTitle` | Service | Servicio | site fallback |
| `/service/search` | `service.searchMetaTitle` | Service search | Búsqueda de servicio | site fallback |
| `/service/build/[kind]/[id]` | `service.buildMetaTitle` | Quick build | Preparación rápida | site fallback |
| `/service/recipes/new` | `service.newRecipeMetaTitle` | New house recipe | Nueva receta de la casa | site fallback |
| `/service/invite` | `service.inviteMetaTitle` | Join a bar | Unirse a un bar | site fallback |
| `/service/invites` | `service.invitesMetaTitle` | Bar invites | Invitaciones del bar | site fallback |
| not found | `common.notFoundTitle` | Page not found | Página no encontrada | site fallback |

Where an existing key's text differs from this table, the existing text wins; only the Spanish column fills keys that don't exist yet. `home.siteDescription` (AC-4) in es: "Recetas de cócteles, ideas de bebidas con lo que tienes en tu despensa y conocimientos de coctelería para bartenders en casa." `home.ogTagline`: "Cocktail recipes and pantry ideas" / "Recetas de cócteles e ideas con tu despensa".

**Icon pipeline** (repo root):
- `assets/brand/mark.svg`: the coupe glass from `site-logo.tsx` as a standalone mark, green accent (`#1E763B`) glass with the charcoal (`#121212`) rim line, on a transparent background.
- `scripts/generate-icons.mjs`, run by `pnpm icons`: uses `sharp` (root `devDependency`, exact version pinned, no caret) to render the mark onto a charcoal square for the opaque sizes (Apple, iOS, maskable inside the 80% safe zone, Android background solid charcoal), transparent for `icon.svg`, Android foreground, monochrome (white silhouette), and splash. It writes `favicon.ico` by packing the 16, 32, and 48 PNGs into an ICO container directly (a 6 byte header plus one 16 byte entry per image, all fields little endian, a width or height byte of 0 meaning 256; ICO files may embed PNG), so no extra dependency. Output is deterministic on one machine: fixed sizes, no metadata (`sharp` `.png({ compressionLevel: 9 })` with metadata stripped). Bytes may differ across `libvips` builds, so the cross machine check is the pixel size test, not a byte diff.

**API surface**: no new endpoints. Next.js file conventions add `GET /manifest.webmanifest`, `GET /[locale]/opengraph-image` (static at build), `GET /icon.svg`, `GET /apple-icon.png`, `GET /favicon.ico`.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Any page `<title>` | brand suffix | `BRAND_NAME` in `packages/shared/src/brand.ts` via the layout `title.template` |
| Any page `<title>` | page part | that page's message namespace `title` (or data: recipe name, article title, quiz title, region name) |
| Home `<title>` | absolute title | `home.siteTitle` message |
| Indexable page description | description text | that page's `metaDescription` message, or data (recipe description already built by spec 0011, article `summary` from spec 0033) |
| More like this description | recipe name inside it | the recipe fetched by the page, interpolated into `moreLikeThis.metaDescription` |
| Private page description | site description | layout `home.siteDescription` fallback |
| OG card | tagline text, `alt` | `home.ogTagline` message (a short form of the site description) in the route's locale |
| OG card | colors | `colors.dark` in `packages/shared/src/tokens.ts` |
| OG card | font | `apps/web/src/assets/fonts/Fraunces-SemiBold.ttf` read at build |
| Gate copy, route titles | text | the *Gate copy* and *Route titles* tables above |
| `og:site_name` on pages with their own `openGraph` | brand | `buildOpenGraph` in `apps/web/src/lib/open-graph.ts` |
| Manifest | name, description, colors, icons | `BRAND_NAME`, English `home.siteDescription` (manifest is not localized), `colors.dark.bg`, generated icon paths |
| Viewport `themeColor` | per scheme color | `colors.light.bg`, `colors.dark.bg` |
| Gate question, buttons, blocked copy, notice | text | `ageGate` namespace in the page locale (web) or the i18next language (mobile) |
| Gate visibility before paint | `html[data-age]` | inline script reading `localStorage[age-confirmed]`, `sessionStorage[age-denied]`, `location.pathname` against `AGE_GATE_EXEMPT_PATTERN` |
| Gate state after hydration | state | `age-gate-store.ts`, seeded from `html[data-age]`, recomputed by `resolveAgeGateState` with storage values and `usePathname()` |
| Consent banner visibility | gate state | `age-gate-store.ts` read in `providers.tsx` |
| Mobile app name, scheme, IDs | config values | literal in `app.json`, mirroring `BRAND_NAME`, `BRAND_SCHEME`, `BRAND_BUNDLE_ID` (a test asserts they match) |
| Password reset deep link | redirect URL | `Linking.createURL("auth/callback")`, which now resolves to `cocktailist://auth/callback`, allowed in Supabase Auth URL configuration (manual step) |

**Key invariants**:
- The gate never sends, stores, or logs its answer outside the device (no Supabase, no PostHog, no Sentry breadcrumb with the value).
- Page content stays in the server HTML on every route; the gate is an overlay, never a redirect or a server branch on stored age.
- The exempt pattern lives once in `packages/shared` and is used by the head script, the web component, and tests.
- `BRAND_NAME` is the only place code spells the brand; message files spell it literally (brand names are not translated) and the AC-1 test guards them.
- Generated icon files are never edited by hand; change `assets/brand/mark.svg` and rerun `pnpm icons`.

**Security model**: no new data, no auth change, no RLS change. The gate is a self declaration, not identity verification, and is documented as such. It collects no birth date, so no new PII enters the privacy policy. The privacy page gains one sentence: "The age confirmation answer is stored only on your device."

**Configuration required**: none in code. Manual steps are listed under *Launch checklist*.

**Critical test scenarios**:
- Happy path, web: clear storage, open `/en/recipes/<slug>`, gate shows, consent banner hidden; tap yes; content usable, banner appears; reload shows no gate and no flash. Verifies **AC-9**, **AC-10**, **AC-15**.
- Deny, web: tap no, blocked screen shows with privacy link; navigate to `/es/privacy`, page readable; reload the same tab, still blocked; open a new tab, asked again. Verifies **AC-11**, **AC-12**.
- Storage blocked: stub `localStorage.setItem` to throw; tap yes; page usable; reload asks again; no console error escapes. Verifies **AC-16**.
- `resolveAgeGateState` unit table: every combination of stored value (`null`, `"1"`, `"0"`, `"2"`), denied flag, and pathname (`/privacy`, `/es/privacy/`, `/en/auth/callback`, `/en/recipes/privacy-cocktail-123`, `/`), the last recipe slug must not count as exempt. Verifies **AC-10**, **AC-11**, **AC-12**.
- Mobile deep link: fresh install, open `cocktailist://recipe/<id>`, gate shows above the splash fade; Android back does nothing; confirm; recipe screen is showing; no PostHog request was made before the tap. Verifies **AC-13**, **AC-15**, **AC-17**.
- Mobile password reset: fresh install, request reset, open the email link on the device, gate shows; confirm; the reset screen is showing. Verifies **AC-8**.
- Client navigation: with the gate unanswered, navigate client side from `/en/privacy` to a recipe and back; the gate appears and disappears with no reload. Verifies **AC-12**.
- Open Graph: render metadata for home, search, recipe, article, popular region, and a private page; each has `og:site_name` "Cocktailist" and an `og:image` (recipe photo or the default card). Verifies **AC-5**.
- Titles: render metadata for each route in both locales and assert the template suffix, the absolute home title, unique titles across route types, and a description on every route in the AC-3 indexable list. Verifies **AC-2**, **AC-3**.
- Brand guard: scan the message files, mobile locale files, and `.ts`/`.tsx` under both apps' `src/` for "Bartending App"; assert `app.json` values equal the shared brand constants. Verifies **AC-1**, **AC-8**.
- Icons: run `pnpm icons` twice on one machine, assert no diff; assert each output's pixel size (the cross machine check). Verifies **AC-7**.
- Manifest and OG: fetch `/manifest.webmanifest` and `/en/opengraph-image`, assert fields and a 1200x630 PNG; Chrome installability check. Verifies **AC-5**, **AC-6**.
- Accessibility: keyboard only, Tab stays inside the gate, the page behind is `inert`, screen reader announces the dialog title, in both themes. Verifies **AC-17**.

## Build plan

Tracer Bullet: the first slice threads the brand and the gate through shared, web, and mobile at their thinnest; later slices thicken each segment.

1. **Thin thread.** Add `brand.ts` and `ageGate.ts` (with unit tests) to `packages/shared`; set the web layout `title.template`, the home absolute title, and the "Cocktailist" swap in both message files and `site-logo.tsx`; move `SiteNav`, children, and `SiteFooter` into `<div id="app-content">` in `providers.tsx`, then add `age-gate-store.ts`, the head script, `suppressHydrationWarning`, and a minimal server rendered gate with yes and no wired to storage (the wrapper and store come first because they change the DOM every later test sees); rename the mobile app in `app.json` (name only) and mount the mobile overlay with `AsyncStorage`. Prove a first visit to a recipe page on both apps shows the gate and the brand. Satisfies **AC-1**, **AC-2**, **AC-9**, **AC-10**, **AC-11**, **AC-13**.
2. **Gate hardening.** Exempt routes through the shared pattern, including client navigation in and out; storage failure fallback; consent banner held on the gate store; mobile PostHog init moved out of import time and held until confirmed; the `pointer-events` CSS, `inert`, Tab trap, focus, dialog semantics; mobile `BackHandler`, accessibility focus, and z order above the splash overlay; blocked screen privacy link; responsible drinking line on the gate, web footer, and mobile Account; the full *Gate copy* table in en and es; the privacy page sentence. Satisfies **AC-11**, **AC-12**, **AC-14**, **AC-15**, **AC-16**, **AC-17**.
3. **Icon pipeline.** `assets/brand/mark.svg`, `scripts/generate-icons.mjs`, root `pnpm icons` script and `sharp` dev dependency; generate and commit every web and mobile output; replace the animated splash image; delete template assets, `web-badge.tsx`, and the unused `public/*.svg`. Satisfies **AC-7**, **AC-8**.
4. **Mobile identity.** Slug, scheme, bundle ID, package, adaptive icon and splash colors in `app.json`; remove `ios.icon`; the `app.json` constant match test; verify the password reset deep link on a dev client build after the Supabase redirect URL is added. Satisfies **AC-8**.
5. **Manifest and share card.** `app/manifest.ts`, `generateViewport` theme colors, `opengraph-image.tsx` with its own `generateStaticParams` and the Fraunces TTF in `apps/web/src/assets/fonts/`, the `buildOpenGraph` helper adopted by every page that sets `openGraph`, and the new site description and `ogTagline` in both locales. Satisfies **AC-4**, **AC-5**, **AC-6**.
6. **Metadata coverage.** Add `generateMetadata` to every route in *Route titles* that lacks one (account, reset password, every admin page, auth callback, drink ideas, favorites, learn index, pantry, popular index, more like this, every service page, shopping list), a description on `quizzes/[slug]`, and `[locale]/not-found.tsx`; the title uniqueness and description coverage test; the widened brand guard test. Satisfies **AC-1**, **AC-2**, **AC-3**.

## Launch checklist

Manual steps no build task can do. Each one is something you may run when you're ready to submit.

- [ ] Check that "Cocktailist" is free as an App Store name, a Play Store title, and a domain (and do a basic trademark search) before the first submission. The bundle ID `com.cocktailist.app` assumes you'll control a cocktailist domain.
- [ ] Set `NEXT_PUBLIC_SITE_URL` to the real domain in Vercel Production (still owed from feature 37).
- [ ] Replace `privacy@bartendingapp.example.com` with a real address (still owed from feature 36).
- [ ] In Supabase Auth URL configuration for `BartendingAppWeb`, add `cocktailist://auth/callback` to the redirect allow list. Keep `mobile://auth/callback` until no installed dev client uses the old scheme.
- [ ] App Store Connect age rating: answer the alcohol, tobacco, or drug use or references question as frequent, and the rest as none; confirm the resulting rating is the alcohol tier the questionnaire assigns at the time.
- [ ] Google Play content rating (IARC): declare alcohol references; record the resulting ratings.
- [ ] App Store privacy labels and Play Data safety: fill from the current privacy policy (anonymous and signed in identifiers, email for accounts, PostHog usage analytics with search text, comment text and photos, crash data through Sentry).
- [ ] Support URL and privacy policy URL in both store listings (the privacy page on the production domain).
- [ ] EAS build and submit configuration is not part of this feature; it is needed before the first store build.

## Consequences

**Positive**:
- One name and one icon across tabs, search results, shares, installs, and the stores.
- Every tab is identifiable and every public page has its own snippet in search.
- Store reviewers see the expected age confirmation and notice, and no personal data is collected for it.
- Icon changes become one edit plus one command.

**Negative / tradeoffs**:
- The gate adds a tap for every new visitor and every new browser, and some first time visitors will bounce at it.
- A self declared gate is trivially bypassed (clear storage, answer yes). It meets store expectations, not legal age verification.
- Googlebot renders without stored state, so it sees the overlay above the content. The content stays in the DOM and age interstitials are an accepted pattern, but it is a small ranking risk worth watching in Search Console.
- Changing the mobile scheme invalidates `mobile://` links in old reset emails and in already installed dev clients.
- Dropping `assets/expo.icon` gives up a layered Icon Composer icon on iOS for a flat one until a designed icon exists.
- About 20 new message keys per locale, plus about 12 descriptions to keep accurate.

**Neutral**:
- `sharp` and one OFL font file join the repo; neither ships to clients.
- The workspace package stays named `mobile`, so the internal name and the brand differ on purpose.
- The manifest is English only; installed app names are not localized.

## Follow-up

- [ ] Commission or design a proper icon (and an iOS Icon Composer `.icon`) later; drop it in as `assets/brand/mark.svg` and rerun `pnpm icons`.
- [ ] Spec EAS build and submit profiles (`eas.json`, version auto increment) as their own feature before the first store build.
- [ ] Draft store listing copy (title, subtitle, keywords, description) in English and Spanish.
- [ ] Revisit a mocktails only mode for under age visitors if the gate's drop off proves costly.
- [ ] Watch Search Console coverage for recipe pages for a few weeks after the gate ships.
