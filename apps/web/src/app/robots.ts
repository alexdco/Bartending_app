import type { MetadataRoute } from "next";
import { siteAbsoluteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/recipes", "/popular"],
      disallow: ["/account", "/auth", "/pantry"],
    },
    sitemap: siteAbsoluteUrl("/sitemap.xml"),
  };
}
