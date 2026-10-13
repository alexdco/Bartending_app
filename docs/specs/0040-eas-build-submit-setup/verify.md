# Verify: EAS build and submit setup · spec 0040 · updated 2026-10-12

_Steps derived from spec 0040 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. Run commands from `apps/mobile` unless noted. Most steps need you logged in to Expo (`eas login`) and a phone, so they run after the manual account steps._

## UI / manual

- [ ] Install the APK from `pnpm build:preview:android` on an Android phone, open it → age gate shows; tap yes → a recipe search returns results (proves the Supabase values were baked in) → AC-3a, AC-5
- [ ] Install an iOS ad hoc preview on a phone registered with `eas device:create` → same age gate and search behavior → AC-3b
- [ ] Install the Android dev client from `pnpm build:dev`, run `pnpm --filter mobile start` → the app connects and hot reloads an edited string → AC-2
- [ ] Change a visible string, run `pnpm update:preview --message "verify"`, then open the preview install twice → the new string shows on the second launch; a production install stays unchanged → AC-7
- [ ] On a preview build, pass the age gate, trigger an event, and open it in PostHog → it carries `app_channel: "preview"`; before the gate is confirmed, nothing is sent → AC-9
- [ ] In Expo Go or a dev client, trigger an event → it carries `app_channel: "local"` (expo-updates reports a null channel on dev builds, see the note in the build report) → AC-9
- [ ] Run `pnpm build:prod` → the iOS build lands in TestFlight and the Android build in Play internal, with no Apple ID password or 2FA prompt → AC-11
- [ ] Before the first submit: both store accounts enrolled, both app records created, the first `.aab` uploaded by hand, the age rating, privacy, and data safety forms answered per the spec's checklist → AC-14

## Commands

- [ ] `cat app.json` → `expo.owner` and `expo.extra.eas.projectId` are present (written by `eas init`), and `eas.json` has `cli.appVersionSource: "remote"` plus the four profiles → AC-1
- [ ] `eas project:info` while logged in as an account outside the `cocktailist` org → the project is not visible → AC-1, AC-12
- [ ] `eas build --profile production --platform android` twice with no commit between → the second build's `versionCode` is higher; `expo.version` stays `1.0.0` → AC-4
- [ ] `eas env:list --environment development` (and `preview`, `production`) → all four `EXPO_PUBLIC_` names, visibility plaintext; no `SUPABASE_SERVICE_ROLE_KEY` or `ANTHROPIC_API_KEY` in any EAS environment → AC-5
- [ ] `eas env:pull --environment development` → writes `.env.local`; `pnpm start` then reaches Supabase → AC-5
- [ ] `eas env:delete` one variable from `preview`, run `pnpm build:preview:android` → the build fails at the post install step naming that variable; recreate it afterwards → AC-6
- [ ] `node scripts/check-public-env.mjs` with the four values unset → exits 1 naming all four; with them set → exits 0 → AC-6
- [ ] `pnpm exec vitest run apps/mobile/scripts apps/mobile/src/analytics scripts/brand.test.ts` → all pass (`findMissing`, `resolveAppChannel`, brand config unchanged) → AC-6, AC-9
- [ ] `npx expo config --type prebuild` → `runtimeVersion.policy` is `fingerprint`, `updates.url` points at the EAS project, `ios.config.usesNonExemptEncryption` is `false` → AC-7, AC-10
- [ ] Add a native package on a throwaway branch and build a preview; `eas fingerprint:compare` against the old build → fingerprints differ; an update published from the new code does not reach the old build → AC-8
- [ ] From the repo root: `git ls-files | grep -Ei "\.(jks|keystore|p8|p12|mobileprovision)$|credentials\.json|service.?account"` → no output; `git check-ignore -v apps/mobile/.env` → reports it ignored → AC-12
- [ ] `grep -E '"(build|update):' package.json` → `build:dev`, `build:dev:sim`, `build:preview`, `build:prod`, `update:preview`, `update:prod` (plus `build:preview:android`), and both `update:*` run the env check first → AC-13

## Value sourcing checks

- [ ] Supabase URL and key in a build come from the EAS environment named by the profile: set a deliberately different `EXPO_PUBLIC_POSTHOG_HOST` only in `preview`, build a preview, and confirm events go to that host → value sourcing (EAS env per profile)
- [ ] Build number comes from the EAS remote store: `eas build:version:get -p android` before and after a production build → increments by one; `app.json` has no `versionCode` or `buildNumber` → value sourcing (remote versions)
- [ ] Update channel comes from the profile: `eas build:list` shows `preview` builds on channel `preview` and production builds on `production` → value sourcing (channel)
- [ ] iOS submit targets the right app: `submit.production.ios.ascAppId` in `eas.json` matches the App Store Connect app's Apple ID → value sourcing (ascAppId)

## Acceptance-criteria coverage

- AC-1 · cat app.json, project:info · AC-2 · dev client hot reload · AC-3a · Android APK · AC-3b · iOS ad hoc · AC-4 · two production builds · AC-5 · env:list, env:pull, APK search · AC-6 · env:delete build, script runs, unit test · AC-7 · update on second launch, prebuild config · AC-8 · fingerprint:compare · AC-9 · PostHog `app_channel`, unit test · AC-10 · prebuild config · AC-11 · `build:prod` submit · AC-12 · ls-files, check-ignore, outside account · AC-13 · scripts · AC-14 · store checklist
