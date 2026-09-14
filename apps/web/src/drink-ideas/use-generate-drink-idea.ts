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

export function useGenerateDrinkIdea() {
  const locale = useLocale() as Locale;

  return useMutation({
    mutationFn: () => generateDrinkIdea(supabase, locale),
    onSuccess: (data) => {
      const event = buildDrinkIdeaGeneratedEvent({ source: "ai", pantry_size: data.pantry_size });
      track(event.name, event.properties);
    },
  });
}
