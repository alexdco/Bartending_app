"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useProfile } from "@/auth/use-preferences";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { usePathname, useRouter } from "@/i18n/navigation";

const INVITE_ACCEPT_PATH = "/service/invite";

// Spec 0038 AC-6: Service is never blank. This layout owns the profile
// loading and error state; the page owns the current bar's. `retry: 1` so a
// failure shows within about a second.
export default function ServiceLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("service");
  const tCommon = useTranslations("common");
  const profileQuery = useProfile({ retry: 1 });
  const profile = profileQuery.data;
  const isInviteAccept = pathname === INVITE_ACCEPT_PATH;

  useEffect(() => {
    if (isInviteAccept || profileQuery.isPending) {
      return;
    }
    if (profile && !profile.bartenderModeEnabled) {
      router.replace("/");
    }
  }, [isInviteAccept, profileQuery.isPending, profile, router]);

  if (isInviteAccept) {
    return children;
  }

  if (profileQuery.isError) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col px-four py-six">
        <EmptyState
          title={tCommon("somethingWentWrong")}
          description={t("loadFailed")}
          action={<Button onClick={() => profileQuery.refetch()}>{tCommon("retry")}</Button>}
        />
      </div>
    );
  }

  // Loading, or about to redirect a user with bartender mode turned off.
  if (profileQuery.isPending || (profile && !profile.bartenderModeEnabled)) {
    return (
      <div className="flex justify-center py-six">
        <Spinner label={t("loading")} />
      </div>
    );
  }

  return children;
}
