import { useQuery } from "@tanstack/react-query";
import { fetchPopularByRegion, listPopularRegions } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";

export function usePopularRegions() {
  return useQuery({
    queryKey: ["popular-regions"] as const,
    queryFn: () => listPopularRegions(supabase),
  });
}

export function usePopularByRegion(region: string | null) {
  return useQuery({
    queryKey: ["popular-recipes", region] as const,
    queryFn: () => fetchPopularByRegion(supabase, region as string),
    enabled: region !== null,
  });
}
