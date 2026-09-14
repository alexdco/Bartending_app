import { useMutation } from "@tanstack/react-query";
import { buildDrinkIdeaGeneratedEvent, generateDrinkIdea } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { track } from "@/analytics/posthog-client";
import { useActiveLocale } from "@/i18n";

export function useGenerateDrinkIdea() {
  const locale = useActiveLocale();

  return useMutation({
    mutationFn: () => generateDrinkIdea(supabase, locale),
    onSuccess: (data) => {
      const event = buildDrinkIdeaGeneratedEvent({ source: "ai", pantry_size: data.pantry_size });
      track(event.name, event.properties);
    },
  });
}
