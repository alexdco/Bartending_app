import { useQuery } from "@tanstack/react-query";
import { fetchMyBars } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/auth/use-session";

export const myBarsQueryKey = ["my-bars"] as const;

// Bar membership is only meaningful for a linked account (see spec
// 0023-bar-data-model.md's security model), so this stays disabled for an
// anonymous session rather than issuing a query RLS would deny anyway.
export function useMyBars() {
  const { isLinked } = useSession();

  return useQuery({
    queryKey: myBarsQueryKey,
    queryFn: () => fetchMyBars(supabase),
    enabled: isLinked,
  });
}
