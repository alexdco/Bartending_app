import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { fetchMyBars } from "@bartendingapp/shared";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/auth/use-session";

// AC-9: when a bartender is removed from a bar (or leaves), that bar's
// persisted offline data must be actively cleared on next foreground with
// connectivity, not just blocked from new reads at the RLS layer (RLS only
// stops new reads; an already persisted copy stays fully readable offline
// until evicted). Compares the user's current bar_members rows against any
// persisted bar-scoped query keys on device and evicts orphaned ones.
export function useBarRemovalEviction() {
  const queryClient = useQueryClient();
  const { isLinked } = useSession();
  const lastCheckedBarIdsRef = useRef<Set<string> | null>(null);

  const runCheck = async () => {
    if (!isLinked) {
      return;
    }

    let currentBarIds: Set<string>;
    try {
      const bars = await fetchMyBars(supabase);
      currentBarIds = new Set(bars.map((bar) => bar.id));
    } catch {
      // No connectivity or the request failed; nothing to evict against a
      // stale membership list, so skip this pass rather than risk evicting
      // data the user is still a member of.
      return;
    }

    lastCheckedBarIdsRef.current = currentBarIds;

    const cache = queryClient.getQueryCache();
    for (const query of cache.getAll()) {
      const [prefix, barId] = query.queryKey as [string | undefined, string | undefined];
      const isBarScoped = prefix === "bar-service-data";
      if (isBarScoped && typeof barId === "string" && !currentBarIds.has(barId)) {
        queryClient.removeQueries({ queryKey: query.queryKey });
      }
    }
  };

  useEffect(() => {
    void runCheck();

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void runCheck();
      }
    });

    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLinked]);
}
