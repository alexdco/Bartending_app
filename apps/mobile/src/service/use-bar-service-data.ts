import { useQuery } from "@tanstack/react-query";
import { fetchBarServiceData } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";

export function barServiceDataQueryKey(barId: string) {
  return ["bar-service-data", barId] as const;
}

export function useBarServiceData(barId: string | null) {
  return useQuery({
    queryKey: barServiceDataQueryKey(barId ?? "none"),
    queryFn: () => fetchBarServiceData(supabase, barId as string),
    enabled: barId !== null,
  });
}
