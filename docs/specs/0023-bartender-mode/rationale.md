# Rationale: Bartender Mode

## Context

The app today serves one kind of user well: a home or casual bartender browsing for cocktail ideas, with discovery, photos, pantry matching, and recommendations as the point. Professional bartenders working a live shift have the opposite need. They already know roughly what they want to build; the job is to retrieve the exact spec (measurements, method, glass, garnish) as fast as possible, often one handed, in a dark and loud room, sometimes with unreliable signal. Consumer features like photography and cocktail history are noise in that moment, not help.

A second force shapes this more than the UI: real bars run as a team. The same house recipe, the same "what's on the menu tonight," and the same "we're out of Aperol" fact need to be true for every bartender on shift, not just the one holding a particular phone. Nothing in the current schema expresses a venue or a team; every table (`pantry_items`, `favorites`, `user_preferences`) is scoped to one `auth.uid()`. Building house recipes, menus, or an availability list on that per-user foundation would mean either duplicating the same data per bartender (immediately out of sync) or quietly bending the existing personal tables to mean something they don't. Either path creates a data model that lies about what it represents.

The other real force is search. The existing `search_recipes` and `search_ingredients` RPCs use `websearch_to_tsquery` and `pg_trgm` similarity, which is a good typo tolerant substring match but does not resolve bartender shorthand ("esp mart") or an ingredient list spoken the way a bartender thinks about a drink ("bourbon aperol nonino lemon" for a Paper Plane). Both are real, common bartender behaviors named directly in the brief, not edge cases; solving only the substring case would leave the two most bartender specific examples from the brief unresolved.

## Options considered

### Option 1: Extend the existing per user tables (no new bar entity)

Treat "house recipes" as a special kind of `favorites` row and "the menu" as a tagged subset, all still scoped to one `auth.uid()`; a device left behind the bar becomes the shared source of truth.

**Pros**:
- No new tables, fastest to build, no new auth requirement.

**Cons**:
- Two bartenders on their own phones cannot see the same menu or 86 list, which defeats the stated goal of consistent service across a shift.
- Repurposes tables that mean something else (a personal favorite is not a house spec); the data model would misrepresent reality from day one.

### Option 2: A shared bar (venue/team) entity, real linked accounts required to join

Add `bars`, `bar_members`, and bar scoped tables for recipes, menu, and stock; joining a bar requires moving off a bare anonymous session onto a real account, since shared data needs a stable, attributable identity.

**Pros**:
- Matches how a bar actually operates: one shared truth, many staff, before and after a shift change.
- Builds on Supabase's existing RLS and auth linking pattern already used for sign in (`auth.updateUser` on an anonymous session), no new auth mechanism.

**Cons**:
- The app's first multi tenant data model; meaningfully more RLS policy surface than anything shipped so far.
- Bartenders using a shared iPad or without willingness to create an account cannot use the shared parts of Bartender Mode (though personal search and Quick Build Mode still work without one).

### Option 3: Defer the shared entity, ship search and Quick Build Mode first

Build the speed focused UI (search, Quick Build Mode, personal pins) against only the existing global catalog, and design the bar/team entity as a later feature once the core interaction is validated.

**Pros**:
- Smallest first slice, fastest path to validating whether the 2 to 3 second retrieval goal is actually met by the UI alone.

**Cons**:
- House specs, the current menu, and the 86 list are named directly in the brief as core Service section features, not later additions; shipping without them is a materially smaller feature than what was asked for.

## Rationale

Option 2 was chosen directly by the product owner after this tradeoff was presented (see the "Real shared bar entity" decision in the design conversation). The deciding force is that "house specific recipes" and "menu management," to mean anything real, have to be facts about a bar, not about a phone; Option 1's per user model cannot represent that without lying about what the data means, and Option 3 defers the feature the brief actually asked for. The cost accepted is real: this is the first feature requiring a linked account for part of its functionality, and the first multi tenant RLS surface in the app. That cost is paid deliberately, and mitigated by keeping every account-agnostic capability (search, Quick Build Mode on catalog recipes, personal pins) fully working without ever requiring bar membership, so the speed focused core of the feature is not gated behind onboarding friction.

## References

None (references opted out for this spec; the reasoning above is the full record).
