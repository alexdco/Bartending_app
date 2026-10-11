import { describe, expect, it } from "vitest";
import { drinkIdeaLimitMessage, type DrinkIdeaLimitMessage } from "./drinkIdeaLimitMessage";

const RESETS_AT = "2026-10-12T00:00:00.000Z";
const options = { copyLocale: "en", formatLocale: "en", timeZone: "UTC" } as const;
const join = (message: DrinkIdeaLimitMessage | null) =>
  message ? `${message.before}${message.signInText ?? ""}${message.after}` : null;

describe("drinkIdeaLimitMessage", () => {
  it.each(["user_limit", "ip_limit"] as const)("offers sign in for a guest's %s", (limitReason) => {
    const message = drinkIdeaLimitMessage(
      { limitReason, signInHelps: true, resetsAt: RESETS_AT },
      options,
    );
    expect(message?.signInText).toBe("Sign in");
    expect(join(message)).toBe(
      "You've used today's free drink ideas. Sign in to get more today, or try again after Oct 12, 2026, 12:00 AM.",
    );
  });

  it("shows the plain limit for a signed in user", () => {
    const message = drinkIdeaLimitMessage(
      { limitReason: "user_limit", signInHelps: false, resetsAt: RESETS_AT },
      options,
    );
    expect(message?.signInText).toBeUndefined();
    expect(join(message)).toBe(
      "You've reached today's drink idea limit. Try again after Oct 12, 2026, 12:00 AM.",
    );
  });

  it("says ideas are busy, with sign in, when guests are cut off", () => {
    const message = drinkIdeaLimitMessage(
      { limitReason: "global_limit", signInHelps: true, resetsAt: RESETS_AT },
      options,
    );
    expect(join(message)).toBe(
      "Drink ideas are very busy today. Sign in to keep going, or try again after Oct 12, 2026, 12:00 AM.",
    );
  });

  it("says ideas are busy, without sign in, at the full cap", () => {
    const message = drinkIdeaLimitMessage(
      { limitReason: "global_limit", signInHelps: false, resetsAt: RESETS_AT },
      options,
    );
    expect(message?.signInText).toBeUndefined();
    expect(join(message)).toBe(
      "Drink ideas are very busy today. Try again after Oct 12, 2026, 12:00 AM.",
    );
  });

  it("writes the Spanish copy and links Inicia sesión", () => {
    const message = drinkIdeaLimitMessage(
      { limitReason: "global_limit", signInHelps: true, resetsAt: RESETS_AT },
      { copyLocale: "es", formatLocale: "es", timeZone: "UTC" },
    );
    expect(message?.signInText).toBe("Inicia sesión");
    expect(message?.before).toBe("Las ideas de tragos están muy solicitadas hoy. ");
    expect(message?.after).toMatch(/^ para seguir, o vuelve a intentarlo después de .*12.*2026/);
  });

  it("shows the reset time in the given time zone", () => {
    const message = drinkIdeaLimitMessage(
      { limitReason: "user_limit", signInHelps: false, resetsAt: RESETS_AT },
      { ...options, timeZone: "America/New_York" },
    );
    expect(join(message)).toContain("Oct 11, 2026, 8:00 PM");
  });

  it("returns null without a reason or a valid reset time, so the old message stays", () => {
    expect(drinkIdeaLimitMessage({ resetsAt: RESETS_AT }, options)).toBeNull();
    expect(drinkIdeaLimitMessage({ limitReason: "user_limit" }, options)).toBeNull();
    expect(
      drinkIdeaLimitMessage({ limitReason: "user_limit", resetsAt: "not a date" }, options),
    ).toBeNull();
  });
});
