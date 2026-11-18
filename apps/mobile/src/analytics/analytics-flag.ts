// The screenshots EAS profile sets EXPO_PUBLIC_DISABLE_ANALYTICS=true so a
// store capture run never reaches PostHog (spec 0060, AC-4). Any other value,
// or none, leaves analytics on.
export const isAnalyticsDisabled = (flag: string | undefined): boolean =>
  flag?.trim().toLowerCase() === "true";
