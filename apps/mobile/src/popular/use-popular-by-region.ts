import { useQuery } from "@tanstack/react-query";
import { fetchPopularByRegion, listPopularRegions } from "@bartendingapp/shared";
import { useActiveLocale } from "@/i18n";
import { supabase } from "@/lib/supabase";

export function usePopularRegions() {
  return useQuery({
    queryKey: ["popular-regions"] as const,
    queryFn: () => listPopularRegions(supabase),
  });
}

export function usePopularByRegion(region: string | null) {
  const locale = useActiveLocale();

  return useQuery({
    queryKey: ["popular-recipes", region, locale] as const,
    queryFn: () => fetchPopularByRegion(supabase, region as string, locale),
    enabled: region !== null,
  });
}
