"use client";

import { useMutation } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import {
  buildDrinkIdeaGeneratedEvent,
  generateDrinkIdea,
  type Locale,
} from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { track } from "@/analytics/posthog-client";
import { useMocktailsOnly } from "@/age-gate/age-gate-store";

export function useGenerateDrinkIdea() {
  const locale = useLocale() as Locale;
  // Spec 0063 AC-8. The mode is never sent to analytics: track() below is a
  // no op without PostHog, which never starts in the mode (AC-13).
  const mocktailsOnly = useMocktailsOnly();

  return useMutation({
    mutationFn: () => generateDrinkIdea(supabase, locale, { mocktailsOnly }),
    onSuccess: (data) => {
      const event = buildDrinkIdeaGeneratedEvent({ source: "ai", pantry_size: data.pantry_size });
      track(event.name, event.properties);
    },
  });
}
