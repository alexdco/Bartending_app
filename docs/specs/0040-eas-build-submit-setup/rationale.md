# 0040. EAS build, update, and submit pipeline: rationale

Decision record for [index.md](index.md). `/develop` builds from `index.md`; this file is the why.

## Context

> ⚠️ Premise note: the scope row asks for "build and submit", but two things outside that wording are load bearing for the first store binary. (1) Over the air updates can only be added by shipping a new binary, so leaving `expo-updates` out of 1.0.0 means a wasted store release later; spec 0001 already counts on OTA. (2) The mobile code reads `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`, but no env file defines them (`apps/mobile/.env` only has the `NEXT_PUBLIC_` names), so a cloud build would ship an app whose Supabase client gets `""` and hangs. Both are in this spec's scope.

The mobile app (`apps/mobile`, Expo SDK 57, Expo Router, pnpm monorepo) has a real identity from spec 0037 (name Cocktailist, slug and scheme `cocktailist`, bundle id and package `com.cocktailist.app`), but no `eas.json`, no EAS project link, no `expo-dev-client`, and no `expo-updates`. Spec 0001 chose EAS Build and Submit as the release pipeline, and promised a custom dev client and free OTA updates; neither exists in code. Today the only way to run the app is Expo Go.

Forces:
- **Solo developer, pre launch, no store accounts yet.** Apple Developer and Google Play Console both still need enrolling, and Apple's can take days. Any plan that blocks on them blocks everything.
- **One backend.** Web and mobile both use the BartendingAppWeb Supabase project and one PostHog project; a second Supabase project exists but has no schema.
- **No CI yet.** GitHub Actions is scope feature 2, not installed.
- **Cost sensitivity.** No users, no revenue; the EAS free tier caps monthly builds and queues them slowly.
- **Alcohol themed app.** Store review will look at the age rating and the age gate from spec 0037; getting the forms wrong delays the first release.
- **Existing tests and tools pin `app.json`.** `scripts/brand.test.ts` parses `apps/mobile/app.json` directly, and `eas init` and `eas update:configure` only write into a static `app.json`, so a dynamic config would break spec 0037's AC-8 test and those setup steps.

Without a decision, no store build can be made, and the first one made ad hoc would likely bake in an empty Supabase URL, lack OTA, and use locally managed signing keys that are easy to lose.

## Options considered

### Option 1: EAS Build and Submit only, local version numbers

Add `eas.json` with the three standard profiles, keep `buildNumber` and `versionCode` in `app.json`, put env values in an `env` block in `eas.json`, no `expo-updates`.

**Pros**:
- Fewest moving parts; every value is visible in git.
- No runtime version policy or channels to understand.

**Cons**:
- Every build needs a commit to bump numbers, and two builds can collide.
- Env values live in two places (`eas.json` and the local `.env`), which is exactly how today's missing `EXPO_PUBLIC_SUPABASE_*` happened.
- Adding OTA later costs a full store release, and spec 0001 is already counting on it.

### Option 2: EAS Build, Update, and Submit with remote versioning, EAS environments, and a fingerprint runtime (chosen)

Four profiles mapped one to one onto update channels and EAS environments; `appVersionSource: remote` with `autoIncrement`; `expo-updates` with the fingerprint policy in the first binary; EAS managed credentials; a build time env check; manual CLI triggers with production auto submit to the testing tracks.

**Pros**:
- One source for env values (EAS environments), which `eas env:pull` also writes for local dev.
- Build numbers can't collide and never need a commit.
- OTA from 1.0.0, and the fingerprint policy refuses to deliver JS to a binary whose native layer differs.

**Cons**:
- More concepts at once (channels, runtime versions, environments).
- Fingerprint runtimes cut off OTA to old binaries on any native change.
- The env check only covers EAS builds and the wrapped update scripts, not every way the app can be started.

### Option 3: GitHub Actions driven builds with local credentials

Build in CI on push or tag, signing with a keystore and certificates held as GitHub secrets, `eas build --local` or fastlane.

**Pros**:
- No EAS build quota limits; full control of the build machine.
- Fits the planned CI.

**Cons**:
- CI doesn't exist yet, so this pulls feature 2 forward.
- iOS builds need macOS runners, which cost more and are slower to set up.
- Signing secrets must be handled and rotated by you, which is the work EAS was chosen to remove in spec 0001.

## Rationale

Option 2 is chosen because the forces that matter most here are a solo developer, no CI, and one backend. Remote versioning and EAS managed credentials remove the two chores that most often break solo release pipelines (bumping numbers, losing signing keys). EAS environments make the env values single sourced, which directly fixes the missing `EXPO_PUBLIC_SUPABASE_*` gap. The build time check turns that class of bug into a loud failure on the build server, before compiling, without touching local tooling.

OTA goes in now because the cost of adding it later is a whole store release, and the fingerprint policy is the safe default for a team with no release checklist: it can't push JS that calls a native module the binary lacks. The cost, losing OTA to old binaries after every native change, is acceptable at pre launch scale.

Option 3 solves a problem (quota limits) that doesn't exist yet and adds one that does (signing secrets plus macOS CI). Once feature 2 exists, the same `eas` commands can run from GitHub Actions with an Expo token, so Option 2 doesn't close that door.

The tracer first slice (Android preview) is ordered to dodge the slowest prerequisite: Apple enrollment. Android internal builds need no store account, so the whole pipe (EAS project, env, signing, device, backend) is proven before any money or waiting.

**Smaller calls made here** (pick, why, runner up):
- Run the env check as the `eas-build-post-install` hook and in the `update:*` scripts, not in an `app.config.ts`. Expo tooling loads app config constantly (`expo lint`, `expo-doctor`, `eas init`, `eas env:pull`), so a throwing config would block the very steps that create the values, and a dynamic config stops `eas init` and `eas update:configure` from writing `app.json`. Runner up: an `app.config.ts` that throws only when `EAS_BUILD` is set, which works but still adds a dynamic config. (Changed after the cross check.)
- Set `usesNonExemptEncryption` before the first build, since any later native setting change makes a new fingerprint and cuts earlier builds off from updates.
- Require all four values, PostHog included. A production build without analytics would quietly lose activation data. Runner up: require only the Supabase pair.
- A separate `development-simulator` profile rather than a flag at the command line, so `build:dev:sim` is one named, repeatable thing. Runner up: `--profile development` with an iOS simulator override at the command line.
- `app_channel` read from `Updates.channel` rather than a new env var, since the channel is already per profile and is the thing you'd filter on. Runner up: an `EXPO_PUBLIC_APP_ENV` variable per environment.
- No `node` pin in `eas.json`; use the EAS image default, since spec 0039 is moving the repo to Node 24 and a short version string may not resolve. Runner up: pin the full version from `.nvmrc` once it exists.
- Store name fallback `Cocktailist: Cocktail Recipes`, because store titles must be unique while the home screen name need not change.
