import * as Updates from "expo-updates";
import PostHog from "posthog-react-native";

import { resolveAppChannel } from "./app-channel";

let client: PostHog | null = null;

// Called by the root layout only once the age gate is confirmed, so no
// event and no identify can be sent before that (spec 0037, AC-15). Until
// then client stays null and every helper below is a no op.
export function initAnalytics(): void {
  if (client) return;

  const apiKey = process.env.EXPO_PUBLIC_POSTHOG_KEY;
  const apiHost = process.env.EXPO_PUBLIC_POSTHOG_HOST;

  if (!apiKey || !apiHost) {
    return;
  }

  try {
    client = new PostHog(apiKey, {
      host: apiHost,
      captureAppLifecycleEvents: false,
      personProfiles: "identified_only",
    });
    // Tags every event with the build's update channel (spec 0040, AC-9).
    client.register({ app_channel: resolveAppChannel(Updates.channel) }).catch((error) => {
      console.error("Failed to register the app channel", error);
    });
  } catch (error) {
    console.error("Failed to initialize PostHog", error);
  }
}

let identifiedId: string | null = null;

export function identify(userId: string): void {
  if (!client || identifiedId === userId) {
    return;
  }

  try {
    client.identify(userId);
    identifiedId = userId;
  } catch (error) {
    console.error("Failed to identify analytics user", error);
  }
}

export function track(name: string, properties: object): void {
  if (!client) {
    return;
  }

  try {
    client.capture(name, { ...properties } as Record<string, string | number | boolean>);
  } catch (error) {
    console.error("Failed to track analytics event", error);
  }
}
