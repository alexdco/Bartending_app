# 0060. Store screenshots captured by Maestro and framed by Satori

**Date**: 2026-11-17
**Status**: Proposed

## Summary

Cocktailist needs store screenshots before its first App Store and Google Play submission. This spec covers six captioned images per listing locale (en, es, pt, fr, ja, zh), sized for the iPhone 6.9 inch slot and for Play phones, plus Play's required 1024 by 500 feature graphic. A Maestro flow (a YAML script that taps through the app) captures the real app on an iOS simulator and an Android emulator, signed into a demo account, in each language. A small Satori script (it turns a layout into an image, the same engine as the web's social card) puts each capture on the brand background under a translated headline. You review the result and upload it by hand. The preview video is deferred.

## Requirements

**User stories**:

- As someone browsing the App Store or Google Play in my language, I want screenshots that show the real app in my language with a short headline, so I can see what it does before installing.
- As the maintainer, I want one command per step (capture, render) that rebuilds the whole set after a UI change, so refreshing 72 captures is not a day of manual work.
- As the maintainer, I want the render to refuse an incomplete or broken set, so I never upload a missing shot or a headline with missing glyphs (tofu, empty boxes where a font lacks a character).

**Acceptance criteria**:

- **AC-1**: Each of the six `StoreListing` locale modules (spec 0057) carries a `screenshots` block with exactly six `captions` in shot order and one `featureGraphicLine`. The listing test enforces the count and the length limits in `STORE_LIMITS` (captions at most 40 code points, or 18 for `ja` and `zh`; the feature graphic line at most 48, or 20 for `ja` and `zh`), and applies 0057's no emoji, no numbers, and banned word checks to every caption and line.
- **AC-2**: The `es`, `pt`, `fr`, `ja`, and `zh` captions and feature graphic lines are native rewrites that use the terms in `apps/web/messages/<locale>.json`, and a second model pass reviews `ja` and `zh` before upload, every finding resolved or recorded as declined (0057's AC-6 rule, checked by review).
- **AC-3**: `apps/mobile/store/demo-seed.sql` is idempotent. Given the two demo users (one for iOS captures, one for Android) already created in Auth, it replaces each user's `pantry_items` and `favorites` with the same pinned ingredient and recipe ids, clears their shopping list, and deletes their `ai_generation_quota` rows so a failed run never blocks a rerun the same day. It raises an exception, changing nothing, if either email is missing from `auth.users`. Running it twice leaves the same rows.
- **AC-4**: The `screenshots` EAS build profile (not extending `development`) sets `environment: production`, `channel: screenshots`, `distribution: internal`, `ios.simulator: true`, and `android.buildType: apk`, producing release builds (no dev client) against production data. No update is ever published to the `screenshots` channel, so the build always runs its embedded bundle. With `EXPO_PUBLIC_DISABLE_ANALYTICS=true`, `initAnalytics` returns before creating a PostHog client, so a capture run sends no analytics events.
- **AC-5**: `apps/mobile/.maestro/screenshots/capture-all.yaml` runs `capture-locale.yaml` once per listing locale. Each run follows a pinned order: `launchApp` with `clearState: true` and `permissions: { all: allow }` (so no permission dialog appears), confirm the age gate, open `cocktailist://account`, wait for the guest sign in form, sign in with `MAESTRO_DEMO_EMAIL` and `MAESTRO_DEMO_PASSWORD`, wait until the sign in button is gone (signed in), pick the locale last in the language card (which also writes it to the demo profile), wait for a translated label, then navigate. It saves six captures named `NN-<slug>.png` (shot list below) to `apps/mobile/store/.captures/<platform>/<locale>/` (paths relative to the repo root, where both Maestro locally and the EAS job run). Every tap targets a `testID`, never visible text. Before capturing shot 03, the flow asserts that the recipe title matches the locale's pinned `RECIPE_TITLE`, so a missing translation fails the run instead of showing English. If an expected element is missing, the flow fails with a non zero exit code rather than saving a wrong screen.
- **AC-6**: The AI shot presses generate on the drink ideas screen and waits up to 60 seconds for the generated card. It retries once on failure or timeout, but a run shares a budget of four retries across all locales (a counter in Maestro's `output` object), so one account never spends more than 10 generations (its daily limit) in a run. When the retry fails or the budget is spent, the locale's flow fails with a message naming the locale.
- **AC-7**: `.eas/workflows/store-screenshots.yml` runs only on a manual trigger. It builds both platforms with the `screenshots` profile and runs `capture-all.yaml` on an iOS 6.9 inch class simulator and a Pixel class emulator, each with its own demo account. Before the flow it sets dark appearance and a clean status bar (9:41, full battery and signal, no notifications). Each capture job sets `MAESTRO_PLATFORM` and maps that platform's demo credentials in its `env`. After the flow it uploads `apps/mobile/store/.captures/<platform>/**/*` as one `type: other` artifact per platform, even when a locale failed.
- **AC-8**: `pnpm --filter mobile store:screenshots` reads `store/.captures/` and the listing modules and writes `store/.generated/screenshots/app-store/<appStore.locale>/NN.png` at 1320×2868 from iOS captures, `play/<play.locale>/NN.png` at 1080×1920 from Android captures, and `play/<play.locale>/feature-graphic.png` at 1024×500. Every file is an opaque sRGB PNG with no alpha channel.
- **AC-9**: Before writing anything, the renderer checks every input. A missing capture, a count other than six per locale and platform, an iOS capture that is not exactly 1320×2868 (a Pro Max simulator, so nothing is upscaled), an Android capture narrower than 1080 px, or a capture whose width to height ratio falls outside 0.42 to 0.60 makes it exit 1 with every problem listed, and it writes no files.
- **AC-10**: The renderer loads every font from pinned files in `node_modules` (Fraunces for Latin captions, and for `ja` and `zh` the display font the web maps to that locale), never from the system. For `ja` and `zh`, every unicode range subset file of the chosen weight is loaded, and the glyph check runs against all of them. A character no loaded font covers makes it exit 1 and name the locale and caption. On the same machine with the pinned package versions, rendering the same inputs twice gives byte identical PNGs. Output across operating systems is not promised to match byte for byte.
- **AC-11**: Each frame puts the caption at the top in the display font, in `text` color on the icon tile's charcoal gradient (spec 0057), and the capture inside a generic rounded phone outline below it, with no Apple or Google hardware art. The feature graphic shows `brand-mark.png`, `Cocktailist` (`BRAND_NAME`), and the locale's `featureGraphicLine` on the same gradient.
- **AC-12**: No capture shows personal data. The demo account's email and display name never appear. The recipe detail shot shows nothing from comments, user photos, or ratings by name. The featured recipe is a well known classic with a self hosted image, a translation in all six locales, a batch panel (its ingredients are batchable), and no user content above the fold; its id is pinned in `capture-all.yaml`. Checked at review.
- **AC-13**: Before upload, all 72 framed screenshots and 6 feature graphics are reviewed. Each locale's AI idea is skimmed in that language for a sensible name and steps (spec 0059's rules). The images are uploaded by hand, after which App Store Connect shows six 6.9 inch screenshots and Play Console shows six phone screenshots and a feature graphic for each of the six listing locales.

## Decision

**Chosen option**: Option 1: Maestro captures on EAS Workflows, Satori framing, manual upload.

Real app captures come from one Maestro flow run per locale on EAS (iOS simulator and Android emulator, with Android also run locally while writing the flow). A Satori and resvg script frames them under captions held in the 0057 listing modules, and the finished folders are uploaded by hand.

**Implementation skills**: `eas-workflows` (`expo/skills`, `.agents/skills/eas-workflows/`) · `react-native-best-practices` (`callstackincubator/agent-skills`, `.agents/skills/react-native-best-practices/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`) · `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

### Prerequisites (gate the capture slices)

- **Mobile hardcoded strings sweep** (new feature, enrolled with this spec). The drink ideas, pantry, search, recipe detail, batch panel, and learn screens still render about 40 English literals ("You can make now", "Find a recipe", "Batch this recipe", "Learn"). Localized captures are blocked until they go through `t()` in all nine app locales. The sweep's done when must cover every string visible in the six shots, including the generate button, empty and loading states, and section headings. Slices 1 and 2 below run in English and do not wait for it. Slice 3 does.
- **0057 copy thread**: `apps/mobile/store/listing/` (the `StoreListing` type, `STORE_LIMITS`, the six modules, the listing test) must exist before slice 1 adds the `screenshots` block.

### Shot list (order is the store order)

| # | Slug | Screen and state | Route or action |
|---|---|---|---|
| 01 | `make-now` | Drink ideas, top of screen: header and the "You can make now" grid from the demo pantry | deep link `cocktailist://drink-ideas` |
| 02 | `ai-idea` | Drink ideas with the generated idea card in view (name, steps, garnish line) | `scrollUntilVisible` on `drink-ideas-generate`, tap it, wait for `generated-recipe-card`, `scrollUntilVisible` on the card |
| 03 | `recipe` | Featured recipe detail, top of screen with image | deep link `cocktailist://recipe/${FEATURED_RECIPE_ID}` |
| 04 | `search` | Search results for the locale's `SEARCH_QUERY` | deep link `cocktailist://search`, type into `search-input` |
| 05 | `batch` | Featured recipe scrolled to the batch panel, servings set to 8 (the field starts empty) | `scrollUntilVisible` on `batch-panel`, tap `batch-servings`, `inputText: "8"`, hide keyboard |
| 06 | `learn` | Learn index | deep link `cocktailist://learn` |

Apple shows the first three in search results, so they carry the 0057 pitch: what you can make, AI ideas, real recipes.

### Listing module extension (data model sketch, no database change)

Added to `StoreListing` in `apps/mobile/store/listing/types.ts`, all `readonly` and required:

| Field | Type | Limit (Latin / `ja`, `zh`) | Notes |
|---|---|---|---|
| `screenshots.captions` | `readonly [string, string, string, string, string, string]` | 40 / 18 each | One per shot, in shot order |
| `screenshots.featureGraphicLine` | `string` | 48 / 20 | Under `Cocktailist` on the Play feature graphic |

`STORE_LIMITS` gains `screenshotCaption` and `featureGraphicLine` as `{ latin, cjk }` pairs. The script choice is by module `locale` (`ja`, `zh` are CJK). Counts are code points, as in 0057.

### Demo data (seed)

`apps/mobile/store/demo-seed.sql`, run by you in the SQL editor:

| Target | Rows |
|---|---|
| `pantry_items` for each demo user | the pinned ingredient id list, chosen at build time so "You can make now" shows at least four recipes with images (the featured recipe among them) and the pantry meets `MIN_PANTRY_INGREDIENTS_FOR_GENERATION`, so the generate button shows |
| `ai_generation_quota` for each demo user | none (deleted, resets the daily count) |
| `favorites` for each demo user | the featured recipe plus two other pinned recipe ids |
| `shopping_list_items` for each demo user | none (deleted) |

The demo emails are literals at the top of the file (`screenshots-ios@bartendingapp.dev`, `screenshots-android@bartendingapp.dev`). It resolves `user_id` from `auth.users` by email, raises if either is missing, then deletes and inserts inside one transaction. The users are ordinary email and password accounts, not admins. You create them in the Auth dashboard with email confirmed.

### Interface surface (scripts, flows, workflow; no API)

| Piece | Inputs | Outputs | Key errors |
|---|---|---|---|
| `apps/mobile/.maestro/screenshots/capture-all.yaml` | `MAESTRO_DEMO_EMAIL`, `MAESTRO_DEMO_PASSWORD`, `MAESTRO_PLATFORM` (`ios` or `android`) from the shell or the EAS job `env`; `FEATURED_RECIPE_ID`, and per locale `SEARCH_QUERY` and `RECIPE_TITLE`, pinned in the file | `runFlow: capture-locale.yaml` six times with `env: { LOCALE, SEARCH_QUERY, RECIPE_TITLE }`; initializes the shared retry budget (4) | any `runFlow` failure fails the run |
| `capture-locale.yaml` | the env above | six `takeScreenshot` files at `apps/mobile/store/.captures/${MAESTRO_PLATFORM}/${LOCALE}/NN-<slug>` (repo root relative) | missing `testID`, wrong recipe title, generate timeout after its retry or an empty budget (AC-6) |
| `pnpm --filter mobile store:capture:android` | a running local emulator; `.env.screenshots.local` (gitignored) with the Android demo credentials | from the repo root: sets dark mode (`adb shell cmd uimode night yes`, asserted again at the start of every run because emulators can reset it) and the Android demo mode status bar, runs `maestro test apps/mobile/.maestro/screenshots/capture-all.yaml`, then turns demo mode off | no device: exit 1 |
| `.eas/workflows/store-screenshots.yml` | manual trigger; EAS env vars below | jobs `build_ios` and `build_android` (`type: build`, profile `screenshots`), then `capture_ios` and `capture_android` (`type: maestro`, `device_identifier` an iPhone Pro Max class model for iOS and a Pixel for Android, Android on a `linux-*-nested-virtualization` runner). The `before_maestro_tests` hook sets appearance and status bar (`xcrun simctl ui booted appearance dark` and `xcrun simctl status_bar booted override`, or the adb equivalents). The `after_maestro_tests` hook runs `eas/upload_artifact` with `if: always()`, `type: other`, name `captures-<platform>` | Maestro on EAS is alpha. If artifacts are not retrievable or the device list lacks a Pro Max, stop and route back here (fallback in rationale) |
| `pnpm --filter mobile store:screenshots` (`tsx scripts/store-screenshots.tsx`) | `store/.captures/` (you unzip the two artifacts there), the listing modules, `assets/brand` PNGs | `store/.generated/screenshots/` per AC-8 | AC-9 validation, AC-10 glyph check: exit 1, nothing written |

`store/.captures/` and `store/.generated/` are gitignored.

**Renderer structure** (functional core, I/O at the edge): `validateCaptures(listing, files) → readonly Problem[]` (pure), `frameElement({ caption, capture, canvas, fontFamily }) → SatoriNode` (pure), `featureGraphicElement(...)` (pure), and a thin `main` that reads files, calls `satori` (fonts passed as buffers, `loadAdditionalAsset` throws on any missing glyph), rasterizes with `@resvg/resvg-js`, flattens with `sharp` (`.flatten({ background }).removeAlpha()`), and writes. Canvases: App Store 1320×2868, Play 1080×1920, feature graphic 1024×500.

**Frame layout** (one `FRAME_LAYOUT` constants block per canvas in the script, tuned once at the first render review): side margin, caption box height, caption font size and line height (at most two lines), phone outline corner radius and border width, and the gap between caption and phone. The capture scales to fit the phone's inner width and keeps its aspect ratio. The phone sits below the caption and may run off the bottom edge, so a tall 1080×2400 Pixel capture fits the 1080×1920 Play canvas without letterboxing.

**Fonts**: `@fontsource/fraunces` plus the `@fontsource` packages for the `ja` and `zh` display fonts named in the web's `DISPLAY_FONT_BY_LOCALE`, loaded as `.woff` (Satori does not read woff2). For CJK, `@fontsource` splits each weight into many unicode range subset files. The script loads every subset file for the one caption weight. Pinned versions, devDependencies of `apps/mobile`.

**testIDs added** (only what the flow touches). The shared `Button` (`src/components/button`) gains a passthrough `testID` prop first.

| testID | Where |
|---|---|
| `age-gate-confirm` | the confirm `Button` in `src/age-gate/age-gate-overlay.tsx` |
| `account-email`, `account-password`, `account-sign-in` | `GuestAuthForm` on the account screen (sign in mode, the default) |
| `language-option-<locale>` | each option inside the language card's `.map` in `src/app/account.tsx` (all nine locales are launched, so each is selectable in a release build) |
| `drink-ideas-generate` | the generate `Button` in `src/app/drink-ideas.tsx` (shown only when the pantry meets the minimum) |
| `generated-recipe-card` | the root view of `src/drink-ideas/generated-recipe-card.tsx` |
| `search-input` | the search field in `src/app/search.tsx` |
| `batch-panel`, `batch-servings` | the `Card` root and the servings input in `src/recipes/batch-panel.tsx` |

### Value sourcing

| Action | Value | Source |
|---|---|---|
| Capture | Which account signs in | `MAESTRO_DEMO_EMAIL`/`PASSWORD`: EAS secrets `SCREENSHOT_IOS_EMAIL`/`PASSWORD` or `SCREENSHOT_ANDROID_EMAIL`/`PASSWORD` mapped per job; locally `.env.screenshots.local` |
| Capture | App language | `LOCALE` env, chosen through `language-option-<locale>` (an in app choice, independent of device locale) |
| Capture | Pantry, favorites | The seed's pinned id lists (AC-3) |
| Capture | Featured recipe | `FEATURED_RECIPE_ID` pinned in `capture-all.yaml`, chosen by the AC-12 rule at build time and approved at the first review |
| Capture | Search query | Per locale `SEARCH_QUERY` in `capture-all.yaml`: the locale's everyday word for gin, so results are many and photo rich |
| Capture | Batch servings | Literal `8` in `capture-locale.yaml` |
| Capture | AI idea text | Live from `generate-drink-idea` on the demo account (6 to 10 of the 10 daily ideas per account per run; the seed resets the count) |
| Capture | Expected recipe title | Per locale `RECIPE_TITLE` in `capture-all.yaml`, copied from that locale's recipe translation when the featured recipe is pinned |
| Capture | Theme, status bar | Workflow hooks (EAS) or `store:capture:android` (local) |
| Capture | Output folder | `MAESTRO_PLATFORM` and `LOCALE` |
| Render | Caption text | `screenshots.captions[n]` of the locale module |
| Render | Feature graphic line | `screenshots.featureGraphicLine` |
| Render | Brand name | `BRAND_NAME` from `packages/shared/src/brand.ts` |
| Render | Store folder name | `appStore.locale` and `play.locale` of the module (0057) |
| Render | Background gradient, text color | The icon tile stops (`#262626` to `#121212`) and the dark `text` token from `packages/shared/src/tokens.ts` |
| Render | Font per locale | Fraunces for Latin; `DISPLAY_FONT_BY_LOCALE[locale]` for `ja` and `zh` |
| Render | Canvas sizes | This spec: 1320×2868, 1080×1920, 1024×500 |
| Build | Analytics off | `EXPO_PUBLIC_DISABLE_ANALYTICS=true` in the `screenshots` profile `env`, inlined at bundle time. Slice 1 confirms the profile `env` value wins over EAS environment variables (a build log check that no PostHog client starts) |
| Render | Frame geometry | `FRAME_LAYOUT` constants in the script |

### Key invariants

- Captures are never edited by hand. Fix the app, seed, or flow and capture again.
- The renderer writes either the complete set or nothing.
- Every image any store receives comes from the real app build in that locale. No mockups, and no Android capture inside an App Store frame.
- Captions follow 0057's copy rules: no numbers, no emoji, no ranking words, no feature the shot does not show.
- Demo account credentials live only in EAS secrets and a gitignored local file.

### Security model

No new access rules. The demo users are normal users under existing RLS, with no admin role. The seed runs once as you in the SQL editor, the same path as other live writes. Credentials are EAS environment variables with `secret` visibility, exposed only to the two Maestro jobs as `MAESTRO_*` vars. Analytics is off in the capture build, so demo runs never reach PostHog. No personal data appears in any image (AC-12).

### Configuration required

- `EXPO_PUBLIC_DISABLE_ANALYTICS`: set to `true` only in the `screenshots` EAS profile. `initAnalytics` returns early when it is set.
- `SCREENSHOT_IOS_EMAIL`, `SCREENSHOT_IOS_PASSWORD`, `SCREENSHOT_ANDROID_EMAIL`, `SCREENSHOT_ANDROID_PASSWORD`: EAS environment variables (secret), mapped to `MAESTRO_DEMO_EMAIL` and `MAESTRO_DEMO_PASSWORD` per job.
- `apps/mobile/.env.screenshots.local` (gitignored): the Android pair for local runs.
- Prerequisites you run yourself: create the two demo users in the Auth dashboard; run the seed in the SQL editor; install the Maestro CLI and an Android emulator locally.

### Critical test scenarios

- Listing test: a seventh caption, a 41 code point English caption, a 19 code point `ja` caption, a caption with a digit, and a caption with an emoji each fail, verifies **AC-1**
- Renderer unit: `validateCaptures` reports a missing file, a five shot locale, a 900 px wide capture, and a landscape capture all in one result, verifies **AC-9**
- Renderer unit: a fixture capture renders to the exact canvas size with no alpha channel. Rendering it twice gives the same hash, verifies **AC-8**, **AC-10**
- Renderer unit: a caption containing a character none of the loaded fonts cover makes the render throw, naming the locale, verifies **AC-10**
- Analytics unit: with `EXPO_PUBLIC_DISABLE_ANALYTICS=true`, `initAnalytics` creates no client, verifies **AC-4**
- Seed: run twice in the SQL editor, then select rows (same counts and ids, no `ai_generation_quota` rows for the demo users). Run with one email changed: an exception and no change, verifies **AC-3**
- Retry budget: with generation forced to fail (for example, the demo pantry emptied below the minimum on a local run), the run stops once four retries are spent across all locales, verifies **AC-6**
- Wrong language: with `RECIPE_TITLE` for one locale set to the English name, that locale's flow fails at shot 03, verifies **AC-5**
- Flow failure: rename one `testID` locally, and the Android run fails at that step with no capture written for that shot, verifies **AC-5**
- End to end: the EAS workflow run yields two artifacts with 36 captures each; the render writes 78 files, verifies **AC-6**, **AC-7**, **AC-8**
- Review: the pre upload checklist (slice 4) for AC-2, AC-11, AC-12, AC-13

## Build plan

Tracer Bullet: prove capture → EAS → artifact → render with one English shot on both platforms before widening. The shaky segment (Maestro on EAS is alpha) gets tested first.

1. Thin thread, one English shot on both platforms: add the `screenshots` block to `StoreListing` and `STORE_LIMITS` with the English captions and its test cases; add `EXPO_PUBLIC_DISABLE_ANALYTICS` with its test; add the `screenshots` EAS profile; add the age gate, sign in, and language `testID`s; write the seed and create the two demo users; write `capture-all.yaml` and `capture-locale.yaml` for `en` shot 01 only and prove it locally through `store:capture:android`; write `store-screenshots.yml` and prove both artifacts download; write the renderer for one shot on both canvases. Satisfies **AC-1**, **AC-3**, **AC-4**, **AC-5**, **AC-7**, **AC-8**
2. All six shots in English: the remaining `testID`s and deep links; the AI shot with its retry; batch, search, and learn shots; pick and pin the featured recipe and the English search query; the renderer's validation, frame art, and determinism test. Satisfies **AC-5**, **AC-6**, **AC-9**, **AC-10**, **AC-11**, **AC-12**
3. Six locales (after the mobile hardcoded strings sweep is done): native caption and feature graphic line rewrites for `es`, `pt`, `fr`, `ja`, `zh` and the second model pass on `ja` and `zh`; per locale search queries; the locale loop; the feature graphic; the CJK fonts and missing glyph check. Satisfies **AC-1**, **AC-2**, **AC-5**, **AC-8**, **AC-10**, **AC-11**
4. Live set: one full EAS run, render, the review checklist (every image, AI idea skims per language), manual upload to both consoles, and a check that each listing shows the set. Satisfies **AC-12**, **AC-13**

## Consequences

**Positive**:

- One workflow run plus one render command rebuilds every store image after a UI change.
- The listings show the real iOS and Android apps in each language, matching what installers get.
- The Play feature graphic, which blocks publishing, is covered.
- The `testID`s and flows are a first step toward mobile end to end tests.

**Negative / tradeoffs**:

- Maestro on EAS is alpha. Device names and artifact behavior may change under you, and each run costs EAS build and macOS minutes.
- Two Maestro files, a seed, two demo accounts, and four secrets are new things to maintain.
- AI shots vary run to run. A weak idea means rerunning that locale, limited by the 10 per day quota.
- Upload stays manual: about 24 folder drags per full refresh.
- Localized capture waits on the strings sweep feature.

**Neutral**:

- New devDependencies in `apps/mobile`: `satori`, `@resvg/resvg-js`, `@fontsource` font packages. `sharp` already exists at the root.
- New local tooling: the Maestro CLI and an Android emulator.
- `ko`, `hi`, and `ru` store visitors see the English screenshots with the English listing (0057's fallback).

## Follow-up

- [ ] Preview video: an App Store preview (15 to 30 seconds) and a Play promo video, likely reusing these flows with `record_screen`, once launch data shows it is worth it.
- [ ] Maestro MCP server: after installing the Maestro CLI, consider `claude mcp add maestro -- maestro mcp` so the agent can drive the emulator while writing flows (bundled with the CLI, not yet checked against its docs).
- [ ] `eas-workflows` (`expo/skills`) was installed for this spec. It belongs in root `AGENTS.md` `## Agent skills` (via `/sync`).
- [ ] Mobile hardcoded strings sweep: enrolled as its own feature. Gates build slice 3.
- [ ] If EAS Maestro artifacts or a Pro Max simulator turn out unavailable, the fallback is Maestro Cloud for iOS (see rationale). Route that change back through `/architect`.
- [ ] Revisit fastlane or the App Store Connect API for upload if refreshes become frequent.
