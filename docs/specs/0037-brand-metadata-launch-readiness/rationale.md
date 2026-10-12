# 0037. Brand, metadata, and launch readiness: rationale

Decision record for [index.md](index.md). The build does not need this file.

## Context

The product has two names. The web header and logo say "Cocktailist"; the root title, `home.siteName`, and the privacy copy say "Bartending App". The mobile app is still the Expo template: `app.json` name and slug `mobile`, scheme `mobile`, a blue splash (`#208AEF`), an Expo logo in the animated splash overlay, and no bundle ID or Android package. A store submission is impossible as is, and every shared link or browser tab shows the wrong or a generic name.

Page metadata is uneven. The locale layout sets a plain `title` with no template, so 20 of 29 pages (pantry, favorites, learn index, drink ideas, every service and admin page, and others) render the same bare title. There is no web manifest, the favicon is the create-next-app default, and pages without their own image share nothing when linked. Specs 0011 (SEO) and 0033 (Learn summaries) already give recipe, popular, and article pages real metadata, which this work extends rather than replaces.

The app is alcohol themed. Both stores rate alcohol references through their questionnaires, reviewers commonly expect an age confirmation, and the industry norm for alcohol brands is a neutral age affirmation plus a responsible drinking notice. The app has guests before any account exists (anonymous sessions, spec 0008), serves English and Spanish audiences whose legal drinking ages differ (18 vs 21), and already holds a cookie consent banner (spec 0012) and PostHog analytics (spec 0013) that should not fire for someone who says they are under age.

Constraints: no new paid service, no PII added to the privacy policy if avoidable, recipe pages must stay indexable (search is a main acquisition path), and the work must land on both apps from `packages/shared` per `AGENTS.md`.

## Options considered

### Product name

- **Cocktailist (chosen).** Already in the header and logo; distinctive and searchable. Con: availability in both stores and as a domain is not yet checked.
- **Bartending App.** Already in titles and privacy copy. Con: generic, unrankable, reads as a placeholder.

### Age handling

- **Store rating plus a one time yes or no confirmation and a notice (chosen).** The norm for alcohol apps and the lowest review risk. Con: a tap of friction for every new visitor, and trivially bypassed.
- **Store rating plus notice, no gate.** Lightest. Con: reviewers sometimes ask for a gate, and a rejection costs a review cycle.
- **Birth date entry.** A stronger neutral screen. Con: collects a date of birth (PII) that the privacy policy and store labels must then cover, for no store requirement.

### What "no" does

- **Polite block for the session (chosen).** Clearly serves the gate's purpose; a wrong tap costs one session, not the install. Con: a determined minor retries next session.
- **Mocktails only mode.** Friendlier and on brand (the catalog has mocktails). Con: touches search, pantry matching, AI ideas, popular, and recommendations; far larger than this feature.
- **Permanent block on the device.** Strongest deterrent. Con: locks a real adult out after one wrong tap until they clear data.

### Where the answer lives

- **Device only (chosen).** Works for guests before a session exists, needs no migration or RLS, and keeps age out of the database. Con: asked once per browser and install.
- **Device plus a profile column.** Signed in users answer once across devices. Con: a migration, RLS, and sync logic for a one tap prompt, plus a stored age signal tied to identity.

### Web gate rendering

- **Server rendered overlay, visibility set by an inline head script (chosen).** Same pattern as the existing `themeInitScript`, so no flash in either direction and content stays in the HTML. Con: an inline script must duplicate the exempt rule, solved by embedding the shared `RegExp` source.
- **Client render after hydration.** Simplest. Con: recipe content flashes before the overlay, which looks broken and weakens the gate.
- **Server redirect to a gate page (cookie based).** No flash at all. Con: crawlers without the cookie get redirected away from every recipe, which harms indexing badly, and it needs a cookie the consent model would have to cover.

### Icon pipeline

- **One SVG plus a committed `sharp` script (chosen).** Repeatable, deterministic, and one place to change. Con: a dev dependency and a script to maintain.
- **Hand export.** No dependency. Con: a dozen exports to redo by hand on every tweak, and sizes drift.
- **`next/og` icon routes.** No PNGs on web. Con: mobile still needs PNG files, so it splits the pipeline in two.

### Share image

- **Generated default card with `next/og` (chosen).** No design asset needed; tokens keep it on brand; static per locale at build. Con: needs a font file committed for Fraunces.
- **Static designed PNG.** Best looking with a designer. Con: an asset that doesn't exist yet, and one per locale for a translated tagline.
- **Generated cards per article and quiz too.** Richer shares. Con: more routes to build and test now; easy to add later on the same pattern.

## Rationale

**Name.** "Cocktailist" is already what users see first (the header), so choosing it changes fewer visible surfaces than "Bartending App", and a distinctive name is what search and the stores need. The availability check sits in the launch checklist because only you can register the name.

**Age gate.** The forces are store review risk, two audiences with different legal ages, guests without accounts, and the existing consent and analytics flow. A yes or no question worded as "legal drinking age where you live" covers both locales without hardcoding 18 or 21, needs no identity, and adds no PII. Device only storage follows from guests: an answer must exist before any session, and a profile column would only help the minority who sign in. Ordering the gate before the consent banner and before mobile `identify` means nothing is tracked for someone who answers no, which is why the gate outcome itself is also not tracked.

**No flash, still indexable.** The theme init script already proves the inline head pattern works in this layout. Keeping content in the server HTML and using an overlay, not a redirect, is what protects recipe indexing; age interstitials are a recognized exception to intrusive interstitial guidance, so the remaining risk is small and is a follow-up to watch, not a blocker. Exempting `/privacy` keeps the policy readable to anyone, which the blocked screen links to, and exempting `/auth/callback` keeps the sign in and reset handoff clean.

**Metadata.** A `title.template` on the locale layout is the App Router's built in way to brand every title without each page repeating the suffix, and it turns the 20 pages that render a bare title into unique ones by adding only a page title each. Descriptions are written only for indexable pages, because robots already blocks the private ones and their descriptions would never be read.

**Icons and mobile identity.** Deriving every size from the existing glass mark gives a consistent identity today and a one file swap later. The mobile template leftovers (Expo logo splash, blue colors, `mobile` scheme) are fixed together with the bundle ID because the bundle ID is permanent after the first submission and the scheme change touches the password reset flow, so both belong in one tested slice. Removing the `ios.icon` Icon Composer file is a deliberate step back to a flat icon until a designed one exists.

**Recommendations decided while writing:**
- Brand name in code comes from `BRAND_NAME` in `packages/shared`; message files spell it literally, with a test guard. Runner up: interpolate `{brand}` into every message, which adds a parameter to many `t()` calls for a value that never changes per locale.
- Store keys `age-confirmed` and `age-denied` with the value `"1"` as a version, so a wording change can ask again. Runner up: a boolean, which can't ask again without renaming the key.
- Mobile gate as an overlay above `AppTabs` rather than a separate route, so expo-router keeps a deep link target underneath. Runner up: a gate route with a redirect back, which has to carry the original URL.
- `favicon.ico` written by packing PNGs into an ICO header in the script, rather than adding an ICO dependency.
- The gate state lives in one external store read by both the gate and the consent banner, and the page content sits in an `#app-content` wrapper so `inert` and the CSS rule that blocks clicks before hydration share one target. Runner up: React context in `Providers`, which forces the gate to render inside `Providers`.
- Mobile PostHog initialization (not just `identify`) waits for the gate, because `AppTabs` mounts underneath the overlay and its screens could otherwise capture events. Runner up: holding only `identify`, which still lets anonymous events through.
- Fraunces for the OG card from an OFL TTF committed inside `apps/web` (so Vercel file tracing picks it up) rather than fetching Google Fonts at build, so builds don't depend on the network. Runner up: the `next/og` default font, which is off brand.
- Manifest and installed app colors use the dark `bg` token so the installed splash matches the charcoal icon. Runner up: the light `bg`, which flashes white around a dark icon.
- Workspace package name stays `mobile` because `pnpm mobile` filters on it.
