import PostHog from "posthog-react-native";

let client: PostHog | null = null;

function tryInit(): void {
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
  } catch (error) {
    console.error("Failed to initialize PostHog", error);
  }
}

tryInit();

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
