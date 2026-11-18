# 0057. Store listing copy and a designed, layered app icon

**Date**: 2026-11-15
**Status**: Proposed

## Summary

Cocktailist gets real store listings and a real icon before its first store release. The listing copy (title, subtitle, keywords, promotional text, description, release notes) lives in the repo as one typed file per locale for six locales, a test keeps every field inside each store's length limit, and a script turns it into the file EAS uses to push the App Store listing (Google Play copy is pasted by hand, since EAS Metadata only covers Apple). The icon is drawn here as a layered SVG of the existing green coupe glass, now with a liquid band and a lime wheel on a soft charcoal gradient, and `pnpm icons` renders every size from it, including the iOS Icon Composer `.icon` bundle, so no Mac is needed. The pitch everywhere leads with what makes the app different: make drinks from what you already have.

## Requirements

**User stories**:
- As someone browsing the App Store or Google Play in my language, I want a listing that tells me plainly what the app does, so I can decide to install it.
- As someone searching the stores for cocktail recipes in my language, I want Cocktailist to show up for the words I actually type.
- As someone with the app installed, I want a crisp, recognizable icon that looks right in iOS light, dark, and tinted modes and as an Android themed icon.
- As the maintainer, I want listing copy and the icon to live in the repo with checks, so one edit plus one command updates them and nothing silently goes over a store limit.

**Acceptance criteria**:
- **AC-1**: Six locale modules exist under `apps/mobile/store/listing/` (`en`, `es`, `pt`, `fr`, `ja`, `zh`), each exporting a `StoreListing` with every App Store and Play field filled. Every field is within its limit: App Store name, Play title, and subtitle at most 30 characters; App Store keywords at most 100 characters once joined with commas; promotional text at most 170; Play short description at most 80; App Store description and Play full description at most 4000; release notes at most 500. A vitest test fails if any field is empty or over its limit, or if the locale set is not exactly these six.
- **AC-2**: Every App Store name and Play title starts with `Cocktailist` (untranslated, matching `BRAND_NAME`), followed by a localized keyword phrase. Each locale's subtitle and Play short description lead with making drinks from what you already have.
- **AC-3**: In each locale, keywords repeat no word already in that locale's App Store name or subtitle, contain no duplicates, and join with commas and no spaces. For Latin script locales, words are compared after the normalizer (NFKD with accents stripped, lowercased, split on any non letter, so French apostrophes split too); for `ja` and `zh`, no keyword is a substring of the name or subtitle. Naming no other app or trademark is checked by review, not by the test.
- **AC-4**: Every App Store description and Play full description ends with that locale's age line (for example "For adults of legal drinking age. Please drink responsibly."). The copy may call the app free (it is free with no purchases and no ads at launch). The copy states no numbers (no recipe counts), contains no emoji, and contains no word from the locale's banned ranking list (`best`, `#1`, `top`, `number one`, and each locale's equivalents, kept in `apps/mobile/store/listing/banned.ts`); the test enforces all three.
- **AC-5**: `pnpm --filter mobile store:metadata` writes `apps/mobile/store/.generated/store.config.json` (the EAS Metadata file) for the six App Store locales, with support and privacy URLs built from `NEXT_PUBLIC_SITE_URL` and each module's `locale` as the web path segment, plus `apple.categories` (`FOOD_AND_DRINK` primary, `LIFESTYLE` secondary), and writes paste ready Play copy beside it. It leaves `releaseNotes` out unless run with `--with-release-notes`. When `NEXT_PUBLIC_SITE_URL` fails the URL guard (unset, not `https`, `localhost`, an IP address, a `*.vercel.app` host, or any host containing `example`), it exits non zero and writes nothing. `pnpm --filter mobile store:push` runs the generator and then `eas metadata:push`, so a push never reads a missing or stale file.
- **AC-6**: The `es`, `pt`, `fr`, `ja`, and `zh` copy is a native rewrite, not a literal translation: feature names match the terms in `apps/web/messages/<locale>.json`, and keywords are terms people in that market search. A second model pass reviews `ja` and `zh`, and every finding is resolved or recorded as declined before the first push. This criterion is checked by review, not by the test.
- **AC-7**: `assets/brand/mark.svg` holds the detailed coupe as four groups marked `<g id="glass">`, `<g id="liquid">`, `<g id="rim">`, `<g id="garnish">`, all inside the 4 to 20 box of the 24 unit viewBox, and `assets/brand/mark-small.svg` holds the simplified silhouette. `pnpm icons` renders the large outputs from `mark.svg` on the charcoal gradient tile, and the small ones (favicons, the web `icon.svg`, the Android monochrome icon) from `mark-small.svg`. The glass color reaches at least 3:1 contrast against both gradient stops, and a test computes it. The web header logo draws the same path `d` strings as `mark-small.svg`, and a test compares them.
- **AC-8**: `pnpm icons` writes the Icon Composer bundle `apps/mobile/assets/app.icon/` (an `icon.json` plus one SVG per group, with the gradient as its background fill), `app.json` sets `ios.icon` to it, and the EAS preview and production profiles set `"ios": { "image": "latest" }` so the build runs Xcode 26 or later. An EAS iOS build installed on a device shows the layered icon in the default, dark, and tinted home screen modes.
- **AC-9**: An EAS Android build shows the new adaptive icon with the glass inside the safe zone on the gradient background, and a white silhouette themed icon when themed icons are on.
- **AC-10**: The privacy page contact card carries `id="contact"` in every locale, so the support URL `/<locale>/privacy#contact` lands on it.

## Decision

**Chosen option**: Option 1 for the copy (typed repo source, a length test, EAS Metadata for the App Store, Play pasted by hand) and Option 1 for the icon (a layered SVG drawn here, with the `.icon` bundle generated by `pnpm icons`).

Listing copy is a typed TypeScript module per locale that generates the EAS Metadata file, and the icon is one layered `mark.svg` (plus a simple `mark-small.svg`) that `pnpm icons` turns into every PNG and the iOS `.icon` bundle.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

### Listing copy

**Data model sketch** (no database; the shape each locale module exports, all fields `readonly` and required):

| Field | Type | Limit | Notes |
|---|---|---|---|
| `locale` | `"en" \| "es" \| "pt" \| "fr" \| "ja" \| "zh"` | | Our app locale code, also the web URL segment |
| `ageLine` | `string` | | The closing line both descriptions end with |
| `releaseNotes` | `string` | 500 | Shared by both stores (Play's release notes cap is 500) |
| `appStore.locale` | `"en-US" \| "es-MX" \| "pt-BR" \| "fr-FR" \| "ja" \| "zh-Hans"` | | App Store Connect locale |
| `appStore.name` | `string` | 30 | `Cocktailist: <keyword phrase>` |
| `appStore.subtitle` | `string` | 30 | Pantry first pitch |
| `appStore.keywords` | `readonly string[]` | 100 joined | Joined with `,` |
| `appStore.promotionalText` | `string` | 170 | Editable without a new build |
| `appStore.description` | `string` | 4000 | Ends with `ageLine` |
| `play.locale` | `"en-US" \| "es-419" \| "pt-BR" \| "fr-FR" \| "ja-JP" \| "zh-CN"` | | Play Console locale |
| `play.title` | `string` | 30 | Same as `appStore.name` unless Play needs it shorter |
| `play.shortDescription` | `string` | 80 | Pantry first pitch |
| `play.fullDescription` | `string` | 4000 | Ends with `ageLine`; key terms used naturally (Play has no keyword field and penalizes stuffing) |

The type lives in `apps/mobile/store/listing/types.ts`; `apps/mobile/store/listing/index.ts` exports the six as one readonly array. Limits live in one `STORE_LIMITS` constant used by both the test and the generator. Length counts are Unicode code points (`[...text].length`), one per character for CJK too, which matches how both consoles count for the scripts used here; emoji are banned so they never skew a count. The keyword limit counts the joined string, commas included. The module `locale` doubles as the web path segment (the web router uses `en`, `es`, `pt`, `fr`, `ja`, `zh`). The App Store primary language is `en-US`; `es-MX` (App Store) and `es-419` (Play) are deliberately different codes for the same Latin American text.

**Interface surface** (scripts, no API):

| Command | Inputs | Outputs | Key errors |
|---|---|---|---|
| `pnpm --filter mobile store:metadata` (`tsx scripts/store-metadata.ts [--with-release-notes]`) | the six modules; `NEXT_PUBLIC_SITE_URL` env | `store/.generated/store.config.json` (EAS Metadata `configVersion: 0`; `apple.categories: ["FOOD_AND_DRINK", "LIFESTYLE"]`; `apple.info.<locale>` with `title`, `subtitle`, `keywords` as an array, `promoText`, `description`, `releaseNotes` only with the flag, `supportUrl`, `privacyPolicyUrl`, `marketingUrl`); `store/.generated/play.md` (per locale: title, short, full, and release notes wrapped in Play's `<en-US>…</en-US>` style tags, ready to paste) | URL fails the guard: exit 1, no files; any field over its limit: exit 1 (same check as the test) |
| `pnpm --filter mobile store:push` | as above | runs `store:metadata`, then `eas metadata:push` | Needs the app record to exist in App Store Connect first |
| `eas metadata:push` (called by `store:push`) | `submit.production.ios.metadataPath` in `eas.json` set to `./store/.generated/store.config.json` | App Store Connect listing updated | Run directly on a fresh clone, it fails on the missing file; use `store:push` |

**URL guard**: parse with `new URL()`; require protocol `https:`; lowercase the host; reject `localhost`, any IPv4 or IPv6 literal, any host ending in `.vercel.app`, and any host containing `example`; drop a trailing slash from the origin. Unit tested with each rejected case.

**Left to the consoles** (not generated): copyright, the age rating questionnaire (spec 0037's launch checklist), App Review contact details, and the Play contact email.

**Generated test fixture**: a vitest test runs the generator's pure builder against a fixed site URL and checks the output keys against a checked in sample of the EAS Metadata shape, so a schema mistake fails locally, not at push time.
| `pnpm icons` (existing, extended) | `assets/brand/mark.svg`, `assets/brand/mark-small.svg` | every PNG and ICO as today, plus `apps/mobile/assets/app.icon/` | A missing named group in `mark.svg`: exit 1 |

`store/.generated/` is gitignored: its URLs come from the environment, and the modules are the source.

**Value sourcing**:

| Action | Value | Source |
|---|---|---|
| Listing | Brand in name and title | `BRAND_NAME` from `packages/shared/src/brand.ts` (the test asserts the prefix) |
| Listing | Keyword phrase, subtitle, keywords, descriptions, promo text | Written in each locale module per the copy rules below |
| Listing | Feature names in copy (pantry, drink ideas, Bartender Mode, Learn, batch calculator, and so on) | That locale's `apps/web/messages/<locale>.json` terms, used as the glossary |
| Listing | "Free" claim | This spec: free, no in app purchases, no ads at launch (your answer) |
| Listing | Any recipe count | None: the copy states no numbers (AC-4) |
| `store:metadata` | Store categories | This spec: Food & Drink primary, Lifestyle secondary |
| `store:metadata` | Whether release notes are sent | The `--with-release-notes` flag (`app.json` `version` is not the store version, because `appVersionSource` is `remote`) |
| Listing | Age line | Each module's `ageLine`, worded to match the in app age gate's tone |
| `store:metadata` | Privacy policy URL | `${NEXT_PUBLIC_SITE_URL}/${locale}/privacy` |
| `store:metadata` | Support URL | `${NEXT_PUBLIC_SITE_URL}/${locale}/privacy#contact` (AC-10's anchor) |
| `store:metadata` | Marketing URL | `${NEXT_PUBLIC_SITE_URL}/${locale}` |
| Play Console (manual) | Contact email | `CONTACT_EMAIL` used by the privacy page (the real address is still owed from feature 36) |
| Korean, Hindi, Russian store visitors | Listing language | The primary (English, `en-US`) listing, by store fallback |

**Copy rules** (the build writes to these; the test checks what is checkable):
- Positioning: lead with "make drinks from what you already have": tell it your bar, see what you can make, get AI drink ideas for the rest. Then the catalog and search, favorites and shopping list, Learn and quizzes, and the batch calculator and Bartender Mode for people who host or work behind a bar. Sign in is optional; guests get the whole app.
- Title: `Cocktailist: ` plus the strongest search phrase in that market (the English draft is `Cocktailist: Cocktail Recipes`), at most 30 characters.
- Keywords: singular forms (Apple matches plurals), no words from the name or subtitle, no "app" or "free", no category names, no other apps' names. For `ja` and `zh` use terms people actually type (for example カクテル, レシピ, 鸡尾酒, 调酒) and leave out ones already in the title.
- AI wording: "AI drink ideas from your pantry". No claims about accuracy or "personal bartender" promises.
- The release notes are a short first release welcome. App Store Connect has no What's New on the first version, so the generator leaves `releaseNotes` out by default; pass `--with-release-notes` from the second App Store version on. Play uses the text on the first release, pasted from `play.md`.
- No numbers, no emoji, no banned ranking words (AC-4).

### App icon

**Art** (24 unit viewBox kept, glass spanning 4 to 20 so `generate-icons.mjs` framing still works):

| Group in `mark.svg` (bottom to top) | Content | Color |
|---|---|---|
| `glass` | The refined coupe bowl, stem, and foot | `#2B8F4B` (a lighter tint of the brand green: about 3.7:1 on `#262626`, 4.6:1 on `#121212`; the darker `#1E763B` is only about 2.8:1 on the gradient top) |
| `liquid` | A band filling the lower bowl, following its curve | `#4CB86E` |
| `rim` | The rim line across the bowl top, drawn over the glass | `#121212` (dark `bg`), as today |
| `garnish` | A small lime wheel resting on the rim, right side, kept inside the 4 to 20 box: rind ring, pale flesh, segment lines | rind `#6DBE45`, flesh `#D9F0B8`, segments `#6DBE45` |

Tile background: a vertical two stop gradient from `#262626` (dark `surfaceSelected`) at the top to `#121212` (dark `bg`) at the bottom, used for every opaque output, the Android adaptive background, and the `.icon` fill. The generator renders the tile with sharp from an SVG `linearGradient` at each output's size (`android-icon-background.png` stays 512). The splash keeps the flat `#121212` background, so the glass on its own still matches.

The generator finds the layers by their `id` attribute (the existing regex style is fine; the four ids are the contract) and renders the whole `mark.svg` unchanged for PNGs.

`mark-small.svg` is today's silhouette with proportions refined to match the new bowl: `#2B8F4B` glass plus charcoal rim, no liquid or garnish. The existing monochrome derivation still works on it (green at or above `0x76` maps to fully white, charcoal to transparent); the test asserts the monochrome PNG's opaque pixel count stays within a range. The web header logo (`apps/web/src/components/site-logo.tsx`) and the inline glass in `opengraph-image.tsx` draw these same paths.

**Output map** (extending `OUTPUTS` with a `source` field):

| Source | Outputs |
|---|---|
| `mark.svg` (detailed) | `apple-icon.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, mobile `icon.png` (1024), `android-icon-foreground.png`, `android-icon-background.png` (gradient), `splash-icon.png`, `brand-mark.png`, and `app.icon/` |
| `mark-small.svg` (simple) | `favicon.ico`, mobile `favicon.png`, web `icon.svg`, `android-icon-monochrome.png` (the existing green channel white silhouette, which works because the small mark keeps only green and charcoal) |

**The `.icon` bundle**: `pnpm icons` splits `mark.svg` by group into `apps/mobile/assets/app.icon/Assets/{glass,liquid,rim,garnish}.svg` (each a standalone SVG on the shared viewBox, scaled to Icon Composer's 1024 canvas with the glass at the "comfortable" 0.6 fill), and writes `icon.json` in the shape Icon Composer saves. Because every layer SVG is already framed on the same 1024 canvas, no layer needs a `scale` or `position` entry, which keeps the layers aligned by construction. Pinned values: `fill` is a `linear-gradient` of the two tile colors as sRGB strings, top to bottom; one group per layer from bottom to top (`glass`, `liquid`, `rim`, `garnish`), each referencing its `image-name`; default glass and shadow settings (no overrides); `supported-platforms` is `{ "squares": "shared" }`; no `fill-specializations`, so dark and tinted appearances are Apple's automatic versions and need no extra art. `app.json` sets `"ios": { "icon": "./assets/app.icon" }` and keeps the top level `icon` PNG for Android and older paths. EAS's macOS builders compile the bundle with Xcode, so nothing runs on a Mac locally. The `icon.json` format is not formally documented, so the first EAS build is the check (AC-8); if Xcode rejects it or it renders wrong, fix the generator against a sample `.icon` from Apple's or Expo's docs.

**Key invariants**:
- Generated files are never edited by hand: change `mark.svg`, `mark-small.svg`, or a locale module, then rerun `pnpm icons` or `store:metadata`.
- `mark.svg` always has exactly the four named groups; the script fails otherwise.
- Every listing field stays within `STORE_LIMITS`; the test and the generator share the one check.
- `Cocktailist` is never translated or transliterated in any listing.
- Nothing claims a feature the app does not ship, or a number above the live catalog count.

**Security model**: no user data and no new access rules. App Store Connect access for `eas metadata:push` goes through your existing EAS login and its App Store Connect API key, held in EAS, never in the repo (spec 0040). The generated file holds only public URLs.

**Configuration required**:
- `NEXT_PUBLIC_SITE_URL`: the production web origin, needed in the shell when you run `store:metadata` (the same value Vercel Production uses; still owed from feature 37).
- No new secrets.

**Critical test scenarios**:
- Happy path: `store:metadata` with a real `https` site URL writes a `store.config.json` with six locales whose URLs include each locale's web code, verifies **AC-5**
- Failure case: a description one character over 4000, or a keyword that repeats a subtitle word, fails the vitest test with the locale and field named, verifies **AC-1**, **AC-3**
- Failure case: `store:metadata` with `NEXT_PUBLIC_SITE_URL=http://localhost:3000` exits 1 and writes nothing, verifies **AC-5**
- Failure case: the URL guard rejects `https://foo.vercel.app`, `https://127.0.0.1`, `https://www.example.com`, and `http://cocktailist.app`, and strips a trailing slash from a good URL, verifies **AC-5**
- Failure case: a description with "#1" or an emoji, or a digit, fails the listing test, verifies **AC-4**
- Icon: `pnpm icons` produces an `app.icon/icon.json` whose every `image-name` exists in `Assets/`, and every PNG at its listed size; removing the `garnish` group makes it exit 1; the glass contrast check passes against both stops; the adaptive foreground's opaque pixels stay inside the safe zone, verifies **AC-7**, **AC-8**, **AC-9**
- Device: TestFlight or internal build home screen in light, dark, and tinted modes, plus an Android themed icon screenshot, verifies **AC-8**, **AC-9**

## Build plan

Tracer Bullet: one thin thread for each half (copy and icon), each proven end to end from repo source to its generated store artifact, then thickened with the remaining locales and the live store checks.

1. **Copy thread, English end to end.** `types.ts`, `STORE_LIMITS`, `banned.ts`, `en.ts` with the full English listing, `index.ts`, the vitest listing test (limits, brand prefix, keyword normalizer rules, age line, no numbers, emoji, or banned words, exact locale set, starting with `en` and growing to six in task 3), `scripts/store-metadata.ts` with the URL guard, categories, and the `--with-release-notes` flag, its builder test against the checked in EAS Metadata sample, the `store:metadata` and `store:push` scripts and `tsx` dev dependency in `apps/mobile` (it has no TS runner today), `store/.generated/` in `.gitignore`, `metadataPath` in `eas.json`, and `id="contact"` on the privacy contact card. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-10**.
2. **Icon thread, art to `.icon`.** Draw the detailed `mark.svg` (four groups) and the refined `mark-small.svg`; extend `generate-icons.mjs` with the `source` field, the gradient tile, the group check, and the `.icon` bundle writer; point `site-logo.tsx` and `opengraph-image.tsx` at the small mark's paths with a match test; set `ios.icon` in `app.json` and `ios.image: "latest"` on the preview and production profiles in `eas.json`; run `pnpm icons` and commit every output; extend `generate-icons.test.ts`; note the icon only colors in `docs/design/design.md`. Satisfies **AC-7**, **AC-8** (the generated bundle), **AC-9** (the generated Android files).
3. **Five more locales.** Native rewrites for `es`, `pt`, `fr`, `ja`, `zh` using each messages file as the glossary; widen the test's locale set to six; a second model review of `ja` and `zh` with findings resolved or recorded. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-6**.
4. **Live rollout** (needs your accounts). A preview or production EAS build on an iPhone (light, dark, tinted) and an Android phone (themed icon on); `store:metadata` with the real domain, then `eas metadata:push`; paste `play.md` into Play Console for the six Play locales; you or a native speaker skim the live listings. Satisfies **AC-5**, **AC-8**, **AC-9**.

## Consequences

**Positive**:
- Listings in six languages that say what makes the app different, checked against store limits on every test run.
- App Store copy changes become one edit plus one push, with no hand copying between consoles.
- One icon source still drives every size, now with a real layered iOS icon and no Mac needed.
- Favicons stay crisp because small sizes use a simpler mark.

**Negative / tradeoffs**:
- Google Play copy is still pasted by hand for six locales, and can drift from the repo if someone edits it in Play Console.
- The generated `icon.json` follows an undocumented format; an Xcode update could break it and send you back to the generator.
- Two marks (detailed and small) must stay visually related; changing one means checking the other.
- Keywords picked from knowledge, not search volume data, may underperform until real store analytics come in.
- Korean, Hindi, and Russian store visitors see the English listing.
- A drawn here icon lacks a professional illustrator's polish; if it reads amateurish next to competitors, commissioning one later means only replacing the two SVGs.

**Neutral**:
- `tsx` joins `apps/mobile` dev dependencies.
- Four icon only colors (the lighter glass `#2B8F4B`, liquid, lime rind, lime flesh) join `design.md` as brand art colors, not UI tokens. The icon glass is a lighter green than the web header logo's UI accent on purpose, for contrast on the dark tile.
- Pinning `ios.image` to `latest` means an EAS image change can change iOS builds without a repo change.
- `store/.generated/` exists only on the machine that ran the script.

## Follow-up

- [ ] Store screenshots and a preview video per locale and device size, as their own feature.
- [ ] Revisit keywords with App Store and Play search analytics about a month after launch.
- [ ] Listings for Korean, Hindi, and Russian if those markets show installs.
- [ ] Spec 0037's launch checklist still owes the real production domain, the real contact email, and the Cocktailist name and trademark check; the support and privacy URLs depend on the first two.
- [ ] Create the App Store Connect app record (needed before `eas metadata:push`) and the Play Console app.
