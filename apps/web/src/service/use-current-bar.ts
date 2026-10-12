import { useEffect, useState } from "react";
import type { BarMembership } from "@bartendingapp/shared";
import { useMyBars } from "./use-my-bars";
import { getStoredCurrentBarId, setStoredCurrentBarId } from "./current-bar-storage";

export interface CurrentBarState {
  bars: BarMembership[];
  currentBar: BarMembership | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  showSwitcher: boolean;
  selectBar: (barId: string) => void;
}

// AC-6: shows a switcher only for 2+ memberships, and remembers the last
// selected bar otherwise. Falls back to the earliest joined bar (bars sorted
// by createdAt from fetchMyBars is a proxy for join order in the absence of
// a dedicated bar_members.joined_at read path here) when nothing is stored.
export function useCurrentBar({ retry }: { retry?: number } = {}): CurrentBarState {
  const myBars = useMyBars({ retry });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hasCheckedStorage, setHasCheckedStorage] = useState(false);

  useEffect(() => {
    getStoredCurrentBarId().then((stored) => {
      setSelectedId(stored);
      setHasCheckedStorage(true);
    });
  }, []);

  const bars = myBars.data ?? [];
  const resolvedId =
    selectedId && bars.some((bar) => bar.id === selectedId) ? selectedId : (bars[0]?.id ?? null);
  const currentBar = bars.find((bar) => bar.id === resolvedId) ?? null;

  const selectBar = (barId: string) => {
    setSelectedId(barId);
    void setStoredCurrentBarId(barId);
  };

  return {
    bars,
    currentBar,
    isLoading: myBars.isPending || !hasCheckedStorage,
    isError: myBars.isError,
    refetch: () => void myBars.refetch(),
    showSwitcher: bars.length > 1,
    selectBar,
  };
}
