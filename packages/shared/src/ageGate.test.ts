import { describe, expect, it } from "vitest";
import {
  AGE_GATE_EXEMPT_PATTERN,
  isAgeGateExemptPath,
  isMocktailsOnly,
  resolveAgeGateState,
  type AgeGateState,
} from "./ageGate";

describe("AGE_GATE_EXEMPT_PATTERN", () => {
  it("matches the exact pattern the spec pins for the current locales", () => {
    expect(AGE_GATE_EXEMPT_PATTERN.source).toBe(
      String.raw`^(?:\/(?:en|es|pt|fr|ru|hi|ja|ko|zh))?\/(?:privacy|auth\/callback)\/?$`,
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
    "/pt/privacy",
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
    "/de/privacy",
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
  const mocktailsFlags = [false, true] as const;
  const pathnames = [
    "/privacy",
    "/es/privacy/",
    "/pt/privacy",
    "/en/auth/callback",
    "/en/recipes/privacy-cocktail-123",
    "/",
  ] as const;

  const expected = (
    confirmedValue: string | null,
    denied: boolean,
    mocktails: boolean,
    pathname: string,
  ): AgeGateState => {
    if (pathname !== "/" && !pathname.includes("recipes")) return "exempt";
    if (confirmedValue === "1") return "confirmed";
    if (mocktails) return "mocktails";
    return denied ? "denied" : "ask";
  };

  const cases = storedValues.flatMap((confirmedValue) =>
    deniedFlags.flatMap((denied) =>
      mocktailsFlags.flatMap((mocktails) =>
        pathnames.map((pathname) => ({ confirmedValue, denied, mocktails, pathname })),
      ),
    ),
  );

  it.each(cases)("$confirmedValue / denied $denied / mocktails $mocktails / $pathname", (input) => {
    expect(resolveAgeGateState(input)).toBe(
      expected(input.confirmedValue, input.denied, input.mocktails, input.pathname),
    );
  });

  it("treats a stale version as unanswered", () => {
    expect(
      resolveAgeGateState({ confirmedValue: "0", denied: false, mocktails: false, pathname: null }),
    ).toBe("ask");
  });

  it("lets a stored yes win over a denied flag", () => {
    expect(
      resolveAgeGateState({ confirmedValue: "1", denied: true, mocktails: false, pathname: null }),
    ).toBe("confirmed");
  });
});

describe("mocktails only mode (spec 0063)", () => {
  it("lets a stored yes win over mocktails (AC-3)", () => {
    expect(
      resolveAgeGateState({ confirmedValue: "1", denied: true, mocktails: true, pathname: null }),
    ).toBe("confirmed");
  });

  it("lets mocktails win over a denial", () => {
    expect(
      resolveAgeGateState({ confirmedValue: null, denied: true, mocktails: true, pathname: null }),
    ).toBe("mocktails");
  });

  it("keeps exempt routes exempt in the mode (AC-3)", () => {
    expect(
      resolveAgeGateState({
        confirmedValue: null,
        denied: true,
        mocktails: true,
        pathname: "/en/privacy",
      }),
    ).toBe("exempt");
  });

  it("treats a stale confirmed version as unanswered, so mocktails holds", () => {
    expect(
      resolveAgeGateState({ confirmedValue: "0", denied: false, mocktails: true, pathname: null }),
    ).toBe("mocktails");
  });

  it.each<[AgeGateState, boolean]>([
    ["mocktails", true],
    ["confirmed", false],
    ["exempt", false],
    ["denied", false],
    ["ask", false],
  ])("isMocktailsOnly(%s) is %s", (state, expectedValue) => {
    expect(isMocktailsOnly(state)).toBe(expectedValue);
  });
});
