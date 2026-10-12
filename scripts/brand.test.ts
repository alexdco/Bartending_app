import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { BRAND_BUNDLE_ID, BRAND_NAME, BRAND_SCHEME } from "../packages/shared/src/brand";

// Spec 0037, AC-1 and AC-8: one product name everywhere, and the mobile
// app config mirrors the shared brand constants.

const ROOT = join(__dirname, "..");
const OLD_NAME = "Bartending App";

function filesUnder(dir: string, extensions: readonly string[]): string[] {
  return readdirSync(join(ROOT, dir), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext)))
    .map((entry) => relative(ROOT, join(entry.parentPath, entry.name)));
}

const scanned = [
  ...filesUnder("apps/web/messages", [".json"]),
  ...filesUnder("apps/mobile/src/i18n/locales", [".json"]),
  ...filesUnder("apps/web/src", [".ts", ".tsx"]),
  ...filesUnder("apps/mobile/src", [".ts", ".tsx"]),
];

describe("brand guard", () => {
  it("scans the message files and both apps' source", () => {
    expect(scanned.length).toBeGreaterThan(100);
  });

  it(`never spells "${OLD_NAME}" in a user facing file`, () => {
    const offenders = scanned.filter((path) =>
      readFileSync(join(ROOT, path), "utf8").includes(OLD_NAME),
    );
    expect(offenders).toEqual([]);
  });
});

describe("mobile app.json", () => {
  const { expo } = JSON.parse(readFileSync(join(ROOT, "apps/mobile/app.json"), "utf8"));

  it("matches the shared brand constants", () => {
    expect({
      name: expo.name,
      slug: expo.slug,
      scheme: expo.scheme,
      bundleIdentifier: expo.ios.bundleIdentifier,
      package: expo.android.package,
    }).toEqual({
      name: BRAND_NAME,
      slug: BRAND_SCHEME,
      scheme: BRAND_SCHEME,
      bundleIdentifier: BRAND_BUNDLE_ID,
      package: BRAND_BUNDLE_ID,
    });
  });

  it("keeps no template blue and no Icon Composer override", () => {
    const config = JSON.stringify(expo).toUpperCase();
    expect(config).not.toContain("#208AEF");
    expect(config).not.toContain("#E6F4FE");
    expect(expo.ios.icon).toBeUndefined();
  });
});
