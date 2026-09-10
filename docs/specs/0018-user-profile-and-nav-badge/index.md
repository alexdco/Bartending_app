# 0018. User profile and nav badge

**Date**: 2026-09-10
**Status**: In Progress

## Summary

Right now a signed in user looks exactly like a guest everywhere in the app. This spec adds an optional name to a user's profile and shows it as a small initials badge in the top right of the web navigation bar, and in a new thin header bar above the tab bar on mobile (mobile's tab icons cannot show dynamic text). A guest sees a neutral person icon instead. The name can be set at sign up or later from the account page.

## Requirements

**User stories**:
- As a signed in user, I want to see my initials in the nav so I know at a glance that I am signed in.
- As a signed in user, I want to set or change my display name from the account page so the badge reflects how I want to be identified.
- As a guest, I want a neutral, unmistakable visual cue that I am not signed in.

**Acceptance criteria**:
- **AC-1**: A signed in user with a name set sees a badge showing initials derived from their name (exact algorithm below) in the top right of the web nav and in a new header bar above the mobile tab bar.
- **AC-2**: A signed in user with no name set sees a badge showing the uppercased first letter of their email in the same spot.
- **AC-3**: A guest (anonymous session, `is_anonymous` true) sees a neutral person icon in the same spot, not a badge.
- **AC-4**: The sign up form includes an optional name field; leaving it blank does not block sign up.
- **AC-5**: The account page has a name field the user can set, edit, or clear at any time while signed in, with a live initials preview next to it.
- **AC-6**: Saving an empty name (after trimming whitespace) clears the stored name, and the badge falls back to the email initial rule (AC-2).
- **AC-7**: A name outside 1 to 50 characters after trimming is rejected with an inline validation message before any save attempt.
- **AC-8**: If saving the name fails (network or server error), the entered text stays in the field, an inline error message appears, and the user can retry without re-typing.
- **AC-9**: The web badge and the mobile header badge are both tappable and navigate to the account page.
- **AC-10**: A signed in user cannot read or write another signed in user's name; only the owner can set their own (enforced even though the caller is authenticated, since RLS scopes by row owner, not just by "authenticated").
- **AC-11**: A signed in user with no name and no email on the session (a state the app does not otherwise create, but the badge must not blank or crash if it occurs) sees a literal "?" placeholder in the badge, not a blank or broken render.

## Decision

**Chosen option**: Option 1: Add `display_name` to the existing `user_preferences` table.

Add a nullable `display_name` column to `user_preferences`, reuse its existing owner scoped RLS, and surface it through the sign up form and the account page.

## Feature design

**Data model sketch**:

| Table | Column | Type | Nullable | Notes |
|---|---|---|---|---|
| `user_preferences` | `user_id` | uuid | no | existing, PK, FK to `auth.users` cascade |
| `user_preferences` | `theme` | text | no | existing |
| `user_preferences` | `display_name` | text | yes | new; when set, 1 to 50 characters after trimming, enforced by a check constraint; null means no name set |
| `user_preferences` | `updated_at` | timestamptz | no | existing |

No new table, no RLS policy change (existing owner scoped `SELECT`/`INSERT`/`UPDATE` policies on `user_preferences` are column agnostic).

**API surface**:

| Action | Inputs | Outputs | Auth | Key errors |
|---|---|---|---|---|
| Set display name (column scoped update into `user_preferences`, not a full row upsert) | `display_name: string \| null` | updated row (`display_name`, `updated_at`) | authenticated (owner) | 422 invalid length, network/server error surfaced inline |
| Read current profile (existing `user_preferences` fetch, extended) | none (uses session) | `display_name`, `theme` | authenticated (owner) | none new |
| Sign up with optional name | `email`, `password`, `name?: string` | linked account; `display_name` set if provided, but a failure to save it does not fail sign up | anonymous session upgrading | 422 invalid length if name provided but out of range; a post link name save failure is non blocking (see Value sourcing) |

This reuses the existing `packages/shared/src/auth.ts` and preferences fetch/save pattern; no new endpoint shape, just an added field to the existing save call and to `signUpWithPassword`'s optional input. The save call updates only `display_name` and `updated_at` (an `UPDATE ... SET`, inserting a row only if none exists yet) so it can never null out `theme` on a concurrent write from another device.

**Initials algorithm** (exact, so both platforms render identically):
1. Take the source string (`display_name` when set, else `email`).
2. For a name: trim, split on runs of whitespace (`/\s+/`), drop empty tokens. Take the first code point (`Array.from(word)[0]`, not `charCodeAt`, so multi byte characters are not cut in half) of the first token, uppercased via `toLocaleUpperCase()`; if a second token exists, take its first code point too, uppercased. One token yields one letter; two or more tokens yield two letters. Never take more than one letter per token even if `toLocaleUpperCase()` expands a character (e.g. "ß" to "SS": truncate back to one code point after uppercasing).
3. If the name yields zero letters (e.g. an emoji only or punctuation only name, which passes the length check constraint since it counts characters, not letters), fall back to the email rule.
4. For the email fallback: uppercase the first code point of the email string.
5. If there is no name and no email at all (a state the app should never produce but the render must not break for), show a literal "?" glyph in the same badge chrome. Satisfies **AC-11**.

**Badge visuals** (concrete values so web and mobile do not drift):
- Diameter: 32px on web, 28px on mobile; minimum 44x44 hit target on mobile (padding around the visible circle, not the circle itself).
- Shape: `radii.full`, background `accent`, text `accentText`, per the existing WCAG verified token pair.
- Text: `typeScale.label` (13px), weight 600, centered.
- Guest icon: a person glyph inline SVG (web, in `site-nav.tsx`, `currentColor` sized to fill the same 32px circle) and the platform's built in person icon (mobile, via `expo-router`'s icon support, sized to fill the 28px circle), both on a neutral (not `accent`) background so a guest is visually distinct from a signed in badge, not just textually.
- Add an `avatarSize` entry (`{ web: 32, mobile: 28 }` or equivalent) to `packages/shared/src/tokens.ts` so neither app hardcodes the pixel value independently.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Render nav badge (web, header bar badge on mobile) | The 1 or 2 letter initials shown | the Initials algorithm above, applied to `user_preferences.display_name` when set, else `auth.users.email`, else the literal "?" fallback (AC-11) |
| Render nav badge | Whether to show initials/fallback vs the neutral guest icon | derived from whether the current session `is_anonymous` is false (signed in) vs true (guest); never derived from whether `display_name` is set |
| Account page initials preview | Live preview letters as the user types | the same Initials algorithm, applied client side to the in progress (unsaved, trimmed) input value |
| Save name | The trimmed value actually stored | the raw input value, trimmed of leading/trailing whitespace before validation and before the update; the stored value is always the already trimmed string, never untrimmed |
| Sign up form | Whether the name save is attempted | attempted only if the user typed something (trimmed non empty); skipped (no save call) if left blank |
| Sign up form, name save failure | What the user sees if the post sign up name save fails | sign up itself still succeeds; the user lands on the account page with the typed name prefilled in the (now empty, per the failed save) field and the same inline error/retry pattern as AC-8, so no re-typing is needed |

**Key invariants**:
- `display_name`, when not null, is 1 to 50 characters, stored already trimmed; the check constraint validates the stored (trimmed) value directly (`display_name = btrim(display_name) AND char_length(display_name) between 1 and 50`), not a separately trimmed comparison, so a value cannot be stored with leading or trailing whitespace in the first place.
- A `display_name` of only whitespace is treated as null (never stored as whitespace or as an untrimmed string).
- Only the row owner (`auth.uid() = user_id`) can read or write their own `display_name`; unchanged from spec 0008's existing policies, enforced in both `USING` and `WITH CHECK`.
- The badge's guest/signed in decision reads the session's `is_anonymous` flag, never the presence or absence of `display_name` alone (a signed in user with no name is still signed in, per AC-2).
- Saving `display_name` never touches `theme` (column scoped update, not a full row upsert), so two devices editing different fields concurrently cannot clobber each other; two devices editing `display_name` itself concurrently is last write wins, which is an accepted tradeoff for a low stakes cosmetic field.

**Security model**:
Unchanged from spec 0008: `user_preferences` RLS restricts `SELECT`, `INSERT`, and `UPDATE` to rows where `auth.uid() = user_id`, both in `USING` and `WITH CHECK`. `display_name` carries no additional sensitivity beyond email (already visible to the owner only); no new compliance scope.

**Critical test scenarios**:
- Happy path: a signed in user with no name set sees their email initial badge, sets a name on the account page, and the nav badge updates to the two letter initials on both platforms, verifies **AC-1**, **AC-2**, **AC-5**
- Failure case: saving a name fails (simulated network error); the typed text remains in the input, an inline error shows, and retrying succeeds without re-typing, verifies **AC-8**
- Auth/permission: an authenticated user A attempts to write `display_name` on user B's `user_preferences` row (a direct write with B's `user_id`); the write is rejected by RLS, verifies **AC-10**
- Edge case: clearing a previously set name back to empty saves as null and the badge reverts to the email initial, verifies **AC-6**
- Validation: a 51 character name and a whitespace only name are both rejected before save, with an inline message, verifies **AC-7**
- Edge case: a one word name ("Cher") yields a single letter badge, and an emoji only name falls back to the email initial rule, verifies **AC-1**, **AC-2**
- Failure case: sign up succeeds even when the post link name save fails; the user lands on the account page able to retry the name save without re-typing, verifies **AC-4**, **AC-8**

## Build plan

1. [x] Migration: add nullable `display_name text` column to `user_preferences` with a check constraint on the stored value directly (`display_name IS NULL OR (display_name = btrim(display_name) AND char_length(display_name) BETWEEN 1 AND 50)`); no RLS policy change needed. Satisfies **AC-6**, **AC-7**, **AC-10**. Applied live to `BartendingAppWeb` via `supabase/migrations/20260910120000_user_preferences_display_name.sql`; security advisor clean (no new findings).
2. [x] Regenerate shared TypeScript types (`packages/shared/src/database.types.ts`) from the live schema. Satisfies **AC-1** through **AC-8** (typed access for every surface below).
3. [x] Shared initials helper in `packages/shared` implementing the exact Initials algorithm above (code point aware, one/two token handling, emoji only fallback, email fallback, "?" ultimate fallback) plus a shared trim/length validator for the name input. Satisfies **AC-1**, **AC-2**, **AC-7**, **AC-11**. — `packages/shared/src/initials.ts` (`getInitials`, `validateDisplayName`).
4. [x] Add `avatarSize` to `packages/shared/src/tokens.ts` per the Badge visuals spec above. Satisfies **AC-1**, **AC-2**, **AC-3**.
5. [x] Extend the shared preferences read/write layer to include `display_name` in the fetch and to add a column scoped save function (`UPDATE ... SET display_name`, never a full row upsert) that trims, validates, and saves it, returning an explicit error result on failure (matching the project's explicit error return convention). Satisfies **AC-5** through **AC-8**. — `packages/shared/src/preferences.ts` (`fetchProfile`, `updateDisplayName`); implemented as a column scoped upsert (`onConflict: user_id`, only `display_name` in the payload) rather than a bare `UPDATE`, since a bare update would silently no-op for a user with no `user_preferences` row yet.
6. [x] Extend `signUpWithPassword` in `packages/shared/src/auth.ts` to accept an optional `name`, and save `display_name` after linking the account as a non blocking step (sign up succeeds regardless of whether this save succeeds; a failure surfaces on the account page per the Value sourcing row above). Satisfies **AC-4**.
7. [x] Web: add an optional name field to the sign up form (`GuestAuthForm`), and a name field with live initials preview to `LinkedAccountPanel` on the account page, using the shared save function and its error handling. Satisfies **AC-4**, **AC-5**, **AC-8**. — `apps/web/src/auth/account-page-client.tsx`, `apps/web/src/auth/use-preferences.ts`.
8. [x] Web: add a right aligned badge to `site-nav.tsx` (initials, email fallback, or "?" when signed in, using the shared initials helper and `avatarSize`/`radii.full`/`accent`/`accentText`; a neutral colored inline SVG person icon when guest), linking to `/account`. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-9**, **AC-11**.
9. [x] Mobile: add the same optional name field to the mobile sign up form and to the mobile account screen's `LinkedAccountPanel` equivalent, with the same live preview and error handling. Satisfies **AC-4**, **AC-5**, **AC-8**. — `apps/mobile/src/app/account.tsx`, `apps/mobile/src/auth/use-preferences.ts`.
10. [x] Mobile: add a thin header bar rendered above `NativeTabs` in `app-tabs.tsx` (and its `app-tabs.web.tsx` counterpart, kept consistent or explicitly a web only no op if that file only affects the web preview of the mobile app) containing the badge (initials, email fallback, or "?" when signed in via the shared helper and `avatarSize.mobile`; the platform's built in person icon when guest), tappable to navigate to the account page. The Account tab itself keeps its existing static icon, unchanged. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-9**, **AC-11**. — `app-tabs.web.tsx` left untouched: it is a stale, out of sync starter template (2 hardcoded tabs, "Expo Starter" branding) unrelated to the real 6 tab `NativeTabs` app, so it is a no op per the spec's own allowance.
11. [x] Cross platform parity check: confirm both apps derive initials from the same shared helper, apply the same validation and fallback rules, and use the same `avatarSize` tokens. — both apps call the same `getInitials`/`validateDisplayName`/`updateDisplayName`/`avatarSize` exports from `@bartendingapp/shared`; no per app reimplementation.

## Consequences

**Positive**:
- Signed in state becomes visible at a glance on both platforms, closing a real usability gap.
- No new table or RLS surface to maintain; the change rides on spec 0008's existing infrastructure.

**Negative / tradeoffs**:
- `user_preferences` now holds both settings (`theme`) and identity adjacent data (`display_name`); acceptable for one field, worth revisiting if profile data grows.
- Mobile gains a new header bar component purely to host the badge (Expo's `NativeTabs.Trigger.Icon` cannot render dynamic text), a small new piece of chrome on every screen rather than reusing an existing element.
- Concurrent `display_name` edits from two devices are last write wins with no conflict warning; accepted for a low stakes cosmetic field.

**Neutral**:
- Establishes the first avatar/badge visual pattern in the design system (circular, `radii.full`, accent color pair); worth documenting in `docs/design/design.md` once built.

## Follow-up

- [x] Add the new badge/avatar pattern (circular, accent color, initials) to `docs/design/design.md` once built, so future avatar-like UI reuses it instead of inventing a new style. — done, see the Avatar / badge section of `docs/design/design.md`.
