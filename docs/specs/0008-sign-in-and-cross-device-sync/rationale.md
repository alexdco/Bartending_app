# 0008. Sign in and cross device sync — rationale

## Context

Every pantry and favorites row in this app is already scoped to `auth.uid()` (spec 0002), and every guest already gets a real anonymous Supabase session on first launch (spec 0005). What is missing is the ability for that identity to become durable: today, an anonymous session lives on one device only, so a guest who reinstalls the app or switches devices starts over with an empty pantry. Spec 0001 already made the one load bearing call this feature depends on: signing in should link an identity to the existing anonymous session rather than migrate data to a new one, specifically to avoid an entire class of merge and conflict bugs. This spec turns that principle into an actual build: what sign in method to offer, what happens to a device's local guest data when an account signs in there, and what surface (account deletion, email changes, password reset) has to exist alongside plain sign in for it to be a complete, usable feature.

The main force shaping this design is the project's own stack: Supabase Auth is already provisioned with anonymous sessions, and both apps already have a Supabase client wired up. A new external auth provider would duplicate a capability the project already pays for and already has working session persistence for. The other force is scope discipline: this feature is the first the scope plan tags "planned," coming right after AI generated drink ideas, and the engineer has consistently kept each slice narrow (guest pantry did not touch matching; drink ideas did not touch AI generation). Sign in is a similarly bounded slice: it establishes identity durability and syncs the data that already exists, it does not add new sign in methods beyond one, and it does not add a merge experience beyond the simplest rule the engineer confirmed.

## Options considered

### Option 1: Supabase Auth email/password with anonymous identity linking

Use Supabase Auth's own `updateUser({ email, password })` call on the existing anonymous session to convert it into a permanent, linked identity in place. No new provider, no new session library, no data migration code.

**Pros**:
- Zero data migration: the `user_id` never changes, so every existing `pantry_items`/`favorites` row is valid immediately.
- No new infrastructure or provider account to set up; reuses what the project already runs.

**Cons**:
- Email/password only for this slice; a user who would have preferred a one tap OAuth sign in gets a heavier form to fill out.

### Option 2: A hosted third party auth provider (e.g. Clerk, Auth0)

Replace or front Supabase Auth with a dedicated auth as a service provider, handling sign in, session, and identity linking itself.

**Pros**:
- Often ships a more polished pre-built UI kit and broader sign in method support (social, SSO, MFA) out of the box.

**Cons**:
- Duplicates a capability (auth, sessions, anonymous users) the project's chosen backend, Supabase, already provides; adds a second identity system to reconcile with `auth.uid()`-scoped row level security everywhere in Postgres, a much larger and riskier change than this feature needs.

### Option 3: Merge guest data instead of replacing it on second device sign in

When a user signs in on a device with existing local anonymous data, present a choice to merge that device's pantry/favorites into the account instead of discarding it.

**Pros**:
- No data loss for a guest who genuinely used the app meaningfully on a second device before ever signing in there.

**Cons**:
- Real merge logic (deduplicating overlapping pantry items, deciding which "already have" wins) that spec 0001 explicitly wanted to avoid by choosing identity linking in the first place; the confirmed real world case (a brand new anonymous session on a second device, opened seconds before signing in) rarely has anything worth merging, making the added complexity disproportionate to the benefit for this slice.

## Rationale

Option 1 wins because it is the only option that costs nothing beyond what the project already operates and directly executes the mechanism spec 0001 already committed to: an anonymous session becomes a permanent one via identity linking, not a separate account with a migration step. Option 2 was rejected because it works against the project's own architecture rather than with it; the entire pantry/favorites/preferences security model already assumes `auth.uid()` from Supabase, and introducing a second identity provider would mean either bridging two systems or re-deriving that security model from scratch, an unjustifiable cost for a feature whose only real requirement is "an account, and it syncs." Option 3 was rejected on scope grounds consistent with how every other slice in this project has been kept narrow: the engineer's own answer confirmed the always replace rule is acceptable, and a merge UI is real, separately specable scope that can be revisited if actual usage shows guests losing meaningful data (tracked in Follow up), matching how drink ideas from pantry deferred generation and guest pantry deferred matching to their own specs rather than bundling them in.

## References

None (references opted out; the reasoning above cites project sources and named practices directly in text).
