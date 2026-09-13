# 0019. Mobile friendly collapsible nav — rationale

## Context

The nav lives in `apps/web/src/components/site-nav.tsx` as a single, non wrapping flex row: the logo and six links (Home, Search, Pantry, Drink ideas, Popular, Favorites) on the left, an account badge (a signed out person icon, or a signed in initials avatar opening a dropdown with Account, Theme, and Sign out) on the right. Nothing in the component or in `packages/shared/src/tokens.ts` changes with viewport width. On a phone width screen, this row already has more content than fits comfortably; it either wraps awkwardly or forces horizontal scroll, and there is no fallback to a compact layout.

`packages/shared/src/tokens.ts` is documented in `AGENTS.md` as the single source of truth for styling values consumed by both the web and mobile apps, but today holds no breakpoint tokens and no animation or transition duration tokens. The web app already depends on `radix-ui` (used for the existing account dropdown), so a dependency capable of building an accessible, keyboard operable overlay is already present. The mobile app is unaffected: it has its own native tab bar (built in spec 0018) and is out of scope here.

## Options considered

### Option 1: CSS only responsive layout (hide/show with Tailwind breakpoint classes, no new dependency)

Keep the current markup, add Tailwind `md:` classes to hide the inline links/badge below 768px and show a hamburger button instead; the drawer itself would be hand built with plain markup, manual `useState` for open/closed, a manual overlay `div`, and hand written focus trap and Escape handling.

**Pros**:
- No new runtime dependency beyond what a drawer needs anyway.

**Cons**:
- Focus trapping, Escape handling, and background scroll locking are each easy to get subtly wrong (focus escaping the drawer, scroll leaking behind the overlay), and this is exactly what a well tested primitive already solves.

### Option 2: Radix Dialog for the drawer, Tailwind breakpoint for the layout switch

Use the `md:` breakpoint (768px) to switch between the current inline row and a header that shows only the toggle. The toggle opens a `radix-ui` `Dialog` styled as a right side sliding panel; the account badge's existing content (avatar/initials, Theme, Sign out) is reused inside the drawer instead of the current `DropdownMenu`, with the Theme radio group rendered as an inline expandable section instead of a nested `DropdownMenu.Sub`.

**Pros**:
- `radix-ui` is already a project dependency (used today for the account dropdown), so this reuses a library already in the stack rather than adding one.
- Radix Dialog provides focus trapping, Escape to close, overlay click to close, and scroll locking out of the box, covering AC-5 and AC-8 without hand written accessibility code.

**Cons**:
- The drawer's internal content (link list, expandable Theme section, Sign out) needs new markup separate from the existing `DropdownMenu` content, since a `DropdownMenu` is not the right primitive for a persistent panel; this is a small amount of duplication until a later refactor, if any, unifies them.

## Rationale

Radix is already the project's answer to accessible overlay UI (the current account dropdown proves this), so extending it to the drawer keeps one interaction library in the stack instead of hand rolling a second one. The engineer confirmed keyboard operability (AC-8) is a hard requirement, and Radix Dialog satisfies focus trapping and Escape handling by construction, which is exactly the class of bug (focus escaping an overlay, a background that keeps scrolling) that is easy to introduce and hard to notice when writing it by hand. The small duplication this creates, a second rendering of the account section's contents inside the drawer, is a low cost the engineer accepted over hand written accessibility code, since `AGENTS.md` has no existing shared "account menu content" abstraction to reuse yet.
