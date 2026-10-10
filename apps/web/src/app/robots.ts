import type { MetadataRoute } from "next";
import { localizedPath, SUPPORTED_LOCALES } from "@bartendingapp/shared";
import { siteAbsoluteUrl } from "@/lib/site-url";

const PRIVATE_SECTIONS = [
  "/account",
  "/auth",
  "/pantry",
  "/shopping-list",
  "/favorites",
  "/admin",
  "/service",
] as const;

// One rule per locale rather than a `/*/pantry` wildcard: the wildcard would
// also block public recipe slugs like `/en/recipes/authentic-margarita-<id>`.
// The bare paths stay listed because they redirect into a locale.
const DISALLOWED_PATHS = [
  ...PRIVATE_SECTIONS,
  ...SUPPORTED_LOCALES.flatMap((locale) =>
    PRIVATE_SECTIONS.map((section) => localizedPath(locale, section)),
  ),
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: DISALLOWED_PATHS,
    },
    sitemap: siteAbsoluteUrl("/sitemap.xml"),
  };
}
