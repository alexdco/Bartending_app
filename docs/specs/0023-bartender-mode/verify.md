# Verify: Bartender Mode on/off toggle · spec 0023 · updated 2026-09-18
_Steps derived from spec 0023-bartender-mode-toggle.md acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] Sign in as a linked user on web, open the account dropdown (`NavBadge`), click Bartender Mode → Service link disappears from the nav and the dropdown itself → AC-2, AC-4
- [ ] With Bartender Mode off, visit `/en/service` directly → redirected to `/en` (locale preserved) → AC-4
- [ ] Turn Bartender Mode back on from the dropdown → Service link reappears, visiting `/en/service` renders normally, the same bar/current-bar selection is intact → AC-4, AC-6
- [ ] Same flow in the mobile drawer's `DrawerAccountSection` toggle (resize to mobile viewport) → Service link disappears/reappears there too → AC-2
- [ ] On mobile, open the account modal (`AccountMenu`), toggle Bartender Mode off → Service tab disappears from the tab bar → AC-3, AC-5
- [ ] On mobile with Bartender Mode off, deep link or navigate to `service.tsx`, `bartender-search.tsx`, `bartender-build/[kind]/[id]`, `bar-invite.tsx`, `bar-recipe-form.tsx` → each redirects to home → AC-5
- [ ] Toggle Bartender Mode from the mobile Account screen row instead of the modal → same effect as AC-3
- [ ] Turn Bartender Mode off on web, then open mobile signed into the same account → mobile already shows it off (no toggle needed twice) → AC-1
- [ ] While `useProfile()` is still loading (throttle network / cold start), the nav link/tab shows optimistically as if enabled; a direct hit on a `service/*` route during that load renders nothing, not the Service shell → AC-7
- [ ] As an anonymous (guest) session, confirm there is no Bartender Mode toggle UI anywhere and Service behaves as fully enabled → AC-9
- [ ] As a linked user with Bartender Mode off, open a bar invite link (`/service/invite` on web, `bar-invite-accept.tsx` on mobile) → reach the accept screen without being redirected; after accepting, Bartender Mode is now on → AC-10

## Commands
- [ ] `pnpm --filter @bartendingapp/shared typecheck` → passes → AC-1
- [ ] `pnpm --filter web typecheck` && `pnpm --filter web lint` && `pnpm --filter web build` → all pass, full static generation succeeds → AC-1 through AC-10
- [ ] `pnpm --filter mobile typecheck` && `pnpm --filter mobile lint` → both pass → AC-1 through AC-10
- [ ] `pnpm test` → existing vitest suite passes with no regressions → AC-1
- [ ] Simulate a failed toggle write (throttle/offline network) → the toggle visually reverts to its prior value on the next refetch, no inline error shown → AC-8

## Acceptance-criteria coverage
- AC-1 (shared column, readable/writable both platforms) · covered by the cross-device step and the shared typecheck command
- AC-2 (web account menus) · covered by the `NavBadge`/`DrawerAccountSection` steps
- AC-3 (mobile account modal + screen) · covered by the `AccountMenu`/account screen steps
- AC-4 (web nav filter + route redirect) · covered by the nav link and direct-route-hit steps
- AC-5 (mobile tab + route redirect) · covered by the tab bar and deep-link steps
- AC-6 (no bar data loss) · covered by the toggle-back-on step
- AC-7 (optimistic loading, guard renders nothing) · covered by the loading-state step
- AC-8 (silent revert on failed write) · covered by the failure-case command
- AC-9 (linked-only read/write, anonymous always true) · covered by the guest session step
- AC-10 (invite-accept exemption + auto-enable) · covered by the invite exemption step
