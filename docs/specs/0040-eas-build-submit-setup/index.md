# 0040. EAS build, update, and submit pipeline for the mobile app

**Date**: 2026-10-12
**Status**: In Progress

## Summary

This sets up how the Cocktailist mobile app gets built, updated, and sent to the stores, using Expo's EAS service (Expo's cloud build and release tooling). There are three kinds of build: development (a custom dev client for daily work), preview (a release build you install directly on test phones), and production (store builds that go straight to TestFlight and the Play internal testing track). Over the air updates (JS fixes pushed without a store review) ship in the first binary, so they work from day one. Store accounts don't exist yet, so the plan proves the whole pipe first with Android builds that need no store account, then adds the store steps.

## Requirements

**User stories**:
- As the developer, I can run one command and get a signed build of the app on my own phone, so I can test the real release before anyone else sees it.
- As the developer, I can run one command to build production and land it in TestFlight and Play internal testing, without copying keys around or typing Apple passwords on each release.
- As the developer, I can push a JS fix to people who already installed the app without waiting for store review, and it never reaches a binary that lacks the native code it needs.
- As the developer, I can tell test traffic from real traffic in PostHog, even though every build shares one PostHog project.
- As the developer, a build missing its Supabase or PostHog settings fails loudly instead of shipping an app that hangs.

**Acceptance criteria**:
- **AC-1**: The EAS project is owned by the Expo organization `cocktailist` (fallback `cocktailist-app` if taken) with slug `cocktailist`. `apps/mobile/app.json` carries `expo.owner` and `expo.extra.eas.projectId` written by `eas init`. `apps/mobile/eas.json` exists with `cli.appVersionSource: "remote"` and the build profiles `development`, `development-simulator`, `preview`, and `production`.
- **AC-2**: `development` builds with `expo-dev-client` (`developmentClient: true`, `distribution: "internal"`) for a physical iOS and Android device. `development-simulator` extends it with `ios.simulator: true`. Both use channel `development` and EAS environment `development`. An installed dev client connects to `pnpm --filter mobile start` (now `expo start --dev-client`) and hot reloads.
- **AC-3a**: `preview` on Android is a release APK (`android.buildType: "apk"`, `distribution: "internal"`) on channel `preview` and EAS environment `preview`. Installed on a phone, it launches, shows the age gate, and after "yes" a recipe search returns results from Supabase (proving the env values were baked in). Needs no store account.
- **AC-3b**: `preview` on iOS is an ad hoc build installed on a device registered with `eas device:create`, with the same launch, age gate, and search behavior as AC-3a. Needs the Apple Developer account.
- **AC-4**: `production` uses channel `production`, EAS environment `production`, `autoIncrement: true`, and an Android App Bundle. Two production builds in a row get different build numbers (Android `versionCode`, and iOS `buildNumber` once iOS builds exist) with no commit in between; this is first checked with Android builds, before any store account. The user facing version stays the `expo.version` in `app.json` (`1.0.0`) until you bump it by hand.
- **AC-5**: The four public values `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_POSTHOG_KEY`, and `EXPO_PUBLIC_POSTHOG_HOST` are created with `eas env:create` at visibility `plaintext` (they are compiled into the app, so hiding them buys nothing) in all three EAS environments. The Supabase pair takes the BartendingAppWeb values already in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; the PostHog pair takes the current `EXPO_PUBLIC_POSTHOG_*` values in `apps/mobile/.env`. `eas env:pull --environment development` writes `apps/mobile/.env.local` (already git ignored), after which local `expo start` reaches Supabase.
- **AC-6**: `apps/mobile/scripts/check-public-env.mjs` exits non zero, printing every missing name, when any of the four values in AC-5 is unset or blank after trimming. It runs as the `eas-build-post-install` script in `apps/mobile/package.json`, so an EAS build with a missing value fails on the build server before compiling, and it runs first in the `update:*` scripts, so `eas update` never publishes without them. Local tooling (`expo start`, `expo lint`, `expo-doctor`, `eas init`, `eas env:pull`, vitest, CI) never runs it. `app.json` stays the only app config (no `app.config.ts`), so `scripts/brand.test.ts` passes unchanged.
- **AC-7**: `expo-updates` is installed and configured by `eas update:configure` with `runtimeVersion: { policy: "fingerprint" }` and the EAS update URL in `app.json`. The app checks for an update on launch and applies it on the next launch (the library default; no custom update code). Publishing with `eas update --channel preview` changes a visible string on an installed preview build after two launches, and an installed production build does not change.
- **AC-8**: An update only reaches builds whose fingerprint runtime version matches. After a native dependency changes, `eas fingerprint:compare` between the old and new build shows a different fingerprint, and an update published from the new code does not reach the old build, which keeps running its bundled JS.
- **AC-9**: Every mobile PostHog event carries a super property `app_channel` whose value is the build's update channel (`development`, `preview`, or `production`), or `local` when the channel is null (Expo Go). It is registered inside `initAnalytics()`, so it still sends nothing before the age gate is confirmed (spec 0037, AC-15).
- **AC-10**: `app.json` sets `ios.config.usesNonExemptEncryption: false` from the first EAS build onward, so a TestFlight build never asks the export compliance question and the setting never changes the fingerprint later.
- **AC-11**: `eas build --profile production --platform all --auto-submit` uploads the iOS build to TestFlight using an App Store Connect API key stored in EAS, and the Android build to the Play **internal** track with `releaseStatus: "completed"` using a Google service account key stored in EAS. Submits need no Apple ID password or 2FA prompt. (The first iOS build does prompt for an Apple login once, while EAS generates the signing certificate and profiles.)
- **AC-12**: Signing credentials (iOS distribution certificate and provisioning profiles, Android upload keystore) are EAS managed. The repo holds no keystore, `.p8`, `.p12`, provisioning profile, `credentials.json`, or service account JSON: downloaded keys live outside the repo, and the root `.gitignore` adds `credentials.json` and `apps/mobile/credentials/` as a backstop. `git check-ignore -v apps/mobile/.env` confirms the file that holds server secrets today is ignored, so it is not in the archive EAS uploads.
- **AC-13**: `apps/mobile/package.json` has the scripts `build:dev`, `build:dev:sim`, `build:preview`, `build:prod` (production, all platforms, auto submit), `update:preview`, and `update:prod`. Each wraps the matching `eas` command, and the `update:*` scripts run the AC-6 check first.
- **AC-14**: Before the first submit, the manual store setup in *Store setup checklist* is done: both developer accounts enrolled, the App Store Connect app record and the Play Console app created under the store name in that checklist, the first Android bundle uploaded by hand, and the age rating, privacy, and data safety forms answered as listed.

## Decision

**Chosen option**: Option 2: EAS Build, Update, and Submit with remote versioning, EAS environments, and a fingerprint runtime.

Use four EAS build profiles mapped one to one onto update channels and EAS environments, EAS managed credentials, remote build numbers, `expo-updates` with the fingerprint policy in the first binary, a build time env check, and manual CLI triggers with production auto submitting to the testing tracks.

**Implementation skills**: `react-native-best-practices` (`callstackincubator/agent-skills`, `.agents/skills/react-native-best-practices/`) · `posthog-instrumentation` (`posthog/posthog-for-claude`, `.agents/skills/posthog-instrumentation/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: none. This feature touches no database schema. Its "data" is config: `eas.json`, `app.json`, EAS environment variables, and EAS stored credentials.

**Target `apps/mobile/eas.json`** (the shape `/develop` writes; set `cli.version` to the eas-cli version installed at build time; no `node` field, so builds use the EAS image default):

```json
{
  "cli": { "version": ">= <installed eas-cli>", "appVersionSource": "remote" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "channel": "development",
      "environment": "development"
    },
    "development-simulator": {
      "extends": "development",
      "ios": { "simulator": true }
    },
    "preview": {
      "distribution": "internal",
      "channel": "preview",
      "environment": "preview",
      "android": { "buildType": "apk" }
    },
    "production": {
      "channel": "production",
      "environment": "production",
      "autoIncrement": true,
      "android": { "buildType": "app-bundle" }
    }
  },
  "submit": {
    "production": {
      "ios": { "ascAppId": "<from App Store Connect>" },
      "android": { "track": "internal", "releaseStatus": "completed" }
    }
  }
}
```

The App Store Connect API key and the Google service account key are uploaded once with `eas credentials` (or at the first `eas submit` prompt) and referenced by EAS, not by a path in `eas.json`. `ascAppId` is a public numeric id and is fine to commit.

**`apps/mobile/scripts/check-public-env.mjs` shape** (a pure `findMissing(env)` plus a thin entry point that exits; the pure function gets a unit test beside it):

```js
export const REQUIRED = [
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  "EXPO_PUBLIC_POSTHOG_KEY",
  "EXPO_PUBLIC_POSTHOG_HOST",
];

export const findMissing = (env) => REQUIRED.filter((name) => !(env[name] ?? "").trim());

// entry point: when run directly, print the missing names and exit 1 if any
```

Wiring in `apps/mobile/package.json`: `"eas-build-post-install": "node scripts/check-public-env.mjs"`; `update:preview` is `node scripts/check-public-env.mjs && eas update --channel preview --environment preview`, with the env for the local check supplied by `eas env:exec preview` (or by pulling that environment first).

**Interface surface** (CLI commands and scripts, the only "API" this feature has):

| Command / script | Wraps | Key inputs | Output | Auth | Key errors |
|---|---|---|---|---|---|
| `build:dev` | `eas build --profile development --platform all` | none | dev client for devices (internal link) | Expo login, org member | iOS needs a registered device (`eas device:create`) and the Apple account |
| `build:dev:sim` | `eas build --profile development-simulator --platform ios` | none | iOS simulator `.app` | Expo login | env check fails the build on a missing value |
| `build:preview` | `eas build --profile preview --platform all` | `--platform android` for the account free tracer | APK + ad hoc IPA | Expo login | iOS needs the Apple account; env check fails the build on a missing value |
| `build:prod` | `eas build --profile production --platform all --auto-submit` | none | store builds, then submitted | Expo login + EAS stored store keys | submit fails if the store app record or first Android upload is missing |
| `update:preview` | env check, then `eas update --channel preview --environment preview` | `--message` | update group on channel `preview` | Expo login | env check; no matching runtime means no device receives it |
| `update:prod` | env check, then `eas update --channel production --environment production` | `--message` | update group on channel `production` | Expo login | same as above |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Any build | Supabase URL and anon key baked into JS | EAS environment variable for the profile's `environment` (AC-5), originally copied from `NEXT_PUBLIC_SUPABASE_*` |
| Any build | PostHog key and host | EAS environment variable for the profile's `environment`, originally copied from `apps/mobile/.env` |
| Local `expo start` | the same four values | `apps/mobile/.env.local` written by `eas env:pull --environment development` |
| Env check | which names are missing | `process.env` on the EAS build server (build) or the pulled environment (update), through `findMissing` |
| Production build | iOS `buildNumber`, Android `versionCode` | EAS remote version store, auto incremented (`appVersionSource: remote`, `autoIncrement`); starts at 1 |
| Manual first Play upload | its `versionCode` | the EAS production build used for that upload, so the remote counter stays in step |
| Any build | user facing version `1.0.0` | `expo.version` in `app.json`, bumped by hand at release |
| Any build / update | runtime version | fingerprint hash of the native layer, computed by EAS; compared with `eas fingerprint:compare` |
| Any build | update channel | `channel` field of the profile in `eas.json` |
| PostHog init | `app_channel` | `Updates.channel` from `expo-updates`, else `"local"` when null; resolver in `apps/mobile/src/analytics/app-channel.ts` |
| iOS submit | which App Store Connect app | `submit.production.ios.ascAppId` in `eas.json` |
| iOS submit | auth to App Store Connect | App Store Connect API key stored in EAS credentials |
| Android submit | auth and track | service account key stored in EAS; `track: internal`, `releaseStatus: completed` in `eas.json` |
| Store listing | store name | `Cocktailist`; if taken, `Cocktailist: Cocktail Recipes`. Home screen name stays `expo.name` (`Cocktailist`) |
| EAS project link | owner and project id | `expo.owner` and `expo.extra.eas.projectId` in `app.json`, written by `eas init` |

**Key invariants**:
- Each profile's `channel` equals its `environment` name (`development-simulator` reuses `development`). A preview update never reaches a production binary.
- `EXPO_PUBLIC_` values are public by definition. No server secret (`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`) is ever stored in an EAS environment or given an `EXPO_PUBLIC_` name.
- `app.json` remains the only app config; there is no `app.config.ts`, so `eas init` and `eas update:configure` can write to it directly.
- Build numbers are only ever assigned by EAS; nobody edits `ios.buildNumber` or `android.versionCode` in `app.json`.
- Native affecting `app.json` fields (`ios.config`, plugins, icons, permissions) are settled before the first preview build where possible, since each change produces a new fingerprint and cuts older builds off from updates.
- Store review promotion (TestFlight external or App Store review, Play closed and production tracks) is always a manual step outside this pipeline.

**Security model**:
- The Expo org `cocktailist` owns the project and all its credentials; only org members can build, update, or submit. Today that is just you.
- iOS signing material, the Android upload keystore, the App Store Connect API key, and the Google service account key live only in EAS. Download a keystore backup once (`eas credentials`) and store it in your password manager, since losing the Android upload key means a Play support reset. Keep any downloaded key file outside the repo.
- The Google service account gets only the Play Console permission to release to testing tracks for this one app, not account admin.
- `apps/mobile/.env` currently holds server secrets copied from the web app. The root `.gitignore` pattern `.env` already covers it, which keeps it out of the EAS archive. Removing those keys from the mobile `.env` is a follow-up.
- No compliance scope beyond what spec 0012 and spec 0037 already cover (privacy policy, consent gated analytics, age gate).

**Configuration required**:
- `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`: BartendingAppWeb project values, in EAS environments development, preview, and production, visibility `plaintext`.
- `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_HOST`: the existing PostHog project values, same three environments, visibility `plaintext`.
- Prerequisite accounts (manual): Expo organization `cocktailist`; Apple Developer Program; Google Play Console; an App Store Connect API key (App Manager role); a Google Cloud service account with a JSON key, invited into Play Console.

**Store setup checklist** (manual, AC-14; record each answer as you submit it):
- Apple Developer Program enrollment ($99 a year) and Google Play Console registration ($25 once). Apple enrollment can take a day or more, so start it first.
- App Store Connect: create the app record with bundle id `com.cocktailist.app`, name `Cocktailist` (fallback `Cocktailist: Cocktail Recipes`), primary language English, then copy its numeric Apple ID into `ascAppId`.
- Play Console: create the app with the same name rule, package `com.cocktailist.app`, keep Play App Signing on (the default; EAS's keystore becomes the upload key), then upload the first production `.aab` by hand to the internal track (Google requires one manual upload before API submits work).
- Service account: create it in Google Cloud, invite it in Play Console with release to testing tracks permission for this app, then allow a few hours before the first API submit, since the permission can take time to apply.
- Age rating: on the iOS questionnaire, answer alcohol references as frequent. Accept whatever top tier Apple's current scale gives (it has been revising the tiers, so check the result rather than expecting a fixed number). On the Play IARC questionnaire, answer yes to alcohol references and no to selling alcohol.
- iOS privacy labels: data linked to the user: user ID and email (sign in, spec 0008), user content (comments and photos, specs 0027 and 0032). Usage data (product interaction) collected by PostHog for analytics, not used for tracking across apps. No App Tracking Transparency prompt needed.
- Play data safety: same data types; encrypted in transit; account deletion path is the one spec 0008/0018 provide, and the privacy policy URL is the web `/privacy` page.
- Listing copy (title, subtitle, keywords, description) stays with spec 0037's follow-up and is not part of this feature.

**Critical test scenarios**:
- Happy path: with no store accounts, `pnpm --filter mobile build:preview -- --platform android` produces an APK; installed on a phone it passes the age gate and returns search results, verifies **AC-1**, **AC-3a**, **AC-5**.
- Happy path: `update:preview` with a changed string reaches that preview install on the second launch, and a production install stays unchanged, verifies **AC-7**.
- Failure case: delete one variable from the EAS `preview` environment and run an Android preview build; it fails at the post install step naming that variable, verifies **AC-6**.
- Failure case: after adding a native package, `eas fingerprint:compare` shows a new fingerprint and the older preview build does not pick up the new update, verifies **AC-8**.
- Auth/permission: `git ls-files` shows no credential or key file, `git check-ignore -v apps/mobile/.env` reports it ignored, and an Expo account outside the org cannot see or build the project, verifies **AC-12**.
- Unit test: `findMissing` returns `[]` when all four values are set, and returns exactly the missing or blank names otherwise (including a value of only spaces), verifies **AC-6**.
- Unit test: the `app_channel` resolver maps `"preview"` to `"preview"` and `null` to `"local"`, verifies **AC-9**.

## Build plan

Tracer Bullet: the first slice pushes one real build through every segment (repo, EAS project, env, signing, device, backend) without needing a store account, then each later slice thickens one segment.

**Slice 1: thin thread, Android builds on a real phone (no store accounts needed)**
1. Create the Expo organization `cocktailist` (manual), install `eas-cli`, run `eas init` in `apps/mobile` to link the project and write `owner` and `projectId` into `app.json`, satisfies **AC-1**.
2. Set `ios.config.usesNonExemptEncryption: false` in `app.json` now, before any build, so it never changes the fingerprint later, satisfies **AC-10**.
3. Write `apps/mobile/eas.json` with `cli.appVersionSource: "remote"` and the `preview` and `production` profiles, satisfies **AC-1**, **AC-3a**, **AC-4**.
4. Create the four `EXPO_PUBLIC_` variables with `eas env:create` (visibility `plaintext`) in EAS environments development, preview, and production, then `eas env:pull --environment development` to make `apps/mobile/.env.local`, satisfies **AC-5**.
5. Add `apps/mobile/scripts/check-public-env.mjs` with its unit test, and wire it as the `eas-build-post-install` script, satisfies **AC-6**.
6. Add `credentials.json` and `apps/mobile/credentials/` to the root `.gitignore`, and confirm `git check-ignore -v apps/mobile/.env`, satisfies **AC-12**.
7. Run `eas build --profile preview --platform android` with an EAS generated keystore, install the APK, and confirm the age gate and a Supabase search work, satisfies **AC-3a**, **AC-5**.
8. Run `eas build --profile production --platform android` twice and confirm the `versionCode` increments with no commit; keep the first `.aab` for the manual Play upload, satisfies **AC-4**.

**Slice 2: over the air updates**
9. Install `expo-updates`, run `eas update:configure` (it writes the update URL into `app.json`), set `runtimeVersion: { policy: "fingerprint" }`, and add `channel` to every profile; rebuild the Android preview, satisfies **AC-7**, **AC-8**.
10. Publish a visible string change with `update:preview` and confirm it lands on the second launch; add a native package on a branch and confirm with `eas fingerprint:compare` that the old build is cut off, satisfies **AC-7**, **AC-8**.
11. Register the `app_channel` super property in `initAnalytics()` from `Updates.channel ?? "local"`, using a small pure resolver in `src/analytics/app-channel.ts` with a unit test, satisfies **AC-9**.

**Slice 3: development client**
12. Install `expo-dev-client`, change the mobile `start` script to `expo start --dev-client`, and add the `development` and `development-simulator` profiles; build the Android dev client and check hot reload, satisfies **AC-2**.

**Slice 4: iOS and store submit (needs both store accounts)**
13. Enroll in Apple Developer and Google Play Console, and create both store app records (manual, see *Store setup checklist*), satisfies **AC-14**.
14. Run the first iOS builds (`build:dev:sim`, then preview and production after `eas device:create` registers your phone). Expect a one time Apple login while EAS creates and stores the certificate and profiles, satisfies **AC-2**, **AC-3b**, **AC-12**.
15. Upload the slice 1 Android `.aab` by hand to the Play internal track, create and invite the service account, and store its key with `eas credentials`, satisfies **AC-11**, **AC-14**.
16. Create the App Store Connect API key, store it with `eas credentials`, and add the `submit.production` block with `ascAppId`, satisfies **AC-11**.
17. Run `build:prod` and confirm both platforms land in TestFlight and Play internal with increasing build numbers and no 2FA prompt, satisfies **AC-4**, **AC-11**.
18. Answer the age rating, privacy label, and data safety forms as listed in the checklist, satisfies **AC-14**.

**Slice 5: ergonomics**
19. Add the six `build:*` and `update:*` scripts to `apps/mobile/package.json`, with the env check first in the `update:*` ones, satisfies **AC-6**, **AC-13**.

## Consequences

**Positive**:
- One command takes source to both testing tracks, with no signing files on your machine and no Apple 2FA on each release.
- JS fixes reach installed users without review from 1.0.0 onward, and fingerprint matching stops an update from crashing an older binary.
- A misconfigured build fails on the build server before compiling, while local tooling keeps working; the pull step also fixes today's missing local `EXPO_PUBLIC_SUPABASE_*` values.
- PostHog test traffic is separable by `app_channel` without a second project.

**Negative / tradeoffs**:
- The free EAS tier means a monthly build cap and a slower queue; a busy release day can mean waiting, and hitting the cap forces a paid plan or local builds.
- Dev and preview builds write to the real Supabase project. Test pantry rows, comments, and ratings mix with real data, and testers must be careful with destructive actions.
- The env check only guards EAS builds and the `update:*` scripts. A bare `eas update` typed by hand, or a local `expo start` without the pull, still runs with missing values (local runs hang as they do today).
- Fingerprint runtimes are strict: any native change, even an unrelated one, cuts off OTA updates to older binaries until people update from the store.
- OTA updates add a release path that skips review; a bad `update:prod` reaches everyone on that runtime. Roll back with `eas update:rollback` (or by republishing the previous update).
- Two store developer accounts plus Expo means three more dashboards and a recurring $99 a year.

**Neutral**:
- `start` moves to `expo start --dev-client`; Expo Go still works for screens that don't need extra native modules.
- Build triggering stays manual until the CI feature (scope feature 2) lands; then GitHub Actions can call the same scripts using an Expo access token.
- The root `package.json` pins pnpm (`packageManager: pnpm@12.3.4`), which EAS uses to install the workspace. Expo SDK 57 handles pnpm workspaces natively, so no `.npmrc` hoisting change is expected; if the EAS install step fails to resolve `@bartendingapp/shared`, fixing it belongs in this feature's build.
- If local and EAS fingerprints ever disagree (path or tooling differences in the monorepo), add a `.fingerprintignore` in `apps/mobile` and compare with `npx @expo/fingerprint` locally against the build's value.

## Follow-up

- [ ] Remove `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, and the other web only values from `apps/mobile/.env` (it should hold nothing the mobile app doesn't use).
- [ ] Add mobile Sentry (`@sentry/react-native`) with source map upload in EAS builds and updates; Sentry is in the stack but not on mobile yet.
- [ ] When CI lands (scope feature 2), decide whether production builds run from CI on tag, using an `EXPO_TOKEN` secret.
- [ ] Draft store listing copy (already tracked in spec 0037's follow-up); the store name fallback here feeds into it.
- [ ] Revisit a separate Supabase project for preview and development if test data in production becomes a problem.
- [ ] `/sync` should note the build and update commands and the `eas env:pull` setup step in `apps/mobile/AGENTS.md`.
