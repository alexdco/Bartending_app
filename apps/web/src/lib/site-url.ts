import { absoluteUrl, resolveSiteUrl } from "@bartendingapp/shared";

export const SITE_URL = resolveSiteUrl(process.env);

export function siteAbsoluteUrl(path: string): string {
  return absoluteUrl(SITE_URL, path);
}
