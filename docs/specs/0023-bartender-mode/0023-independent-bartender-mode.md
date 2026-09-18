# 0023. Independent bartender mode (no bar required)

## Summary

Bartender Mode's search, Quick Build, and pinning already work for a bartender with no bar. What does not work is how the Service screen presents that case: it currently shows an "empty" state pushing every bartender toward creating or joining a bar, as if working alone were incomplete. This spec replaces that framing with a first class "working solo" view, so an independent contractor bartender who never joins a bar gets a screen that reads as a real, finished workflow, not a placeholder.

## Requirements

**User stories**:
- As an independent contractor bartender with no bar, I want the Service screen to look and feel complete, so the app doesn't read as broken or half set up for how I actually work.
- As a bartender who might join a bar later, I want a clear, low key way to create or join one from the same screen, so nothing is hidden, it's just no longer the main event.
- As a guest (anonymous session) trying the app before signing in, I want the same working solo experience search, pins, and Quick Build already give me, so I don't hit a sign in wall before I've seen any value.

**Acceptance criteria**:
- **AC-1**: A user with no bar membership (whether their account is linked or still anonymous) sees a "working solo" panel in place of today's "No bar joined yet" empty state, on both `apps/mobile` and `apps/web`. The panel does not use the empty state visual treatment and does not say "yet" or otherwise imply the state is temporary or incomplete.
- **AC-2**: The working solo panel includes a low key "create or join a bar" action. Following it when the session is not linked routes to sign in first (matching every other bar creation entry point's existing linked account requirement); no new anonymous access is granted to bar creation.
- **AC-3**: Search, pinned cocktails, and Quick Build Mode continue to work unchanged for a user with no bar, on both platforms (already true today; this spec adds no new restriction to them).
- **AC-4**: On mobile, a guest (anonymous, `!isLinked`) sees the same working solo panel as a linked user with no bar, replacing today's mobile behavior of rendering nothing for a guest in that section.
- **AC-5**: On web, a guest sees the same working solo panel as a linked user with no bar, replacing today's separate "Sign in to create or join a bar" prompt card.
- **AC-6**: The working solo panel has no dismiss or "don't show again" state; it always renders when the viewer has no current bar, regardless of session type.

## Options considered

### Option 1: Fix in place (chosen)

Replace the `NoBarJoined` empty state component's content and visual treatment, and drop the extra `isLinked` gate that currently hides the whole section from mobile guests and shows web guests a different card, so one working solo panel renders whenever there is no current bar.

**Pros**:
- No schema, RPC, or security model change; every capability this touches already works with no bar, so the fix is confined to two presentation files.
- Fully revertible by reverting one commit; no migration, no coordination window.

**Cons**:
- Does not address the underlying framing of Bartender Mode as a bar centric feature in the umbrella spec's own summary or the scope description; those get a separate, lighter touch update (tracked in Follow-up) rather than a full rewrite.

### Option 2: An explicit solo/team mode switch, chosen once and remembered

Ask a bartender up front (first Service visit, or in settings) whether they work solo or as part of a bar team, and use that stored choice to decide what the Service screen shows, rather than deriving it live from "is there a current bar".

**Pros**:
- Makes the bartender's working style an explicit, named piece of state, which could support future solo specific features (e.g. solo focused defaults) without re-deriving intent from bar membership every time.

**Cons**:
- Adds a new piece of state (and a migration to store it) for a distinction the app can already infer correctly and cheaply from "is there a current bar"; a bartender who joins a bar later would need that stored choice to update too, which is one more thing that can drift from reality.
- Solves a problem this spec does not have: nothing today needs to know "does this person intend to stay solo" as opposed to "do they currently have a bar".

## Decision

**Chosen option**: Option 1: fix in place. Replace the `NoBarJoined` empty state component (and web's separate guest branch) with a single working solo panel shown whenever there is no current bar, regardless of `isLinked`.

## Rationale

Nothing here needs a new mechanism: `apps/mobile/src/app/service.tsx` and `apps/web/src/service/service-page-client.tsx` already branch correctly on "is there a current bar", and every downstream capability (search, pins, Quick Build, the `search_bartender` RPC, `pinned_recipes` RLS) already tolerates `bar_id = null` (see the umbrella's bar data model AC-7, search AC-4, and Quick Build's own no-bar-dependent design). The only thing that reads wrong is the copy and visual treatment of the no-bar branch, and, on mobile, that the `isLinked` check currently suppresses the section entirely for a guest instead of showing it. Fixing the presentation in place is proportionate: nothing about access control, RLS, or data flow changes.

## Feature design

**Data model sketch**: none. No schema change; no new table, column, or RLS policy. This spec touches presentation only.

**API surface**: none. No new endpoint, RPC, or mutation. `fetchMyBars`, `fetchBarServiceData`, `searchBartender`, `pinRecipe`, and `fetchQuickBuildBarRecipeDetail`/`fetch_recipe_detail` are all unchanged.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Service screen render | Whether to show the working solo panel | `currentBar.currentBar` is null AND `currentBar.isLoading` is false, OR `!isLinked` (see the `isLoading` fix below); this is the one behavior change versus today (mobile currently also requires `isLinked` before evaluating this branch at all) |
| Service screen render | `currentBar.isLoading` for a guest, so the guest branch doesn't hang | `useMyBars` (`apps/mobile/src/service/use-my-bars.ts`, `apps/web` equivalent) is `enabled: isLinked`; a disabled TanStack Query's `isPending` never resolves to `false`, so `useCurrentBar`'s `isLoading: myBars.isPending \|\| !hasCheckedStorage` (`apps/mobile/src/service/use-current-bar.ts:43`) stays permanently `true` for a guest today. Fix: the Service screen's render condition treats `isLoading` as irrelevant when `!isLinked` (a guest has no bars query to wait on at all), rather than changing `useCurrentBar` itself, so the hook's contract for a linked user is untouched |
| Working solo panel | The "create or join a bar" action's destination | Not linked (`!isLinked`): `/account` on both platforms (web's existing route; mobile's equivalent account/sign in screen, the same destination its own existing "Sign in" entry points already use). Linked: the existing `CreateBarForm` and "I have an invite" actions, unchanged from today's `NoBarJoined` |
| Sign in from the panel (guest path) | Whether the guest's anonymous session is preserved or replaced | Following "create or join a bar" as a guest takes the same path as every other sign in entry point in the app: signing up (`signUpWithPassword`, `packages/shared/src/auth.ts`) calls `client.auth.updateUser(...)` on the existing anonymous session, upgrading it in place, so `auth.uid()` and anything tied to it (pins, recently viewed) carry over unchanged; signing into an already existing account (`signInWithPassword`) signs out of the anonymous session first, since that is a different, pre-existing identity, matching today's behavior everywhere else sign in is offered. This spec introduces no new anonymous-to-linked transition, only reuses the existing one |
| Sign in from the panel (return path) | Where the user lands after completing sign in | The existing `/account` flow's own post sign in behavior (unchanged by this spec); no dedicated "return to Service" redirect is added, since none of the app's other sign in entry points have one either. A user who wants to return to Service after signing in navigates back the same way they would from any other sign in entry point today |

**Key invariants**:
- Search, pinned cocktails, and Quick Build Mode render identically whether or not the working solo panel is shown; this spec never conditions them on session or bar state beyond what already exists.
- The working solo panel's own visibility depends only on "is there a current bar" for a linked user, or is shown immediately for a guest (no loading wait, since a guest never has a bars query in flight); `isLinked` only changes what the panel's bar action does when followed and whether a loading state is possible at all.

**Security model**: unchanged. No new RLS, no new auth requirement anywhere. Bar creation and joining still require a linked account, enforced the same way (RLS on `bars`/`bar_members`, per the bar data model spec's existing security model); this spec adds no new anonymous access.

**Configuration required**: none.

**Critical test scenarios**:
- Happy path: a linked user with no bar opens the Service screen and sees the working solo panel (not an empty state) with search, pins, and a "create or join a bar" link, verifies **AC-1, AC-2**.
- Happy path: the same user's search and Quick Build continue to function exactly as before, verifies **AC-3**.
- Guest, mobile: an anonymous mobile session opens the Service screen and sees the working solo panel immediately, not stuck on a loading state (since `useMyBars` never resolves for a disabled query), verifies **AC-4**.
- Guest, web: an anonymous web session opens the Service screen and sees the working solo panel instead of the old distinct sign in prompt card, verifies **AC-5**.
- Edge case: following "create or join a bar" as a guest routes to sign in first, and no bar row is created without a linked account, verifies **AC-2**.
- Edge case: the working solo panel appears on every visit with no bar, with no way to hide it, verifies **AC-6**.

## Build plan

1. `apps/mobile`: replace `NoBarJoined` in `apps/mobile/src/app/service.tsx` with a working solo panel component. Change the render condition to `!isLinked || (!currentBar.isLoading && !currentBar.currentBar)` (today's `!isLinked || currentBar.isLoading ? null : ...` collapses the guest case to `null` and would otherwise leave a guest stuck on a permanent loading state, since `useMyBars` stays disabled and `isPending` for `!isLinked`, per the Value sourcing fix above). Route the panel's bar action to `/account` (or mobile's equivalent) when `!isLinked`. Satisfies **AC-1, AC-2, AC-4, AC-6**.
2. `apps/web`: replace both the `!isLinked` sign in card and the linked `NoBarJoined` branch in `apps/web/src/service/service-page-client.tsx` with the same working solo panel, using the same `!isLinked || (!currentBar.isLoading && !currentBar.currentBar)` condition, with the same `/account` routing for the bar action. Satisfies **AC-1, AC-2, AC-5, AC-6**.
3. Confirm search, pinned cocktails, and Quick Build Mode paths are untouched (no code change expected here; a smoke check only, no new work), satisfies **AC-3**.

## Consequences

**Positive**:
- An independent contractor bartender gets a Service screen that reads as finished, matching how the underlying data already behaves.
- Mobile and web now treat guest and linked-no-bar identically, removing an existing platform asymmetry (mobile silently hid the section for guests; web showed a different card).

**Negative / tradeoffs**:
- One more persona (solo, no bar) to keep in mind when this screen changes in the future, though it adds no new state, only a rendering condition.

**Neutral**:
- No new dependency, no new table, no new RPC; this is a copy and conditional rendering change confined to two files.

## Follow-up

- [ ] Update `docs/scope/scope.md` feature 26's description and `docs/specs/0023-bartender-mode/index.md`'s Summary to name the solo/independent-contractor case as a supported persona, not only "a shared bar that staff join" (tracked separately from this child spec so the umbrella stays the single source of that framing).
