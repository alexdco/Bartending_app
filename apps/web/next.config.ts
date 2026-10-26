import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
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
      {
        // Legacy admin pasted links, until migrate:images moves them (spec 0041 AC-13).
        protocol: "https",
        hostname: "imgur.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "i.imgur.com",
        port: "",
        pathname: "/**",
      },
    ],
  },
};

export default withNextIntl(nextConfig);
