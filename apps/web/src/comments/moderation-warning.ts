import type { BecameHiddenEvent } from "@bartendingapp/shared";

/**
 * The counting report warning (spec 0062 AC-13, invariant 9): ids only,
 * never note text.
 */
export function warnContentHidden(event: BecameHiddenEvent): void {
  // TODO: send as a Sentry warning tagged `moderation` once Sentry is
  // installed on web (scope feature 20, not yet built).
  console.warn("comment content hidden by reports", event);
}
