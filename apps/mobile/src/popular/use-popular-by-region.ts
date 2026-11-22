import { useQuery } from "@tanstack/react-query";
import { fetchPopularByRegion, listPopularRegions } from "@bartendingapp/shared";
import { useActiveLocale } from "@/i18n";
import { supabase } from "@/lib/supabase";
import { useMocktailsQuery } from "@/mocktails/mocktails-context";

// Spec 0063 AC-5: regions with no mocktail safe recipe drop out in the mode.
export function usePopularRegions() {
  const { mocktailsOnly, ready } = useMocktailsQuery();

  return useQuery({
    queryKey: ["popular-regions", { mocktailsOnly }] as const,
    queryFn: () => listPopularRegions(supabase, { mocktailsOnly }),
    enabled: ready,
  });
}

export function usePopularByRegion(region: string | null) {
  const locale = useActiveLocale();
  const { mocktailsOnly, ready } = useMocktailsQuery();

  return useQuery({
    queryKey: ["popular-recipes", region, locale, { mocktailsOnly }] as const,
    queryFn: () => fetchPopularByRegion(supabase, region as string, locale, { mocktailsOnly }),
    enabled: region !== null && ready,
  });
}
