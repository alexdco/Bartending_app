"use client";

import { useTranslations } from "next-intl";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { Text } from "@/components/text";
import { useSession } from "@/auth/use-session";
import { usePendingInvites } from "@/service/use-pending-invites";
import { useAcceptInvite } from "@/service/use-bar-mutations";

// Accept-side of the invite flow (AC-2), web variant: an in-app list of the
// signed-in user's pending invites (via list_my_pending_invites), not a
// pasted invite id like mobile, per this spec's web build plan step 9.
// accept_bar_invite itself enforces the linked account requirement and the
// email match; this screen only surfaces its error states.
export function BarInviteAcceptPageClient() {
  const t = useTranslations("service");
  const tCommon = useTranslations("common");
  const { isLinked } = useSession();
  const pendingInvites = usePendingInvites();
  const acceptInvite = useAcceptInvite();

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-four px-four py-six">
      <BackButton fallbackHref="/service" />
      <Text variant="display">{t("joinBar")}</Text>

      {!isLinked ? (
        <Text variant="body" muted>
          {t("signInToAccept")}
        </Text>
      ) : pendingInvites.isPending ? (
        <div className="flex items-center justify-center py-six">
          <Spinner label={t("loadingInvites")} />
        </div>
      ) : pendingInvites.error ? (
        <EmptyState
          title={t("loadInvitesFailed")}
          description={t("checkConnection")}
          action={<Button onClick={() => pendingInvites.refetch()}>{tCommon("retry")}</Button>}
        />
      ) : (pendingInvites.data ?? []).length === 0 ? (
        <EmptyState title={t("noPendingInvites")} description={t("noPendingInvitesDescription")} />
      ) : (
        <div className="flex flex-col gap-two">
          {(pendingInvites.data ?? []).map((invite) => (
            <Card key={invite.id} className="flex items-center justify-between gap-three">
              <Text variant="body">{invite.barName}</Text>
              <Button
                disabled={acceptInvite.isPending}
                onClick={() => acceptInvite.mutate(invite.id)}
              >
                {acceptInvite.isPending ? t("joining") : t("join")}
              </Button>
            </Card>
          ))}
        </div>
      )}

      {acceptInvite.isSuccess && <Text variant="bodySmall">{t("joined")}</Text>}
      {acceptInvite.isError && (
        <Text variant="bodySmall" className="text-danger">
          {t("inviteInvalid")}
        </Text>
      )}
    </div>
  );
}
