# 0018. User profile and nav badge — rationale

## Context

A signed in user currently has no visual confirmation of their sign in state anywhere in the nav. The account page (spec 0008) shows email and account actions, but a user has to visit that page to know they are signed in at all; the top level nav on both platforms looks identical for a guest and a signed in user.

No name field exists anywhere today. `auth.users` (Supabase managed) only carries `email`; the app's own `user_preferences` table (introduced by spec 0008) carries per user settings (`theme`) but nothing profile shaped. Anonymous sessions mean every guest already has a real `auth.uid()`, and sign up links email and password to that same id in place rather than creating a new row, so "signed in" is really "the anonymous session gained a real email", not a fresh identity. Any name field has to fit that same linking model.

The web nav (`site-nav.tsx`) is a single flat row of links today with no right aligned section and no auth state branching. The mobile app has no header bar at all, only a bottom tab bar (`app-tabs.tsx`, Expo Router's `NativeTabs`). `NativeTabs.Trigger.Icon` only accepts a static image `src` (a `require(...)`'d PNG per tab, several still TODO placeholders), so it cannot render dynamic initials text; the Account tab icon cannot become the badge as originally scoped. A small header bar above the tabs is the only way to get a genuinely dynamic badge on mobile.

## Options considered

### Option 1: Add `display_name` to the existing `user_preferences` table

A single nullable text column added to the table spec 0008 already created for per user settings. Reuses the existing 1:1-with-`auth.users`, owner scoped RLS policies without any policy change (they check `user_id` regardless of column).

**Pros**:
- No new table, no new RLS policies to write and audit
- Already synced correctly across devices via the same query path as `theme`
- Minimal migration: one column, one check constraint

**Cons**:
- `user_preferences` becomes a mixed bag of "settings" and "profile" over time; a future larger profile (avatar image, bio) would eventually want its own table anyway

### Option 2: New `profiles` table

A dedicated table for profile data, separate from settings.

**Pros**:
- Clean separation of concerns if profile data grows substantially later
- Table name signals intent clearly

**Cons**:
- New table means new RLS policies to write, test, and audit for a single field
- Extra join or extra query for something `user_preferences` already fetches once per session
- No concrete plan for what else would go in "profile" yet; speculative

## Rationale

`user_preferences` already exists as the 1:1, owner scoped, cross device synced table for exactly this kind of per user data (spec 0008 built it for `theme`); a name field is the same shape of data with the same access pattern, so it belongs in the same table rather than standing up a second table with duplicate RLS logic for one column. If profile data grows meaningfully later (an avatar image, a bio), that is a real future decision to split it out, not a reason to add ceremony now for a single text field.
