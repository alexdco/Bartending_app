import { useQuery } from "@tanstack/react-query";
import { searchBartender } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { getBartenderRecentlyViewedRecipeIds } from "@/service/bartender-recently-viewed-storage";

export function bartenderSearchQueryKey(query: string, barId: string | null) {
  return ["bartender-search", query, barId ?? "none"] as const;
}

export function useBartenderSearch(query: string, barId: string | null) {
  return useQuery({
    queryKey: bartenderSearchQueryKey(query, barId),
    queryFn: async () => {
      const recentIds = await getBartenderRecentlyViewedRecipeIds();
      return searchBartender(supabase, query, barId, recentIds);
    },
    enabled: query.trim() !== "",
  });
}
