import posthog from "posthog-js";

let initialized = false;

function tryInit(): void {
  if (initialized) return;

  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const apiHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

  if (!apiKey || !apiHost) {
    return;
  }

  try {
    posthog.init(apiKey, {
      api_host: apiHost,
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      person_profiles: "identified_only",
    });
    initialized = true;
  } catch (error) {
    console.error("Failed to initialize PostHog", error);
  }
}

export function initAnalyticsIfConsented(hasConsent: boolean): void {
  if (hasConsent) {
    tryInit();
  }
}

let identifiedId: string | null = null;

export function identify(userId: string): void {
  if (!initialized || identifiedId === userId) {
    return;
  }

  try {
    posthog.identify(userId);
    identifiedId = userId;
  } catch (error) {
    console.error("Failed to identify analytics user", error);
  }
}

export function track(name: string, properties: object): void {
  if (!initialized) {
    return;
  }

  try {
    posthog.capture(name, { ...properties });
  } catch (error) {
    console.error("Failed to track analytics event", error);
  }
}
