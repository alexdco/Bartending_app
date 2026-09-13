# 0019. Mobile friendly collapsible nav

**Date**: 2026-09-13
**Status**: In Progress

## Summary

The web app's top navigation bar today is one row that never adapts to a narrow screen: the logo, six links, and the account badge all sit side by side with no wrapping. This spec collapses that row into a single toggle button (a hamburger icon in the upper right) on narrow (phone width) screens, which opens a full height side panel (a "drawer") holding the nav links and the account menu. Desktop keeps today's layout exactly as it is. It also adds two small values (a breakpoint and an animation duration) to the shared design token file so both apps can reuse them later.

See [rationale.md](rationale.md) for context, options considered, and the decision rationale.

## Requirements

**User stories**:
- As a user on a phone width browser, I want the nav to collapse behind a single toggle so the header stays usable and uncluttered.
- As a user on a phone width browser, I want to open a side panel from that toggle to reach every nav link and my account menu.
- As a desktop user, I want the nav to look and behave exactly as it does today.
- As a keyboard user on a narrow viewport, I want to open, navigate, and close the drawer without a mouse or touch.

**Acceptance criteria**:
- **AC-1**: At viewport widths below 768px (the `md` breakpoint), the nav shows the logo and a single hamburger toggle button in the upper right; the six nav links and the account badge are not directly visible in the header.
- **AC-2**: At 768px and above, the nav renders exactly as it does today (logo, inline links, account badge in the header); nothing about the desktop layout changes.
- **AC-3**: Tapping or activating the toggle opens a full height panel that slides in from the right over a dimmed overlay, containing, in order: the six nav links (with the same active link accent styling used today) and the account section (avatar/initials or a signed out "Sign in" row, an Account link, an expandable Theme section with the same Light/Dark/System choices, and Sign out when signed in).
- **AC-4**: While open, the toggle's icon shows an X instead of a hamburger.
- **AC-5**: The drawer closes when: the toggle (now an X) is activated again, the dimmed overlay is clicked or tapped, the Escape key is pressed, or a nav link inside the drawer is activated (which also navigates).
- **AC-6**: The drawer is a fixed full height panel; if its content is ever taller than the viewport, it scrolls internally rather than resizing the panel.
- **AC-7**: If the viewport is resized or rotated from below 768px to 768px or above while the drawer is open, the drawer closes automatically.
- **AC-8**: The toggle and every control inside the open drawer (links, the Theme expand control, its three options, Sign out) are reachable and operable with keyboard alone: Tab reaches the toggle, Enter or Space opens it, Tab moves through the drawer's controls in order, Shift+Tab reverses, and Escape closes it and returns focus to the toggle.
- **AC-9**: The Theme choice inside the drawer is an inline expandable section (tap "Theme" to reveal the three options in the drawer's own flow), not a nested flyout submenu.

## Decision

**Chosen option**: Option 2: Radix Dialog for the drawer, Tailwind breakpoint for the layout switch

Below 768px, `SiteNav` renders a hamburger toggle that opens a `radix-ui` `Dialog` styled as a right side sliding drawer holding the nav links and the account content; at 768px and above, today's inline layout is unchanged.

## Feature design

**Design tokens added to `packages/shared/src/tokens.ts`** (per the engineer's decision to keep it the single source of truth for both apps):
- `breakpoints.mobileNav = 768` (pixels; the trigger width for the collapsed layout, matching Tailwind's default `md`, which this value replaces rather than duplicates, see Component changes)
- A drawer radius: reuse the existing `radii.large` (20), applied to the panel's two left corners only (a full height right edge panel keeps its right corners square).
- `motion.drawerDurationMs = 200` (milliseconds; the slide in/out transition duration, the first entry in a new `motion` token group so future animated components have a value to reuse)

**Wiring the new tokens into CSS (`apps/web/scripts/generate-theme-css.mjs`)**: Tailwind v4 here has no JS config file, so a token is only reachable from a class once this generator emits it. Add two lines to the generator's `@theme` block: `--breakpoint-md: ${breakpoints.mobileNav}px;` (overriding Tailwind's own default `md`, which is already 768px, so this makes `breakpoints.mobileNav` the single source of truth instead of a second, parallel 768 value) and `--duration-drawer: ${motion.drawerDurationMs}ms;`. The component then uses plain `md:` classes for the breakpoint switch and a `duration-drawer` class (or the equivalent inline style reading the CSS variable) for the transition, with no new custom variant name to remember.

**Component changes**:
- `apps/web/src/components/site-nav.tsx`: add a `MobileNavToggle` (hamburger/X button) and a `MobileNavDrawer` (Radix `Dialog.Root`/`Dialog.Portal`/`Dialog.Overlay`/`Dialog.Content`, styled as a right side panel, `w-[min(320px,85vw)]`, `inset-y-0 right-0`, `overflow-y: auto`, using the wired `duration-drawer` transition and `radii.large` on its two left corners). Layout switch is **CSS visibility only** (`flex md:hidden` on the toggle/drawer trigger wrapper, `hidden md:flex` on the existing inline link row and `NavBadge`), never a JS conditional render; the drawer's `Dialog.Root` always mounts, so nothing here relies on an unmount to reset state (see the resize listener below, which is what actually satisfies AC-7).
  - Icon: inline SVG, 18×18, `viewBox="0 0 24 24"`, `fill="currentColor"`/`aria-hidden="true"`, matching the existing `PersonIcon`'s convention; hamburger (three horizontal lines) swaps to an X path when open.
  - Toggle accessibility: `aria-label` reads `"Open navigation"` when closed and `"Close navigation"` when open; Radix `Dialog.Trigger` supplies `aria-expanded`/`aria-controls` automatically. No new focus ring styling needed, the project's existing global `:focus-visible` outline (`apps/web/src/app/globals.css`) already covers it.
  - `Dialog.Content` includes a `Dialog.Title` wrapped in Radix's `VisuallyHidden` reading `"Navigation"` (Radix requires a title for its accessibility tree; without one it both warns and degrades screen reader support).
  - Both `Dialog.Overlay` and `Dialog.Content` use `z-50`; no conflict with the existing `DropdownMenu.Portal` (`z-50` equivalent stacking is fine here) because the two are breakpoint exclusive and never open at the same time.
  - Animation: `data-[state=open]` animates `translateX` from 100% to 0 with `ease-out`; `data-[state=closed]` reverses with `ease-in`; both wrapped in `@media (prefers-reduced-motion: reduce) { transition: none }`.
- The drawer's link list reuses the existing `navLinks` array verbatim, in the same order as the desktop row, with the same `usePathname()`-based active check; the drawer's active treatment is a left aligned full width row using `bg-surface-selected` (a pill reads oddly at full drawer width, unlike the desktop nav's compact pill).
- The drawer's account section mirrors every entry the desktop `NavBadge` dropdown offers: the **Account** link, the Theme section, and Sign out when signed in (or a labelled "Sign in" row linking to `/account` when signed out); the desktop dropdown's `Account` link was previously omitted from this section by oversight and is included here so the drawer has full parity, per the Key invariants below. During `isLoading`, the account section renders nothing, matching `NavBadge`'s current behavior.
- The drawer's Theme choice renders as an inline expandable section (a local `useState` boolean, scoped inside `Dialog.Content` so it resets to collapsed every time the drawer closes and reopens, since Radix unmounts `Dialog.Content` by default with no `forceMount`) showing the three options directly in the drawer's flow, instead of `DropdownMenu.Sub`, per AC-9.
- **Theme state sharing**: `useTheme()` (`apps/web/src/theme/use-theme.ts`) holds its `preference` in a local `useState` per call, so the drawer's own call and the desktop `NavBadge`'s call are two independent instances that do not observe each other's updates, and its initializer reads `localStorage` directly, which does not run during server rendering (`typeof window === "undefined"` returns `"system"`) and can disagree with a real stored preference on first client render. Because the toggle/drawer and the desktop nav are already breakpoint exclusive (never both visible at once), this drift is not user visible in this feature: whichever one is showing is the one the user is looking at. Out of scope here; flagged in Follow-up as a real gap for whichever future feature adds a second concurrently visible theme control.
- Each nav link inside the drawer closes the dialog on click (`onClick` calling the dialog's `onOpenChange(false)`), and an effect watching `usePathname()` also closes the drawer on any pathname change (covers back/forward navigation and any programmatic route change the link's own `onClick` would miss), satisfying AC-5's "closes after tapping a nav link" case.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Render drawer toggle | Whether the toggle/drawer trigger is visible at all | CSS visibility (`flex md:hidden`), reading the wired `--breakpoint-md` value; the `Dialog.Root` always mounts, this only hides the trigger and the panel's would be trigger point on desktop |
| Open/close the drawer | Current open/closed boolean | Local component state (`Dialog`'s own `open`/`onOpenChange`), no persistence needed |
| Force close on resize | Whether the viewport just crossed back to desktop width | `window.matchMedia("(min-width: 768px)")` (the literal value mirrors `breakpoints.mobileNav`, not hand typed twice) plus its `change` event, closing the dialog state when it now matches |
| Theme section values | The three theme choices and the current selection | Existing `useTheme()` hook (`preference`, `setTheme`); see the Theme state sharing note above for the known limitation of two independent instances |
| Active link styling in the drawer | Which link is visually marked active | Existing `usePathname()` comparison logic, reused verbatim from today's inline nav |
| Account link/Sign in row in the drawer | Which of the two renders, and its destination | Existing `useSession().isLinked`, same source as today's `NavBadge`; both route to `/account` |

**Key invariants**:
- The drawer and the inline desktop nav are never both interactive at once; the CSS breakpoint plus the resize force close guarantee exactly one is reachable by tab order at a time.
- Every interactive element the desktop nav offers (six links, Account, Theme with all three options, Sign out) is also reachable from the mobile drawer; nothing is desktop only.

**Security model**:
Unaffected. No new data access; the drawer renders the same session/profile data as today's `NavBadge`, gated by the same `useSession`/`useProfile` hooks.

**Critical test scenarios** (this repo's test setup runs Vitest in the default `node` environment with no DOM, no `jsdom`/`happy-dom`, and no `@testing-library/react` — `test-preferences.json` records `e2eTool: "none"` — so none of these can run as an automated component/DOM test today; each is manual verification in a real browser unless the Build plan's tooling step is taken):
- Happy path: at a viewport under 768px, tap the hamburger, see the drawer slide in with all six links and the account section, tap a link, and the drawer closes and navigates, verifies **AC-1, AC-3, AC-5**.
- Resize while open: open the drawer under 768px, then resize/rotate to 768px or above, and confirm the drawer closes automatically with no orphaned overlay, verifies **AC-7**.
- Keyboard only: Tab to the toggle, Enter to open, Tab through every drawer control including expanding Theme and reaching all three options, Account, and Sign out, Escape to close and return focus to the toggle, verifies **AC-8, AC-9**.
- Desktop unaffected: at 768px and above, confirm the header matches today's inline layout pixel for pixel with no toggle visible, verifies **AC-2**.

## Build plan

1. [x] Add `breakpoints.mobileNav` (768) and `motion.drawerDurationMs` (200) to `packages/shared/src/tokens.ts`, satisfies **AC-1, AC-7**
2. [x] Wire both new tokens into `apps/web/scripts/generate-theme-css.mjs`'s `@theme` block (`--breakpoint-md` overridden from `breakpoints.mobileNav`, plus a new `--duration-drawer` from `motion.drawerDurationMs`), so plain `md:` classes and a `duration-drawer` class read the token values instead of Tailwind's untracked defaults, satisfies **AC-1, AC-2**
3. [x] Add the `radix-ui` `Dialog` based `MobileNavDrawer` and `MobileNavToggle` components in `apps/web/src/components/site-nav.tsx` (hamburger/X icon, `aria-label`/`aria-expanded` via `Dialog.Trigger`, a hidden `Dialog.Title`, the drawer's link list reusing `navLinks` verbatim, an inline expandable Theme section, and the full account section including Account/Sign in, Theme, and Sign out), reusing `useSession`, `useProfile`, `useTheme`, `useSignOut` from the existing `NavBadge`, satisfies **AC-3, AC-4, AC-9**
4. [x] Apply the `md:` visibility split (`flex md:hidden` on the toggle, `hidden md:flex` on the existing inline link row and `NavBadge`) with no other change to the existing desktop markup; the `Dialog.Root` always mounts, only its trigger/visible surface is breakpoint gated, satisfies **AC-1, AC-2**
5. [x] Wire drawer close behavior: overlay click, Escape (both free from Radix `Dialog`), the toggle acting as a close control when open, each nav link closing the dialog on click, and a `usePathname()` effect that also closes it on any route change, satisfies **AC-5**
6. [x] Add a `window.matchMedia("(min-width: 768px)")` `change` listener that force closes the drawer's open state when the viewport crosses back to desktop width, satisfies **AC-7**
7. [x] Constrain the drawer panel to full viewport height (`w-[min(320px,85vw)]`, `inset-y-0 right-0`) with internal scroll (`overflow-y: auto`) for overflow content, and the slide transition with `prefers-reduced-motion` handling, satisfies **AC-6** — implemented as plain CSS transitions (`.drawer-overlay`/`.drawer-content` in `globals.css`) reading `--duration-drawer` rather than a Tailwind animate plugin class, since none is installed in this repo
8. [ ] Manual verification pass in a real browser confirming Tab order, Enter/Space activation, Shift+Tab, and Escape across the toggle and every drawer control (Account, Theme expand and its three options, Sign out); this repo has no DOM testing setup (`node` environment Vitest only, no `jsdom`/testing library, `e2eTool: "none"`) so this cannot be automated without first taking on the Follow-up item below, satisfies **AC-8** — automated Playwright pass confirmed open/close via toggle, overlay click, Escape, and viewport resize; full keyboard Tab-order walk through every control still needs a manual pass

## Consequences

**Positive**:
- Mobile web visitors get a usable, uncluttered header instead of an overflowing or wrapping row.
- The project gains its first breakpoint and motion tokens, giving the next responsive or animated component a place to start instead of a new magic number.
- Reuses the existing `radix-ui` dependency rather than adding a new one.

**Negative / tradeoffs**:
- The account section's content (avatar state, Account link, Theme choice, Sign out) is now rendered twice, once in the desktop `DropdownMenu` and once in the drawer's inline layout, a small duplication until a shared "account menu content" component is worth extracting.
- `useTheme()`'s two independent instances (desktop and drawer) do not share state; harmless today because the two are never visible at once, but a real constraint the next feature that needs a concurrently visible theme control must resolve first.
- The resize `matchMedia` breakpoint string (`768px`) is generated from `breakpoints.mobileNav`, not hand typed twice, but the CSS generator step (`generate-theme-css.mjs`) must be kept in the loop for any future change to that token, or the JS listener and the CSS breakpoint will silently drift apart.

**Neutral**:
- No data model or backend change; this is a web only, presentation layer feature.
- Mobile app (`apps/mobile`) is untouched; it keeps its existing tab bar from spec 0018.

## Follow-up

- [ ] Consider extracting the account menu's shared content (avatar/initials state, Account link, Theme choice, Sign out) into one component consumed by both the desktop `DropdownMenu` and the mobile drawer, to remove the duplication noted in Consequences.
- [ ] Once a second animated component needs a transition duration, confirm whether `motion.drawerDurationMs` should generalize into a small duration scale (e.g. fast/base/slow) rather than staying a single named value.
- [ ] `useTheme()` holds preference in a per call `useState` with no shared source of truth across instances. Not a problem for this feature (its two call sites are never visible at the same time), but the next feature that needs two concurrently visible theme controls should lift it into a context/provider or `useSyncExternalStore` first.
- [ ] This repo has no DOM/component testing setup (Vitest runs in the default `node` environment, `*.test.ts` only, `e2eTool: "none"` per `test-preferences.json`). Build plan step 8's keyboard pass, and any future automated coverage of this drawer, needs `jsdom`/`happy-dom` plus `@testing-library/react` installed and the Vitest include glob widened to `.tsx`, or an e2e tool chosen, before it can run as anything but manual verification. Worth a decision of its own if the project wants component level UI tests going forward, not just this one drawer.
