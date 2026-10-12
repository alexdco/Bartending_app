import { describe, expect, it } from "vitest";
import { chooseBack, nextDepth, type HistoryEvent } from "./navigation-history";

const replay = (events: readonly HistoryEvent[]) => events.reduce(nextDepth, 0);

describe("nextDepth (spec 0038 AC-8)", () => {
  it("starts a direct landing at 0", () => {
    expect(replay([])).toBe(0);
  });

  it("adds one per push and removes one per pop", () => {
    expect(replay(["push", "push", "pop"])).toBe(1);
  });

  it("ignores replace navigations such as search typing", () => {
    expect(replay(["replace", "replace", "replace"])).toBe(0);
    expect(replay(["push", "replace", "replace"])).toBe(1);
  });

  it("never goes below 0 after going back to the landing page", () => {
    expect(replay(["push", "pop", "pop"])).toBe(0);
  });
});

describe("chooseBack (spec 0038 AC-8)", () => {
  it("goes back when an in app page is behind this one", () => {
    expect(chooseBack(1, "/search")).toEqual({ kind: "back" });
  });

  it("replaces with the fallback on a direct landing", () => {
    expect(chooseBack(0, "/search")).toEqual({ kind: "replace", href: "/search" });
  });

  it("falls back to home when no fallback is set", () => {
    expect(chooseBack(0)).toEqual({ kind: "replace", href: "/" });
  });
});
