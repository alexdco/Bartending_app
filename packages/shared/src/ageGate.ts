// Age confirmation state, shared by the web head script, the web gate, and
// the mobile overlay. The answer only ever lives on the device.
// Spec: docs/specs/0037-brand-metadata-launch-readiness/index.md

import { SUPPORTED_LOCALES } from "./locale";

export const AGE_CONFIRMED_KEY = "age-confirmed";

export const AGE_DENIED_KEY = "age-denied";

// Mocktails only mode (spec 0063): sessionStorage on web, memory on mobile.
export const AGE_MOCKTAILS_KEY = "age-mocktails";

// Bump to "2" if the gate wording changes in a way that needs everyone to
// answer again; any other stored value then reads as unanswered.
export const AGE_GATE_VERSION = "1";

const EXEMPT_PATHS = ["privacy", "auth/callback"] as const;

// Today this is exactly ^(?:/(?:en|es|pt|fr|ru|hi|ja|ko|zh))?/(?:privacy|auth/callback)/?$
export const AGE_GATE_EXEMPT_PATTERN = new RegExp(
  `^(?:/(?:${SUPPORTED_LOCALES.join("|")}))?/(?:${EXEMPT_PATHS.join("|")})/?$`,
);

export type AgeGateState = "exempt" | "confirmed" | "mocktails" | "denied" | "ask";

export type AgeGateInput = {
  readonly confirmedValue: string | null;
  readonly denied: boolean;
  // Chose "Continue with mocktails only" on the blocked screen (spec 0063).
  readonly mocktails: boolean;
  // null on mobile, which has no exempt routes.
  readonly pathname: string | null;
};

export function isAgeGateExemptPath(pathname: string | null): boolean {
  return pathname !== null && AGE_GATE_EXEMPT_PATTERN.test(pathname);
}

// Precedence (spec 0063): exempt, confirmed, mocktails, denied, ask.
export function resolveAgeGateState({
  confirmedValue,
  denied,
  mocktails,
  pathname,
}: AgeGateInput): AgeGateState {
  if (isAgeGateExemptPath(pathname)) {
    return "exempt";
  }

  if (confirmedValue === AGE_GATE_VERSION) {
    return "confirmed";
  }

  if (mocktails) {
    return "mocktails";
  }

  return denied ? "denied" : "ask";
}

/** True only in mocktails only mode (spec 0063). */
export function isMocktailsOnly(state: AgeGateState): boolean {
  return state === "mocktails";
}
