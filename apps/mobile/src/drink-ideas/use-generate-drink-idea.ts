import { useMutation } from "@tanstack/react-query";
import { buildDrinkIdeaGeneratedEvent, generateDrinkIdea } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { track } from "@/analytics/posthog-client";
import { useActiveLocale } from "@/i18n";
import { useMocktailsOnly } from "@/mocktails/mocktails-context";

export function useGenerateDrinkIdea() {
  const locale = useActiveLocale();
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
