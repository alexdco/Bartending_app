# Verify: Brand, metadata, and launch readiness · spec 0037 · updated 2026-10-12
_Steps derived from spec 0037 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

Already proven during the build (2026-10-12): the web gate steps below passed in headless Chromium against both `pnpm web` and a production build (29 checks), every route returned one translated title and `og:site_name` "Cocktailist" in en and es, and Chrome reported no installability errors. The mobile steps have not run on a device yet.

## UI / manual (web)
- [ ] Clear site data, open `/en/recipes/<slug>` → the "Before you come in" dialog shows over the still visible page, the cookie banner is hidden, focus is on "Yes, I am" → AC-9, AC-15, AC-17
- [ ] Press Tab repeatedly → focus stays inside the dialog; clicking the page behind does nothing (`#app-content` is `inert`) → AC-9, AC-17
- [ ] Tap "Yes, I am" → page usable, cookie banner appears, `localStorage["age-confirmed"]` is `"1"`, no network request carries the answer (check DevTools Network) → AC-10, AC-15
- [ ] Reload → no gate and no flash of it (`html[data-age]` is `ok` before hydration) → AC-9
- [ ] New browser profile, open `/es/search`, tap "No" → "Vuelve más adelante" shows with no retry button and a privacy link → AC-11
- [ ] Follow the privacy link → `/es/privacy` is readable with no gate; click the logo → the block shows again; reload the tab → still blocked; open a new tab → asked again → AC-11, AC-12
- [ ] Unanswered, open `/en/privacy/` and `/auth/callback` directly → no gate; `/en/account/reset-password` → gate shows → AC-12
- [ ] Make `localStorage.setItem` throw (DevTools override), tap yes → page usable; reload → asked again; no console errors → AC-16
- [ ] Repeat the first step in light and dark themes → the dialog is readable in both → AC-17
- [ ] Footer on any page shows "Please drink responsibly." (es: "Bebe con responsabilidad.") → AC-14
- [ ] `/en/privacy` lists "The age confirmation answer is stored only on your device." → spec security model

## UI / manual (mobile, dev client build)
- [ ] Fresh install → the gate covers the app after the splash, title "Before you come in"; Android back does nothing; a screen reader lands on the title → AC-13, AC-17
- [ ] Tap "No" → blocked screen with the privacy link; kill and relaunch the app → asked again → AC-11
- [ ] Fresh install, open `cocktailist://recipe/<id>` → gate shows; confirm → the recipe screen is showing → AC-13
- [ ] Fresh install, watch PostHog (or a proxy) → no request before tapping yes; after yes, events and `identify` arrive → AC-15
- [ ] After adding `cocktailist://auth/callback` to the Supabase redirect allow list, request a password reset on the device and open the email link → gate first, then the reset screen → AC-8
- [ ] Home screen shows "Cocktailist" with the green glass icon; splash and the animated splash are charcoal with the glass, no Expo logo or blue → AC-8
- [ ] Account screen shows "Please drink responsibly." near the privacy row → AC-14

## Commands
- [ ] `pnpm test` → all pass, including `packages/shared/src/ageGate.test.ts`, `scripts/brand.test.ts`, `scripts/generate-icons.test.ts`, `apps/web/src/app/route-metadata.test.ts` → AC-1, AC-2, AC-3, AC-7, AC-8, AC-10, AC-11, AC-12
- [ ] `pnpm icons` twice, then `git status` → no changes to generated icons → AC-7
- [ ] `pnpm --filter web build && pnpm --filter web exec next start -p 3100`, then `curl localhost:3100/manifest.webmanifest` → name and short_name "Cocktailist", `#121212` colors, 192, 512, and maskable 512 icons → AC-6
- [ ] `curl -o card.png localhost:3100/es/opengraph-image/card` → a 1200x630 PNG with the glass, "Cocktailist", and the Spanish tagline → AC-5
- [ ] In Chrome DevTools > Application > Manifest on the production build → installable, no errors → AC-6

## Value sourcing checks
- [ ] Brand suffix: change nothing, view `/en/search` and `/es/search` → both end in " | Cocktailist" (from `BRAND_NAME` via the layout template) → AC-2
- [ ] Page title part: `/es/pantry` → "Tu despensa | Cocktailist" (message namespace, not the English text) → AC-2
- [ ] Home absolute title: `/es` → "Cocktailist: recetas de cócteles e ideas con tu despensa" with no suffix → AC-2
- [ ] Indexable description: `/es/drink-ideas` → "Obtén ideas de cócteles con los ingredientes que ya tienes." → AC-3
- [ ] More like this: `/es/recipes/<slug>/more-like-this` for two different recipes → the title and description carry each recipe's own name → AC-2, AC-3
- [ ] Private description: `/en/pantry` → the site description (`home.siteDescription`) → AC-3, AC-4
- [ ] OG card tagline and alt: `/es` → `og:image:alt` is "Recetas de cócteles e ideas con tu despensa" → AC-5
- [ ] OG card colors: the card background is `#121212` and the accent `#1E763B` (from `colors.dark`) → AC-5
- [ ] `og:site_name` on pages with their own `openGraph`: `/en/popular/<region>` and a recipe → "Cocktailist"; the recipe keeps its photo as `og:image`, the region page gets the card → AC-5
- [ ] Manifest description is English even when visited from `/es` → AC-6
- [ ] Viewport theme color: two `theme-color` metas, `#F7F7F5` for light and `#121212` for dark → spec Value sourcing
- [ ] Gate copy locale: `/es/...` shows the Spanish gate; on mobile, switch the app language to Spanish and reinstall → Spanish gate → AC-17
- [ ] Gate before paint: with DevTools CPU throttling at 6x, reload a confirmed page and record a Performance trace → no frame shows the gate; reload an unconfirmed page → no frame shows usable content before the gate → AC-9
- [ ] Mobile config mirrors constants: `scripts/brand.test.ts` passes → AC-8
- [ ] Reset deep link: on the device, the reset email link starts with `cocktailist://auth/callback` → AC-8

## Known gaps
- The learn article description still falls back to the site description; it comes from spec 0033's `summary` column, which isn't built yet (AC-3).
- The share card is served at `/[locale]/opengraph-image/card`, not `/[locale]/opengraph-image`, because a translated `alt` needs `generateImageMetadata` in this Next version.

## Acceptance criteria coverage
- AC-1: brand guard test, footer and header checks · AC-2: title value sourcing checks, `route-metadata.test.ts` · AC-3: description checks (learn article pending spec 0033) · AC-4: private description check · AC-5: card curl, OG checks · AC-6: manifest curl, Chrome installability · AC-7: `pnpm icons` twice, icon test · AC-8: mobile identity and reset link steps, app.json test · AC-9: first visit, reload, CPU throttle steps · AC-10: yes step · AC-11: no steps on web and mobile · AC-12: exempt route steps · AC-13: mobile launch and deep link steps · AC-14: footer and Account steps · AC-15: consent banner and PostHog steps · AC-16: storage blocked step · AC-17: focus, Tab, back button, themes, translations
