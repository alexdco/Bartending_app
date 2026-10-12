// Age confirmation state, shared by the web head script, the web gate, and
// the mobile overlay. The answer only ever lives on the device.
// Spec: docs/specs/0037-brand-metadata-launch-readiness/index.md

import { SUPPORTED_LOCALES } from "./locale";

export const AGE_CONFIRMED_KEY = "age-confirmed";

export const AGE_DENIED_KEY = "age-denied";

// Bump to "2" if the gate wording changes in a way that needs everyone to
// answer again; any other stored value then reads as unanswered.
export const AGE_GATE_VERSION = "1";

const EXEMPT_PATHS = ["privacy", "auth/callback"] as const;

// Today this is exactly ^(?:/(?:en|es))?/(?:privacy|auth/callback)/?$
export const AGE_GATE_EXEMPT_PATTERN = new RegExp(
  `^(?:/(?:${SUPPORTED_LOCALES.join("|")}))?/(?:${EXEMPT_PATHS.join("|")})/?$`,
);

export type AgeGateState = "exempt" | "confirmed" | "denied" | "ask";

export type AgeGateInput = {
  readonly confirmedValue: string | null;
  readonly denied: boolean;
  // null on mobile, which has no exempt routes.
  readonly pathname: string | null;
};

export function isAgeGateExemptPath(pathname: string | null): boolean {
  return pathname !== null && AGE_GATE_EXEMPT_PATTERN.test(pathname);
}

export function resolveAgeGateState({
  confirmedValue,
  denied,
  pathname,
}: AgeGateInput): AgeGateState {
  if (isAgeGateExemptPath(pathname)) {
    return "exempt";
  }

  if (confirmedValue === AGE_GATE_VERSION) {
    return "confirmed";
  }

  return denied ? "denied" : "ask";
}
