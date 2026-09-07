import { useQuery } from "@tanstack/react-query";
import { fetchPantryItems } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";

export const pantryQueryKey = ["pantry"] as const;

export function usePantry() {
  return useQuery({
    queryKey: pantryQueryKey,
    queryFn: () => fetchPantryItems(supabase),
  });
}
