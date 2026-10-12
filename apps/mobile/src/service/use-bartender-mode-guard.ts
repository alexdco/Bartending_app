import { useEffect } from "react";
import { useRouter } from "expo-router";
import { useProfile } from "@/auth/use-preferences";

export interface BartenderModeGuardState {
  /** True once the profile loaded and bartender mode is on. */
  allowed: boolean;
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Guards a Bartender Mode screen and exposes the profile load state, so a
 * screen can show a spinner or an error with Retry instead of nothing (spec
 * 0038 AC-6). Redirects home once bartenderModeEnabled resolves false.
 */
export function useBartenderModeGuardState({
  retry,
}: { retry?: number } = {}): BartenderModeGuardState {
  const router = useRouter();
  const profileQuery = useProfile({ retry });
  const profile = profileQuery.data;

  useEffect(() => {
    if (!profileQuery.isPending && profile && !profile.bartenderModeEnabled) {
      router.replace("/");
    }
  }, [profileQuery.isPending, profile, router]);

  return {
    allowed:
      !profileQuery.isPending && !profileQuery.isError && (profile?.bartenderModeEnabled ?? true),
    isPending: profileQuery.isPending,
    isError: profileQuery.isError,
    refetch: () => void profileQuery.refetch(),
  };
}

/**
 * Guards a Bartender Mode screen: redirects home once bartenderModeEnabled
 * resolves false. Returns whether the caller should render its normal
 * content (false while loading or once redirecting, matching AC-7's "render
 * nothing" rule so a disabled user never briefly sees the real screen).
 */
export function useBartenderModeGuard(): boolean {
  const guard = useBartenderModeGuardState();
  // Unchanged behavior for these screens: a failed profile load still renders.
  return guard.allowed || guard.isError;
}
