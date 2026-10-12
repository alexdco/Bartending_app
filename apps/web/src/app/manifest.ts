import type { MetadataRoute } from "next";
import { getTranslations } from "next-intl/server";
import { BRAND_NAME, colors } from "@bartendingapp/shared";

// The web app manifest (spec 0037, AC-6). English only: installed app names
// are not localized. Icons come from `pnpm icons`.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const t = await getTranslations({ locale: "en", namespace: "home" });

  return {
    name: BRAND_NAME,
    short_name: BRAND_NAME,
    description: t("siteDescription"),
    start_url: "/",
    display: "standalone",
    background_color: colors.dark.bg,
    theme_color: colors.dark.bg,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
