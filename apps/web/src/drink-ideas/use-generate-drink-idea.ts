"use client";

import { useMutation } from "@tanstack/react-query";
import { buildDrinkIdeaGeneratedEvent, generateDrinkIdea } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { track } from "@/analytics/posthog-client";

export function useGenerateDrinkIdea() {
  return useMutation({
    mutationFn: () => generateDrinkIdea(supabase),
    onSuccess: (data) => {
      const event = buildDrinkIdeaGeneratedEvent({ source: "ai", pantry_size: data.pantry_size });
      track(event.name, event.properties);
    },
  });
}
