import { describe, expect, it } from "vitest";

import sample from "./eas-metadata.sample.json";
import { en } from "./listing/en";
import { buildPlayMarkdown, buildStoreConfig, checkSiteUrl } from "./metadata";

const ORIGIN = "https://cocktailist.app";

const keysDeep = (value: unknown, path = ""): readonly string[] =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? Object.entries(value).flatMap(([key, child]) => [
        `${path}${key}`,
        ...keysDeep(child, `${path}${key}.`),
      ])
    : [];

describe("checkSiteUrl", () => {
  it.each([
    [undefined, "is not set"],
    ["", "is not set"],
    ["not a url", "is not a URL"],
    ["http://cocktailist.app", "is not https"],
    ["http://localhost:3000", "is not https"],
    ["https://localhost:3000", "points at localhost"],
    ["https://127.0.0.1", "is an IP address"],
    ["https://[::1]", "is an IP address"],
    ["https://foo.vercel.app", "is a Vercel preview host"],
    ["https://www.example.com", "is a placeholder host"],
    ["https://bartendingapp.example.com", "is a placeholder host"],
  ])("rejects %s", (raw, reason) => {
    const result = checkSiteUrl(raw);
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.reason).toContain(reason);
  });

  it("accepts a production origin and drops a trailing slash", () => {
    expect(checkSiteUrl("https://Cocktailist.app/")).toEqual({ ok: true, origin: ORIGIN });
  });
});

describe("buildStoreConfig", () => {
  it("matches the checked in EAS Metadata sample's keys", () => {
    const config = buildStoreConfig([en], ORIGIN, { withReleaseNotes: true });
    expect(keysDeep(config)).toEqual(keysDeep(sample));
  });

  it("builds each URL from the origin and the module's web locale", () => {
    const info = buildStoreConfig([en], ORIGIN, { withReleaseNotes: false }).apple.info["en-US"];
    expect(info?.supportUrl).toBe("https://cocktailist.app/en/privacy#contact");
    expect(info?.privacyPolicyUrl).toBe("https://cocktailist.app/en/privacy");
    expect(info?.marketingUrl).toBe("https://cocktailist.app/en");
  });

  it("sends keywords as an array and the categories in order", () => {
    const config = buildStoreConfig([en], ORIGIN, { withReleaseNotes: false });
    expect(config.apple.categories).toEqual(["FOOD_AND_DRINK", "LIFESTYLE"]);
    expect(config.apple.info["en-US"]?.keywords).toEqual(en.appStore.keywords);
  });

  it("leaves release notes out unless asked", () => {
    const without = buildStoreConfig([en], ORIGIN, { withReleaseNotes: false });
    const withNotes = buildStoreConfig([en], ORIGIN, { withReleaseNotes: true });
    expect(without.apple.info["en-US"]).not.toHaveProperty("releaseNotes");
    expect(withNotes.apple.info["en-US"]?.releaseNotes).toBe(en.releaseNotes);
  });
});

describe("buildPlayMarkdown", () => {
  it("wraps release notes in the Play locale tag", () => {
    expect(buildPlayMarkdown([en])).toContain(`<en-US>\n${en.releaseNotes}\n</en-US>`);
  });

  it("includes the title, short description, and full description", () => {
    const markdown = buildPlayMarkdown([en]);
    expect(markdown).toContain(en.play.title);
    expect(markdown).toContain(en.play.shortDescription);
    expect(markdown).toContain(en.play.fullDescription);
  });
});
