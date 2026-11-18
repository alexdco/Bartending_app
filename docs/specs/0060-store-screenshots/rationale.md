# 0060. Rationale: store screenshots

## Context

Both stores block a first submission without screenshots. Apple needs iPhone screenshots for the 6.9 inch slot (1320×2868 portrait); smaller iPhones scale down from it, and the app is iPhone only (`supportsTablet` is unset), so no iPad set is needed. Google Play needs at least two phone screenshots, whose long side may be at most twice the short side, so the tall Apple image cannot be reused. Play also requires a 1024×500 feature graphic before it publishes a listing, and spec 0057 does not cover it. Spec 0057 set six listing locales (en, es, pt, fr, ja, zh) and keeps the listing copy in typed modules in the repo. EAS Metadata pushes Apple listing text but not images.

The workload is large and recurring. Six shots in six locales on two platforms is 72 captures, and any visible UI change makes them stale. The maintainer works on Windows, so no iOS simulator runs locally, yet the App Store set should show the iOS app as it really renders (native glass, symbols, and fonts differ from Android). The captures need a believable account state (a stocked pantry, favorites, a generated AI idea), and signed in users get only 10 AI ideas a day. The real app also leaks problems into screenshots. A scan for this spec found about 40 hardcoded English strings on the very screens to be captured, so localized captures need those fixed first.

Text over images brings its own risks. Headlines in Japanese and Chinese need the right fonts, and a renderer that silently falls back to a system font can produce tofu (empty boxes) that only shows up in a store review.

## Options considered

### Option 1: Maestro on EAS Workflows, Satori framing, manual upload (chosen)

A Maestro flow per locale captures the real release build. iOS runs on an EAS macOS simulator; Android runs locally while you write the flow and on EAS for the final set. A Node script with Satori and resvg frames the captures under captions kept in the 0057 modules, with pinned fonts. You drag the finished folders into each console.

**Pros**:

- Real iOS and Android captures with no Mac, using the EAS account and credentials already in place (spec 0040).
- One command per step, and the full set is reproducible after any UI change.
- Satori is the engine the web OG image already uses (`next/og`). Fonts are explicit files, so output is identical on any machine.
- Captions sit beside the rest of each locale's store copy, under the same test and review.

**Cons**:

- The EAS Maestro job is alpha.
- Each run costs EAS minutes.
- Upload stays manual.

### Option 2: Manual capture on your own phones

You walk the six screens on your iPhone and Android phone in each locale and frame the results with the same renderer.

**Pros**:

- No new test tooling and no cloud cost.

**Cons**:

- About 72 captures per refresh.
- Status bar, scroll position, and timing vary from shot to shot.
- Shot sizes depend on whichever phones you own.

### Option 3: Android captures only, reused for both stores

One local emulator run feeds both the Play and the App Store frames.

**Pros**:

- The cheapest and fastest option. Everything runs on Windows.

**Cons**:

- The App Store listing would show Android UI, which differs visibly here and risks Apple's rule that screenshots show the app as it runs on the device.

### Option 4: Maestro Cloud for iOS, fastlane for upload

Maestro's own cloud runs the iOS simulator flows, and fastlane `deliver` and `supply` upload both stores' images.

**Pros**:

- Mature device control.
- Upload is scripted end to end.

**Cons**:

- A second paid service and account.
- fastlane is Ruby, which is awkward on Windows (it would need WSL or CI).
- It needs the App Store Connect key and the Play service account on a local machine.

## Rationale

The constraints that decide it are no Mac, 72 captures per refresh, and an honest iOS listing. Option 1 is the only one that gives real iOS captures without new vendors. The EAS Maestro job runs on the same account that already builds and submits the app, and its documented hooks (`before_maestro_tests` for dark mode and a clean status bar, `after_maestro_tests` with `eas/upload_artifact`) cover exactly what screenshots need. Its alpha status is the main risk, so the build plan proves that segment first, in slice 1, with one English shot. If it fails there, Option 4's Maestro Cloud swaps in for iOS and the flows stay the same.

Framing with Satori rather than a browser or sharp text keeps the render deterministic. Fonts are passed as files, and a missing glyph fails loudly, which matters most for `ja` and `zh`. Keeping captions in the 0057 modules means one locale's store copy lives in one file and gets one review, including the second model pass for `ja` and `zh`. Upload stays manual because fastlane would add a Ruby toolchain on Windows, and the EAS Metadata path used for text does not carry images. About 24 drags per refresh is cheap at launch cadence.

Smaller calls made here: dark theme, to match the brand tile. The batch panel instead of Bartender Mode for shot 5, which needs no seeded bar. Live AI generation with one demo account per platform, with a run wide budget of four retries so a full run never exceeds the 10 per day quota, and a seed that resets the demo users' daily count so a failed run can be rerun the same day. A dedicated `screenshots` build profile with analytics off, so demo runs don't distort PostHog. Native status bar overrides rather than cropping, so the frame shows a real, clean phone screen (cropping the bar was the runner up). Navigation by deep link and taps by `testID`, because visible text changes with locale.
