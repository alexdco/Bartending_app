# Verify: Mobile friendly collapsible nav · spec 0019 · updated 2026-09-13

_Steps derived from spec 0019 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [ ] At a viewport under 768px, load the site → the header shows the logo and a single hamburger toggle only; no inline links or account badge → AC-1
- [ ] At 1280px width, load the site → header shows logo, all six inline links, and the account badge exactly as before this feature → AC-2
- [ ] Tap the hamburger at a narrow viewport → a full height drawer slides in from the right over a dimmed overlay, showing the six nav links in order then the account section (Sign in row when signed out, or avatar/initials + Account + Theme + Sign out when signed in) → AC-3
- [ ] While the drawer is open, the toggle icon shows an X instead of a hamburger → AC-4
- [ ] With the drawer open: click the X toggle → closes. Reopen, click the dimmed overlay → closes. Reopen, press Escape → closes. Reopen, click a nav link → drawer closes and the page navigates → AC-5
- [ ] Shrink the viewport height (or view on a small phone) so drawer content exceeds the viewport → the drawer itself stays full height and fixed, content scrolls internally → AC-6
- [ ] Open the drawer under 768px, then resize/rotate the viewport to 768px or above → drawer closes automatically with no overlay left behind → AC-7
- [ ] Keyboard only: Tab to the toggle, press Enter to open, Tab through every drawer control in order (links, Theme expand, its three options once expanded, Account, Sign out), Shift+Tab reverses, Escape closes and returns focus to the toggle → AC-8
- [ ] In the open drawer, tap "Theme" → the three options (Light/Dark/System) expand inline in the drawer's own flow, not a flyout submenu → AC-9

## Automated (Playwright, ad hoc — not part of the repo's test suite)

- [x] At 390×844, hamburger visible and exact "Home" inline link not visible → AC-1
- [x] At 1280×800, exact "Home" inline link visible and hamburger not visible → AC-2
- [x] Opening the drawer shows a dialog containing all six nav links (Home, Search, Pantry, Drink ideas, Popular, Favorites) and a "Sign in" row (signed out) → AC-3
- [x] Escape closes the open dialog → AC-5
- [x] Clicking the overlay (far left of viewport, outside the right-aligned panel) closes the open dialog → AC-5
- [x] Resizing from 390×844 to 1280×800 while the drawer is open closes it automatically → AC-7

## Value sourcing coverage

- [x] Drawer trigger visibility follows `--breakpoint-md` (768px, from `breakpoints.mobileNav`): confirmed hidden/shown correctly on both sides of the breakpoint above.
- [ ] Force-close on resize uses `window.matchMedia("(min-width: 768px)")`: confirmed via the automated resize check above; also worth a manual check of an actual device rotation (not just a programmatic viewport resize) since some mobile browsers fire resize/orientation events differently.
- [ ] Theme section values come from the existing `useTheme()` hook: manually confirm selecting each of Light/Dark/System in the drawer visibly changes the theme, matching what the desktop dropdown does.
- [ ] Account link / Sign in row source (`useSession().isLinked`): manually confirm both the signed-out ("Sign in" row) and signed-in (avatar/initials, Account, Sign out) states render correctly in the drawer.

## Acceptance-criteria coverage

- AC-1 … covered by the manual mobile-viewport check and the automated Playwright check.
- AC-2 … covered by the manual desktop-viewport check and the automated Playwright check.
- AC-3 … covered by the manual drawer-open check and the automated dialog-contents check.
- AC-4 … covered by the manual toggle-icon check (not automated).
- AC-5 … covered by the manual close-behavior checklist and the automated Escape/overlay-click checks.
- AC-6 … covered by the manual internal-scroll check (not automated; needs a real short viewport or long content).
- AC-7 … covered by the manual resize/rotate check and the automated resize check.
- AC-8 … covered by the manual keyboard-only walkthrough (not automated; no DOM testing tool in this repo, see spec's Follow-up).
- AC-9 … covered by the manual inline Theme expand check (not automated).
