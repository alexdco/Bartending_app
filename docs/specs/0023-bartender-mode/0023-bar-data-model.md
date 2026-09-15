# 0023. Bar data model, membership, house recipes, menu, and 86 list

## Summary

This is the shared foundation for Bartender Mode: a "bar" (a venue or team) that staff join with a real account, house recipes that either override a catalog cocktail or stand fully on their own, a curated current menu, and a simple out of stock ("86'd") list any staff member can update. Everything else in Bartender Mode reads from these tables.

## Requirements

**User stories**:
- As a bar owner, I want to create a bar and invite my staff by email, so everyone sees the same house recipes, menu, and stock status.
- As bar staff, I want to accept an invite and immediately see my bar's house recipes and current menu, so I don't have to re-enter anything.
- As bar staff, I want to mark an ingredient as 86'd (out of stock) the moment I notice it, so every teammate's app reflects it right away.
- As a bar owner, I want to add a house recipe based on a classic cocktail with our own ratios and garnish, or write a fully original recipe, so our specs match what we actually pour.
- As a bar owner, I want to control which house recipes are on tonight's menu separately from the full house recipe library, so retired or seasonal drinks don't clutter service.
- As a bartender working two venues, I want to switch between my bars, so I always see the right one's data.
- As a bartender who hasn't joined a bar yet, I want search and my personal pins to still work, so the app is useful before I'm onboarded anywhere.

**Acceptance criteria**:
- **AC-1**: A signed in (linked, non anonymous) user can create a bar and becomes its `owner`.
- **AC-2**: An owner can invite a staff member by email; the invite is `pending` until the invitee accepts, at which point a `bar_members` row is created with role `staff` and the invite becomes `accepted`. An owner can `revoke` a pending invite.
- **AC-3**: Any `bar_members` row (owner or staff) can read that bar's house recipes, menu, and 86 list. Only an owner can create, edit, or delete house recipes and menu items, or manage invites. Any member (owner or staff) can toggle an ingredient's 86'd status.
- **AC-4**: A house recipe (`bar_recipes`) can either reference a catalog `recipes` row as its base (storing only the fields the bartender actually overrides, with everything else copied forward from the base at creation time) or stand fully independent with no base.
- **AC-5**: The current menu (`bar_menu_items`) is an ordered, independently toggleable subset of a bar's house recipes; a house recipe can exist without being on the menu.
- **AC-6**: A user can belong to more than one bar; Bartender Mode's Service screen shows a bar switcher only when the user belongs to more than one, and remembers the last selected bar otherwise.
- **AC-7**: A user with no bar membership still sees a working Service screen: search, pinned cocktails, and recently viewed all work; the current menu and house specs sections are replaced with a prompt to create or join a bar.
- **AC-8**: A user can pin a cocktail, either from the global catalog or from a bar's house recipes, up to 20 pins (counting all pins, including any currently hidden per below), and reorder them. Leaving a bar hides (does not delete) any pins referencing that bar's house recipes, enforced by the pinned list read path filtering to live `bar_members` rows, not a separate visibility flag; rejoining restores their visibility. A pin whose `bar_recipe_id` is soft deleted (`deleted_at` set) is excluded from the pinned list the same way, via the same read path filter.
- **AC-9**: Soft deleting a catalog recipe (`recipes.deleted_at`) that a `bar_recipes` row is based on has no visible effect on that house recipe, because the fields it did not override were captured at creation time, not read live from the base.
- **AC-10**: A recipe or house recipe with at least one 86'd ingredient shows a clear, unmissable marker everywhere it can be opened from: a warning label in search results, in the current menu list, and as a banner at the top of Quick Build Mode.

## Options considered

### Option 1: Bar scoped copies of every field on `bar_recipes` (no live join to the base recipe)

At creation, copy every field the bartender leaves blank forward from the base `recipes` row into `bar_recipes`, then never read the base row again for display purposes; `base_recipe_id` is kept only as an informational link.

**Pros**:
- A house recipe keeps working identically even if the base catalog recipe is later edited, reclassified, or soft deleted; no runtime join needed for the common read path.
- Simple to reason about: `bar_recipes` is always a complete, displayable record.

**Cons**:
- If the catalog recipe is corrected later (e.g. a wrong ingredient fixed), house recipes based on it do not inherit the fix; a bar has to notice and re-copy manually.

### Option 2: Live join to the base recipe for any null override field

`bar_recipes` stores only explicit overrides as non null; any null field is resolved at read time via a join to `recipes`, so a later catalog fix propagates automatically.

**Pros**:
- Catalog corrections and enrichments (e.g. a `method`/`straining` backfill) reach house recipes without any action.

**Cons**:
- A soft deleted or edited base recipe changes a house recipe's behavior invisibly; the "recipe deleted from the catalog" edge case (AC-9) becomes a live failure mode requiring a fallback/badge UI, not a non issue.
- Every Quick Build Mode read needs a join plus null coalescing logic, adding a small but real cost to the exact path this feature is supposed to make fast.

## Decision

**Chosen option**: Option 1: snapshot at creation, no live join for display.

`bar_recipes` copies forward any unspecified field from its `base_recipe_id` at creation time. `base_recipe_id` is kept as a reference (for provenance and future "update from source" tooling) but is never required at read time to render a house recipe.

## Rationale

The deciding force is the 2 to 3 second retrieval goal and the requirement that Quick Build Mode work on unreliable bar wifi (see the offline behavior decision in the Quick Build child spec). A read path that depends on a live join to a table that can be soft deleted independently is a fragility this feature does not need to accept; snapshotting trades a small amount of staleness (a bar won't automatically get a catalog fix) for a house recipe that always renders correctly and never needs a "source recipe removed" fallback state. The cost is acceptable because house recipes are, by definition, the bar's own version of the truth; a bar that wants a catalog fix can re-add the ingredient itself.

## Feature design

**Data model sketch**:

| Entity | Key fields | Notes |
|---|---|---|
| `bars` | `id` (pk), `name` (text, required), `created_by` (fk `auth.users`), `created_at` | |
| `bar_members` | `bar_id` (fk `bars`), `user_id` (fk `auth.users`), `role` (`owner` \| `staff`), `joined_at` | unique(`bar_id`, `user_id`) |
| `bar_invites` | `id` (pk), `bar_id` (fk `bars`), `email` (text, required, stored lowercased), `invited_by` (fk `auth.users`), `status` (`pending` \| `accepted` \| `revoked`), `created_at`, `expires_at` (default `created_at + 14 days`), `accepted_by` (fk `auth.users`, nullable) | partial unique index on (`bar_id`, `email`) where `status = 'pending'`, so an email can have only one live invite per bar at a time |
| `bar_recipes` | `id` (pk), `bar_id` (fk `bars`), `base_recipe_id` (fk `recipes`, nullable), `name` (text, required), `method` (text, nullable), `straining` (text, nullable), `instructions` (text, nullable), `glass` (text, nullable), `ice` (text, nullable), `garnish` (text, nullable), `created_by` (fk `auth.users`), `created_at`, `updated_at`, `deleted_at` (nullable) | unique index on (`bar_id`, `lower(name)`) where `deleted_at is null` |
| `bar_recipe_ingredients` | `bar_recipe_id` (fk `bar_recipes`), `ingredient_id` (fk `ingredients`), `amount_value` (numeric), `amount_unit` (`oz` \| `ml` \| `cl` \| `tsp` \| `tbsp` \| `cup`), `sort_order` (int) | mirrors `recipe_ingredients` shape |
| `bar_menu_items` | `id` (pk), `bar_id` (fk `bars`), `bar_recipe_id` (fk `bar_recipes`), `sort_order` (int), `active` (boolean, default true) | |
| `bar_ingredient_stock` | `bar_id` (fk `bars`), `ingredient_id` (fk `ingredients`), `is_86d` (boolean, default false), `updated_by` (fk `auth.users`), `updated_at` | unique(`bar_id`, `ingredient_id`) |
| `pinned_recipes` | `id` (pk), `user_id` (fk `auth.users`), `recipe_id` (fk `recipes`, nullable), `bar_recipe_id` (fk `bar_recipes`, nullable), `sort_order` (int), `pinned_at` | `CHECK (num_nonnulls(recipe_id, bar_recipe_id) = 1)`; unique(`user_id`, `recipe_id`); unique(`user_id`, `bar_recipe_id`) |
| `recipes` (existing, modified) | `+ method` (text, nullable), `+ straining` (text, nullable) | backfilled via a Haiku classification pass, same pattern as the existing `difficulty` field |

**State transitions**:

`bar_invites.status`: `pending` → `accepted` (on invite acceptance, atomically creates the `bar_members` row) · `pending` → `revoked` (owner action) · `pending` → `revoked` automatically once `expires_at` passes (checked lazily: `accept_bar_invite` treats an expired `pending` invite as not-found rather than accepting it; no background job needed). No transition out of `accepted` or `revoked`.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `bars` insert | Supabase table insert | `name` | `id` | linked user only | 401 anonymous session |
| `bar_invites` insert | Supabase table insert | `bar_id`, `email` | `id`, `status: pending` | owner of `bar_id` | 403 not owner |
| `accept_bar_invite` | RPC | `invite_id` | `bar_members` row (existing row returned, not duplicated, if already a member) | any authenticated linked user whose email matches the invite | 404 invite not found, not pending, or expired; 403 email mismatch (case insensitive) |
| `bar_recipes` insert | Supabase table insert | `bar_id`, `name`, `base_recipe_id?`, overrides, ingredients[] | `id` | owner of `bar_id` | 403 not owner, 409 duplicate active name |
| `bar_menu_items` upsert | Supabase table upsert | `bar_id`, `bar_recipe_id`, `sort_order`, `active` | row | owner of `bar_id` | 403 not owner |
| `toggle_86_status` | RPC | `bar_id`, `ingredient_id`, `is_86d` | row (`updated_by` set server side from `auth.uid()`, never accepted from the client) | any member of `bar_id` | 403 not a member, 404 ingredient not found |
| `fetch_bar_service_data` | RPC | `bar_id` | `{ menu[], house_recipes[], stock_86[] }` | any member of `bar_id` | 403 not a member |
| `pinned_recipes` insert | Supabase table insert | `recipe_id?`, `bar_recipe_id?` | `id` | owner (`user_id = auth.uid()`) | 422 both or neither id set, 409 already pinned, 409 over 20 pins |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Create `bar_recipes` row | Any override field left blank by the bartender | Copied at insert time from `base_recipe_id`'s current row in `recipes` (application logic in the insert path, not a DB trigger, so a single clear point owns the copy) |
| Service screen render | Which bar is "current" when the user has 2+ memberships | The last bar the user explicitly selected, persisted client side (e.g. `AsyncStorage`), defaulting to the earliest joined `bar_members` row if none stored yet |
| `accept_bar_invite` | Whether the accepting user's email matches the invite | `auth.users.email` for `auth.uid()`, compared to `bar_invites.email` inside the RPC |
| Pin creation | The 20 pin cap check | `count(*) from pinned_recipes where user_id = auth.uid()`, checked inside the insert (a DB level check via a `BEFORE INSERT` trigger, not the client, so the cap holds even against a direct API call); counts every pin the user has regardless of whether it is currently hidden by the AC-8 visibility filter |
| Pinned list render | Whether a pin is currently visible | A read time filter, not a stored flag: a `bar_recipe_id` pin is shown only if a live `bar_members` row exists for (`bar_id` of that `bar_recipes` row, `auth.uid()`) and the `bar_recipes` row's `deleted_at is null`; a `recipe_id` pin has no such filter |
| Search result / menu list / Quick Build banner | The 86'd-ingredient warning marker | `bar_ingredient_stock.is_86d` joined against the recipe's (or house recipe's) ingredient list; true if any ingredient used by the recipe has `is_86d = true` for the current bar |

**Key invariants**:
- A `bar_recipes` row has exactly one of `base_recipe_id` set or fully independent content; `name` is always required regardless.
- A `pinned_recipes` row references exactly one of `recipe_id` or `bar_recipe_id`, never both or neither (enforced by the `CHECK` constraint).
- `bar_members` has at most one row per (`bar_id`, `user_id`).
- A bar always has at least one `owner`; the last owner cannot leave or be demoted without transferring ownership first (enforced at the application layer for MVP; a future spec can move this into the DB if a second owner-transfer flow is added).
- `bar_invites` has at most one `pending` row per (`bar_id`, lowercased `email`) at a time (partial unique index); a new invite to the same email while one is pending is rejected, not duplicated.
- A `pinned_recipes` row counts toward the 20 pin cap regardless of whether it is currently visible under the AC-8 filter.

**Security model**:
- All `bar_*` tables require a linked (non anonymous) account for every access, not just for joining. The `SELECT` policy on every `bar_*` table checks both `auth.jwt() ->> 'is_anonymous' = 'false'` and that `auth.uid()` has a `bar_members` row for that `bar_id`; an anonymous session is denied outright, so there is no path where "already a member" alone grants access. This is stricter than, and replaces, an earlier draft that would have allowed an anonymous session to read bar data if it somehow held a membership row; membership itself cannot exist for an anonymous session because `bar_members` rows are only ever created via `accept_bar_invite` or bar creation, both linked-account gated below.
- `bar_recipes`, `bar_menu_items`, `bar_invites`: `INSERT`/`UPDATE`/`DELETE` policies check the requesting user's `bar_members.role = 'owner'` for that `bar_id` in both `USING` and `WITH CHECK` (so an owner cannot move a row to a `bar_id` they don't own by editing the foreign key, and cannot insert a row under a `bar_id` they don't own).
- `bar_ingredient_stock`: `INSERT`/`UPDATE` policies check any member (owner or staff) of that `bar_id` in both `USING` and `WITH CHECK`, since front line staff are the ones who notice stock changes; `WITH CHECK` specifically prevents a member from writing or moving a stock row into a `bar_id` they don't belong to.
- `bar_members`: a user can `DELETE` their own row (leave a bar); only an owner can `DELETE` another member's row (remove staff).
- Joining a bar (accepting an invite, or being the creating owner) requires a linked account; Supabase RLS on `bar_members` INSERT via `accept_bar_invite` checks `auth.jwt() ->> 'is_anonymous' = 'false'`. Personal tables (`pinned_recipes`, and the client side recently viewed list) place no such restriction, matching `pantry_items`/`favorites` today; only `bar_*` tables require a linked account.
- `fetch_bar_service_data`, `accept_bar_invite`, and `toggle_86_status` are all `SECURITY DEFINER` (needed since they read/write across the membership check), and each independently re-derives the caller from `auth.uid()` inside the function body rather than trusting any client supplied user identifier; each also pins `search_path` to prevent search-path hijacking, standard practice for a `SECURITY DEFINER` function.
- No PII beyond email (already handled by existing Supabase Auth) and no payment or health data is introduced; no new compliance scope.

**Configuration required**: none. No new environment variables or third party credentials.

**Critical test scenarios**:
- Happy path: owner creates a bar, invites a staff member, staff accepts, staff immediately sees the bar's house recipes and menu, verifies **AC-1, AC-2, AC-3**.
- Failure case: two staff members toggle the same ingredient's 86 status within the same second; the later write wins (last write wins is acceptable here, no business need for conflict resolution beyond that), verifies **AC-3**.
- Auth/permission: a staff member (non owner) attempts to edit a house recipe directly via the Supabase client and is denied by RLS, verifies **AC-3**.
- Edge case: a catalog recipe used as a house recipe's base is soft deleted after the house recipe was created; the house recipe still renders every field correctly, verifies **AC-9**.
- Edge case: a user with 21st pin attempt is rejected with a clear error before insert, verifies **AC-8**.
- Edge case: a user leaves a bar; their pins referencing that bar's house recipes stop appearing in their pinned list (via the live membership join, not a stored flag), and reappear unchanged if they rejoin, verifies **AC-8**.
- Edge case: an owner sends two invites to the same email before the first is accepted; the second is rejected by the partial unique index, verifies **AC-2**.
- Auth/permission: an anonymous session that somehow obtains a `bar_id`/table name attempts to read `bar_recipes` directly; denied because the anonymous check on the `SELECT` policy fails regardless of any `bar_members` state, verifies the security model's linked-account-only rule.

## Build plan

1. Migration: create `bars`, `bar_members`, `bar_invites` (with the partial unique index and `expires_at`), `bar_recipes`, `bar_recipe_ingredients`, `bar_menu_items`, `bar_ingredient_stock`, `pinned_recipes`, plus the `method`/`straining` columns and backfill job on `recipes`. Satisfies **AC-1, AC-2, AC-4, AC-5, AC-8, AC-9**.
2. RLS policies for every `bar_*` table and `pinned_recipes`, including `WITH CHECK` on every write policy and the linked-account check on every `SELECT`, per the security model above. Satisfies **AC-3, AC-8**.
3. `accept_bar_invite`, `toggle_86_status`, and `fetch_bar_service_data` RPCs (each `SECURITY DEFINER`, `search_path` pinned, deriving the caller from `auth.uid()` internally), plus the pin count trigger. Satisfies **AC-2, AC-3, AC-8, AC-10**.
4. `packages/shared`: types and thin query/mutation helper functions wrapping the above (`createBar`, `inviteStaff`, `acceptInvite`, `toggleStock`, `fetchBarServiceData`, `pinRecipe`, `unpinRecipe`, `reorderPins`), following the existing `favorites.ts`/`pantry.ts` pattern. Satisfies **AC-1 through AC-8**.
5. `apps/mobile`: the "Service" tab shell, bar switcher (shown only for 2+ memberships), and the no-bar-joined empty state. Satisfies **AC-6, AC-7**.
6. `apps/mobile`: house recipe and menu management screens (owner only), invite flow (send + accept), and 86 toggle UI, including the 86'd-ingredient warning marker on affected recipes in search results, the menu list, and Quick Build Mode. Satisfies **AC-2, AC-3, AC-4, AC-5, AC-10**.
7. `apps/mobile`: pin/unpin action from a recipe or house recipe, pinned list with drag reorder, capped at 20, filtered to currently visible pins per AC-8. Satisfies **AC-8**.

## Consequences

**Positive**:
- Every later Bartender Mode capability (search ranking, Quick Build Mode) has real shared data to read from.
- The owner/staff split matches how bars actually delegate trust, without over building a third role tier before it's needed.

**Negative / tradeoffs**:
- The "last owner cannot leave" invariant is enforced only in application code for MVP, not the database; a direct API call could violate it until a follow up hardens it at the DB layer.
- Snapshotting `bar_recipes` fields means a later catalog correction does not reach existing house recipes automatically (see Rationale).

**Neutral**:
- `bar_recipe_ingredients` duplicates the shape of `recipe_ingredients` rather than sharing a table; this mirrors the project's existing pattern of keeping bar scoped data in its own tables rather than overloading the catalog schema.

## Follow-up

- [ ] Move the "a bar always has at least one owner" invariant into a database constraint or trigger once an ownership transfer flow exists; until then it is enforced only in application code.
- [ ] Consider a "refresh from source" action for a `bar_recipes` row with a `base_recipe_id`, to intentionally re-copy fields after a catalog correction, given Option 1's tradeoff.
- [ ] When a member is removed from a bar (or leaves), any client side cached copy of that bar's data (TanStack Query cache, and the Quick Build Mode offline persister once built, see the Quick Build child spec) should be invalidated on the removed device, not just blocked from new reads at the RLS layer; the Quick Build child spec's build plan should include this invalidation when the persister is added.
