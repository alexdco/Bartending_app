import { describe, expect, it } from "vitest";
import {
  defaultDilutionFor,
  dilutionHintMethod,
  initialDilutionState,
  pickDilution,
  syncDilutionState,
} from "./batch";

describe("defaultDilutionFor (spec 0054 AC-10)", () => {
  it.each([
    ["stir", "20"],
    ["shake", "25"],
    ["build", "none"],
    ["blend", "none"],
    ["layer", "none"],
    [null, "none"],
  ] as const)("%s starts at %s", (method, level) => {
    expect(defaultDilutionFor(method)).toBe(level);
  });
});

describe("batch dilution state (spec 0054 AC-10)", () => {
  it("opens a stirred recipe at 20% with its hint", () => {
    const state = initialDilutionState("r1", "stir");
    expect(state.level).toBe("20");
    expect(dilutionHintMethod(state)).toBe("stir");
  });

  it("hides the hint after any pick, even the default level itself", () => {
    const opened = initialDilutionState("r1", "stir");
    const picked15 = pickDilution(opened, "15");
    expect(picked15.level).toBe("15");
    expect(dilutionHintMethod(picked15)).toBeNull();

    const backTo20 = pickDilution(picked15, "20");
    expect(backTo20.level).toBe("20");
    expect(dilutionHintMethod(backTo20)).toBeNull();

    expect(dilutionHintMethod(pickDilution(opened, "20"))).toBeNull();
  });

  it("resets to the new recipe's default when a different recipe opens", () => {
    const picked = pickDilution(initialDilutionState("r1", "stir"), "15");
    const next = syncDilutionState(picked, "r2", "shake");
    expect(next).toEqual({ recipeId: "r2", method: "shake", level: "25", picked: false });
    expect(dilutionHintMethod(next)).toBe("shake");
  });

  it("never resets on a refetch of the same recipe, even if its method changed", () => {
    const picked = pickDilution(initialDilutionState("r1", "stir"), "15");
    expect(syncDilutionState(picked, "r1", "stir")).toBe(picked);
    expect(syncDilutionState(picked, "r1", "shake")).toBe(picked);

    const untouched = initialDilutionState("r1", "stir");
    expect(syncDilutionState(untouched, "r1", "stir")).toBe(untouched);
  });

  it("shows the built and blended hints at None", () => {
    expect(initialDilutionState("r1", "build").level).toBe("none");
    expect(dilutionHintMethod(initialDilutionState("r1", "build"))).toBe("build");
    expect(dilutionHintMethod(initialDilutionState("r1", "blend"))).toBe("blend");
  });

  it("shows no hint for a layered drink or an unknown method", () => {
    expect(dilutionHintMethod(initialDilutionState("r1", "layer"))).toBeNull();
    expect(dilutionHintMethod(initialDilutionState("r1", null))).toBeNull();
  });
});
