import { describe, expect, it } from "vitest";

import { isAnalyticsDisabled } from "./analytics-flag";

describe("isAnalyticsDisabled (spec 0060, AC-4)", () => {
  it.each(["true", "TRUE", " true "])("turns analytics off for %j", (flag) => {
    expect(isAnalyticsDisabled(flag)).toBe(true);
  });

  it.each([undefined, "", "false", "1", "yes"])("leaves analytics on for %j", (flag) => {
    expect(isAnalyticsDisabled(flag)).toBe(false);
  });
});
