// Fails an EAS build (eas-build-post-install) or an `update:*` script when a
// public value the app needs is missing, so we never ship a build that hangs
// on a blank Supabase URL (spec 0040, AC-6). Local tooling never runs it.
import { pathToFileURL } from "node:url";

export const REQUIRED = [
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  "EXPO_PUBLIC_POSTHOG_KEY",
  "EXPO_PUBLIC_POSTHOG_HOST",
];

export const findMissing = (env) => REQUIRED.filter((name) => !(env[name] ?? "").trim());

const isEntryPoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint) {
  const missing = findMissing(process.env);
  if (missing.length > 0) {
    console.error(`Missing public env values: ${missing.join(", ")}`);
    console.error("Create them with `eas env:create` in this build's EAS environment.");
    process.exit(1);
  }
  console.log("All public env values are set.");
}
