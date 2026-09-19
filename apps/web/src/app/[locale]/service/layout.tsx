"use client";

import { useEffect } from "react";
import { useProfile } from "@/auth/use-preferences";
import { usePathname, useRouter } from "@/i18n/navigation";

const INVITE_ACCEPT_PATH = "/service/invite";

export default function ServiceLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: profile, isLoading } = useProfile();
  const isInviteAccept = pathname === INVITE_ACCEPT_PATH;

  useEffect(() => {
    if (isInviteAccept || isLoading) {
      return;
    }
    if (profile && !profile.bartenderModeEnabled) {
      router.replace("/");
    }
  }, [isInviteAccept, isLoading, profile, router]);

  if (isInviteAccept) {
    return children;
  }

  if (isLoading || (profile && !profile.bartenderModeEnabled)) {
    return null;
  }

  return children;
}
