import { describe, expect, it } from "vitest";
import {
  AGE_GATE_EXEMPT_PATTERN,
  isAgeGateExemptPath,
  resolveAgeGateState,
  type AgeGateState,
} from "./ageGate";

describe("AGE_GATE_EXEMPT_PATTERN", () => {
  it("matches the exact pattern the spec pins for the current locales", () => {
    expect(AGE_GATE_EXEMPT_PATTERN.source).toBe(
      String.raw`^(?:\/(?:en|es))?\/(?:privacy|auth\/callback)\/?$`,
    );
    expect(AGE_GATE_EXEMPT_PATTERN.flags).toBe("");
  });
});

describe("isAgeGateExemptPath", () => {
  it.each([
    "/privacy",
    "/privacy/",
    "/en/privacy",
    "/es/privacy/",
    "/auth/callback",
    "/en/auth/callback",
    "/es/auth/callback/",
  ])("exempts %s", (pathname) => {
    expect(isAgeGateExemptPath(pathname)).toBe(true);
  });

  it.each([
    "/",
    "/en",
    "/en/recipes/privacy-cocktail-123",
    "/en/account/reset-password",
    "/fr/privacy",
    "/en/privacy/extra",
    "/en/auth",
  ])("does not exempt %s", (pathname) => {
    expect(isAgeGateExemptPath(pathname)).toBe(false);
  });

  it("never exempts on mobile, where the pathname is null", () => {
    expect(isAgeGateExemptPath(null)).toBe(false);
  });
});

describe("resolveAgeGateState", () => {
  const storedValues = [null, "1", "0", "2"] as const;
  const deniedFlags = [false, true] as const;
  const pathnames = [
    "/privacy",
    "/es/privacy/",
    "/en/auth/callback",
    "/en/recipes/privacy-cocktail-123",
    "/",
  ] as const;

  const expected = (
    confirmedValue: string | null,
    denied: boolean,
    pathname: string,
  ): AgeGateState => {
    if (pathname !== "/" && !pathname.includes("recipes")) return "exempt";
    if (confirmedValue === "1") return "confirmed";
    return denied ? "denied" : "ask";
  };

  const cases = storedValues.flatMap((confirmedValue) =>
    deniedFlags.flatMap((denied) =>
      pathnames.map((pathname) => ({ confirmedValue, denied, pathname })),
    ),
  );

  it.each(cases)("$confirmedValue / denied $denied / $pathname", (input) => {
    expect(resolveAgeGateState(input)).toBe(
      expected(input.confirmedValue, input.denied, input.pathname),
    );
  });

  it("treats a stale version as unanswered", () => {
    expect(resolveAgeGateState({ confirmedValue: "0", denied: false, pathname: null })).toBe("ask");
  });

  it("lets a stored yes win over a denied flag", () => {
    expect(resolveAgeGateState({ confirmedValue: "1", denied: true, pathname: null })).toBe(
      "confirmed",
    );
  });
});
