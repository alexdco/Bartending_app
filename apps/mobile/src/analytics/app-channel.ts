// The `app_channel` super property: the build's EAS Update channel, or
// "local" when there is none (Expo Go, a local run), so test traffic can be
// told apart from real traffic in one PostHog project (spec 0040, AC-9).
export const resolveAppChannel = (channel: string | null | undefined): string =>
  channel?.trim() ? channel : "local";
