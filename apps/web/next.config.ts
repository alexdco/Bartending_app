import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Self hosted script font slices (spec 0050 AC-11). Safe to cache forever:
  // Google's version segment (v54) changes whenever the files do. fonts.css
  // itself keeps the default revalidating cache.
  async headers() {
    return [
      {
        source: "/fonts/:dir/:family/:version/:file*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.thecocktaildb.com",
      },
      {
        // User comment photos (spec 0032), resized on the fly by next/image.
        protocol: "https",
        hostname: "ctuzjhhpnkkhooneporu.supabase.co",
        pathname: "/storage/v1/object/public/comment-photos/**",
      },
      {
        // Self hosted recipe images (spec 0041). Heroes go through the
        // optimizer; cards are already 400px and render unoptimized.
        protocol: "https",
        hostname: "ctuzjhhpnkkhooneporu.supabase.co",
        pathname: "/storage/v1/object/public/recipe-images/**",
      },
    ],
  },
};

export default withNextIntl(nextConfig);
