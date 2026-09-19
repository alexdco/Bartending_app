# 0023. Bartender Mode on/off toggle

## Summary

This adds a real on/off switch for Bartender Mode, the professional bartending workflow (Service screen, Quick Build, bar management). Today Bartender Mode is always available to everyone; this lets a user turn it off from their account menu, which hides its navigation entry and blocks its routes until they turn it back on. The setting is stored per user in Supabase, so it follows them across devices and between the web and mobile apps.

## Requirements

**User stories**:
- As a user who only wants the recipe browsing experience, I want to turn off Bartender Mode so its navigation entry and routes stop appearing.
- As a user who turned Bartender Mode off, I want to turn it back on and pick up exactly where I left off (same bar membership, same bar data).
- As a user on two devices, I want my Bartender Mode preference to be the same on both without setting it twice.

**Acceptance criteria**:
- **AC-1**: A new boolean preference, `bartender_mode_enabled`, is stored per user, defaults to `true`, and is readable and writable from both `apps/web` and `apps/mobile` through one shared function in `packages/shared`.
- **AC-2**: On web, both signed-in account menus (the desktop dropdown `NavBadge` and the mobile-viewport drawer `DrawerAccountSection`, both in `site-nav.tsx`) show a Bartender Mode item that reflects the current value and flips it on click. Web's Service link is one entry in the shared `navLinks` array (`site-nav.tsx`); it gets a `requiresBartenderMode: true` flag there so both menus and the nav bar filter it from one place, never two separate checks.
- **AC-3**: On mobile, the signed-in account modal (`AccountMenu` in `app-tabs.tsx`, placed between "Account" and "Sign out") and the Account screen (`account.tsx`) each show a Bartender Mode row (label + `Switch`) that reflects the current value and flips it on tap.
- **AC-4**: When `bartender_mode_enabled` is `false`, the web "Service" nav link is not rendered (filtered via `requiresBartenderMode`), and visiting any route under `apps/web/src/app/[locale]/service/` redirects to the current locale's home (`useRouter().replace("/")` from `@/i18n/navigation`, which prefixes the active locale, not a bare `next/navigation` redirect that would drop it), except the invite-accept route (see AC-10).
- **AC-5**: When `bartender_mode_enabled` is `false`, the mobile Service tab is not rendered in the tab bar, and a deep link or stale navigation state landing on any of `service.tsx`, `bartender-search.tsx`, `bartender-build/[kind]/[id].tsx`, `bar-invite.tsx`, `bar-recipe-form.tsx` redirects to the home tab (`router.replace("/")`), except `bar-invite-accept.tsx` (see AC-10). Mobile has no `[locale]` route segment, so this list is the full route set, not a `service/*` prefix pattern.
- **AC-6**: Turning Bartender Mode off does not delete or modify any `bar_members` row, any `bar_*` table data, the persisted `currentBarId` (web `localStorage` / mobile `AsyncStorage`, per `current-bar-storage.ts`), or the persisted TanStack Query cache; turning it back on restores the exact same bar membership, data, and current-bar selection with no re-join needed. Only sign-out or a user change clears that cache, unchanged from the umbrella's existing shared-terminal contract.
- **AC-7**: While the preference is still loading, the nav link/tab renders optimistically as if `true` (avoiding a flicker on every load). The `service/*` route guard itself renders nothing (not the Service shell) until `useProfile()` resolves, so a disabled user does not briefly mount the Service screen and fire its bar queries before being redirected.
- **AC-8**: If the toggle write fails (network error, RLS denial), the displayed toggle silently reverts to its last known value on the next `useProfile()` refetch, matching the existing optimistic-rollback pattern for `theme` in `apps/web/src/auth/use-preferences.ts` (no inline error message; this class of preference toggle has never shown one).
- **AC-9**: Reading and writing `bartender_mode_enabled` requires a linked (non-anonymous) account, matching where the toggle UI actually lives (both web account menus and the mobile account modal only render when `isLinked`). An anonymous session always behaves as `true` (Bartender Mode fully available), since there is no UI for a guest to change it and an anonymous row would not survive linking anyway.
- **AC-10**: Successfully accepting a bar invite (web `/service/invite`, mobile `bar-invite-accept.tsx`) sets `bartender_mode_enabled` to `true` for that user, and the invite-accept route itself is exempt from the AC-4/AC-5 redirect guard regardless of the current value, so a disabled user can still follow an invite link a coworker sent them.

## Decision

**Chosen option**: add `bartender_mode_enabled` to the existing `user_preferences` table, following the same column scoped read/write pattern already used for `theme` and `locale`.

No new table, no new RLS policy shape, no new sync mechanism: `user_preferences` already is the project's per-user, cross-device preference store (spec 0008), already allows both anonymous and linked sessions to read and write their own row, and already has the exact column-scoped upsert pattern (`updateLocale`, `updateDisplayName` in `packages/shared/src/preferences.ts`) this needs. Building a separate mechanism for one boolean would duplicate infrastructure that already does this job.

## Feature design

**Data model sketch**:
- `user_preferences.bartender_mode_enabled boolean not null default true`
- No new tables, no new foreign keys, no new indexes. Existing RLS policies on `user_preferences` (`select`/`insert`/`update` scoped to `auth.uid() = user_id`) already cover the new column; no policy change needed.

**API surface**:

No new HTTP endpoints. Reads and writes go through the existing Supabase client directly, same as `theme`/`locale`.

| Function | Layer | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `fetchProfile` (extended) | `packages/shared/src/preferences.ts` | none (reads current session) | adds `bartenderModeEnabled: boolean` to the existing `Profile` shape | any session (anon reads back `true` always; see AC-9) | none new |
| `updateBartenderModeEnabled` | `packages/shared/src/preferences.ts` | `enabled: boolean` | `{ data: { bartenderModeEnabled: boolean }, error: null } \| { data: null, error: UpdateBartenderModeError }` | linked session only | `no_session`, `request_failed` |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Render account menu toggle (web `NavBadge`/`DrawerAccountSection`, mobile `AccountMenu`/`account.tsx`) | Current on/off state | `fetchProfile`'s `bartenderModeEnabled` field, via the shared `useProfile()` query both apps already use for `theme`/`locale`; label text from a new `menu.bartenderMode` i18n key added to all four catalogs (`apps/web/messages/{en,es}.json`, `apps/mobile/src/i18n/locales/{en,es}.json`) |
| Web nav render | Whether to show the Service link | `navLinks` entry's `requiresBartenderMode: true` flag combined with `bartenderModeEnabled`, filtered once where `navLinks` is defined |
| Web `service/*` route guard | Whether to allow the route, and the redirect target | `bartenderModeEnabled` via `useProfile()`, read in a new `apps/web/src/app/[locale]/service/layout.tsx` client component; redirect target is `useRouter().replace("/")` from `@/i18n/navigation` |
| Mobile tab bar render, route guard | Whether to show the tab / allow the route | Same `bartenderModeEnabled` value via `useProfile()`, read once in `apps/mobile/src/app/_layout.tsx` (or a shared `useBartenderModeGuard()` hook it calls) covering all six Bartender Mode routes listed in AC-5 |
| Toggle write | Persisted new value | The toggle's own on-click/on-tap handler passes the flipped boolean to `updateBartenderModeEnabled` |
| Failed toggle write | Reverted displayed value | TanStack Query's cached prior value, restored on refetch after the mutation errors (AC-8's silent revert) |
| Invite accept auto-enable | New `bartender_mode_enabled` value | Hardcoded `true`, written by the invite-accept mutation's success handler (AC-10) |

**Key invariants**:
- `bartender_mode_enabled` never gates or alters `bar_members`, any `bar_*` row, `currentBarId`, or the persisted query cache; it is purely a client side access/visibility gate (AC-6).
- The column is never null; `add column ... not null default true` backfills every existing row to `true` in the same statement, no separate backfill step.
- The invite-accept route is always reachable regardless of `bartender_mode_enabled` (AC-10); it is the one exemption to the route guard.

**Security model**:
- Read/write requires a linked session, enforced the same way the toggle UI itself is already gated (`isLinked`); RLS is unchanged (`(select auth.uid()) = user_id`, already safe for either session type, but the application layer restricts writes to linked sessions per AC-9). No new security surface.

**Configuration required**: none. No new env vars, no new secrets.

**Critical test scenarios**:
- Happy path: signed-in user opens the web account dropdown, clicks Bartender Mode to turn it off, the Service nav link disappears from both `NavBadge` and `DrawerAccountSection`, and any `service/*` route redirects to the locale home; turning it back on restores the link and their bar (including `currentBarId`) exactly as it was, verifies **AC-2, AC-4, AC-6**.
- Happy path (mobile): user taps Bartender Mode off in the account modal, the Service tab disappears from the tab bar; a deep link to any of the six Bartender Mode routes redirects to home, verifies **AC-3, AC-5**.
- Cross-device: user turns it off on web, then opens mobile signed into the same account and sees it already off, verifies **AC-1**.
- Failure case: the toggle write fails (simulated network error); the UI silently reverts to the prior state on refetch, the stored value is unchanged, verifies **AC-8**.
- Loading state: on first load before `useProfile()` resolves, the nav link/tab is visible optimistically, but a direct hit on a `service/*` route while still loading renders nothing rather than the Service shell; once the query resolves, both correct, verifies **AC-7**.
- Auth/permission: an anonymous (guest) session sees Bartender Mode as always on with no toggle UI available (there is none in the signed-out menus); a linked session can flip it and it persists across devices, verifies **AC-9**.
- Invite exemption: a linked user with Bartender Mode off follows a bar invite link, reaches the invite-accept screen without being redirected, and accepting it flips their preference to `true`, verifies **AC-10**.

## Build plan

1. Migration: `alter table user_preferences add column bartender_mode_enabled boolean not null default true` (single statement, backfills existing rows), satisfies **AC-1**, **AC-6**.
2. `packages/shared/src/preferences.ts`: add `bartender_mode_enabled` to `fetchProfile`'s `.select(...)` string and the `Profile` shape (adding the column to the select list is easy to miss since it isn't `select *`), add `updateBartenderModeEnabled` following the `updateLocale` column-scoped upsert pattern but requiring a linked session (mirrors `updateDisplayName`'s `no_session` check), satisfies **AC-1**, **AC-8**, **AC-9**.
3. Regenerate `packages/shared/src/database.types.ts` for the new column.
4. Add `menu.bartenderMode` (and English/Spanish copy) to all four i18n catalogs: `apps/web/messages/{en,es}.json`, `apps/mobile/src/i18n/locales/{en,es}.json`.
5. Web: add a `requiresBartenderMode: true` flag to the Service entry in `navLinks` (`site-nav.tsx`) and filter on it wherever `navLinks` is rendered; add the Bartender Mode toggle item to both `NavBadge` and `DrawerAccountSection`, satisfies **AC-2**, **AC-4**, **AC-7**, **AC-8**.
6. Web: add `apps/web/src/app/[locale]/service/layout.tsx`, a client component reading `useProfile()` that renders `null` while loading and redirects via `@/i18n/navigation`'s `useRouter().replace("/")` once resolved `false`; exempt nothing at this layer since `/service/invite` needs its own accept-time enable (task 9), satisfies **AC-4**, **AC-7**.
7. Mobile: add the Bartender Mode row (label + `Switch`) to `AccountMenu` in `app-tabs.tsx` (between Account and Sign out) and to the Account screen (`account.tsx`), satisfies **AC-3**, **AC-7**, **AC-8**.
8. Mobile: conditionally render the Service `NativeTabs.Trigger`, and add a guard in `apps/mobile/src/app/_layout.tsx` (or a shared `useBartenderModeGuard()` hook) redirecting `service.tsx`, `bartender-search.tsx`, `bartender-build/[kind]/[id].tsx`, `bar-invite.tsx`, `bar-recipe-form.tsx` to home when disabled, excluding `bar-invite-accept.tsx`, satisfies **AC-5**, **AC-7**.
9. Both platforms: on successful bar invite acceptance, call `updateBartenderModeEnabled(true)` in the mutation's success handler; exempt the invite-accept route from both route guards (web layout, mobile guard), satisfies **AC-10**.
10. Cross platform parity check: confirm both apps read the same field, same default, same redirect behavior, satisfies **AC-1** through **AC-10**.

## Consequences

**Positive**:
- Users who only want the recipe/pantry experience can hide the entire Bartender Mode surface without losing their bar data if they turn it back on later.
- Reuses `user_preferences` with no new table, no new RLS surface, minimal new code.

**Negative / tradeoffs**:
- Two more route guard implementations to maintain (web layout/redirect, mobile navigation guard), one per platform, matching the umbrella's existing pattern of platform specific glue around shared data, each with an invite-accept exemption to keep straight.
- A user could toggle it off mid-shift by accident and lose the nav entry; recovery is one tap back in the account menu, judged acceptable given AC-6 guarantees no data loss.
- Anonymous (guest) sessions never see the toggle and always behave as enabled; this is a narrower AC-9 than originally scoped, chosen because no signed-out UI exists to expose it and an anonymous value would not survive linking anyway.

**Neutral**:
- No change to `bar_*` tables, RLS, or the independent bartender mode UI (spec 0023's fourth child); this only adds a visibility/access gate in front of what those already built.
- In-flight bar mutations (e.g. a pending recipe save) still complete server side even if the user toggles off and gets redirected mid-action; only the result UI is discarded, which is intentional and not treated as a failure case.

## Follow-up

- [ ] No dedicated automated test exists yet for the redirect behavior on either platform; add one alongside the route guard implementation (tracked normally under `/test` per this project's workflow).
