import { absoluteUrl } from "@bartendingapp/shared";

export function siteAbsoluteUrl(path: string): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return absoluteUrl(siteUrl, path);
}
