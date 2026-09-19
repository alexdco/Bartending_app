import { useEffect } from "react";
import { useRouter } from "expo-router";
import { useProfile } from "@/auth/use-preferences";

/**
 * Guards a Bartender Mode screen: redirects home once bartenderModeEnabled
 * resolves false. Returns whether the caller should render its normal
 * content (false while loading or once redirecting, matching AC-7's "render
 * nothing" rule so a disabled user never briefly sees the real screen).
 */
export function useBartenderModeGuard(): boolean {
  const router = useRouter();
  const { data: profile, isLoading } = useProfile();

  useEffect(() => {
    if (!isLoading && profile && !profile.bartenderModeEnabled) {
      router.replace("/");
    }
  }, [isLoading, profile, router]);

  if (isLoading) {
    return false;
  }

  return profile?.bartenderModeEnabled ?? true;
}
