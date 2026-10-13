import { describe, expect, it } from "vitest";

import { resolveAppChannel } from "./app-channel";

describe("resolveAppChannel", () => {
  it.each(["development", "preview", "production"])("keeps the %s channel", (channel) => {
    expect(resolveAppChannel(channel)).toBe(channel);
  });

  it("maps a null channel to local", () => {
    expect(resolveAppChannel(null)).toBe("local");
  });

  it("maps a missing or blank channel to local", () => {
    expect(resolveAppChannel(undefined)).toBe("local");
    expect(resolveAppChannel("")).toBe("local");
  });
});
