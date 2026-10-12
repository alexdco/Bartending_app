"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/input";
import { Text } from "@/components/text";
import { useCurrentBar } from "@/service/use-current-bar";
import { useInviteStaff } from "@/service/use-bar-mutations";

// Send-side of the invite flow (AC-2). Owner only, per RLS on bar_invites:
// a staff member attempting to insert an invite is denied server side, so
// this screen doesn't need its own role check beyond the empty state below.
export function BarInvitePageClient() {
  const t = useTranslations("service");
  const currentBar = useCurrentBar();
  const [email, setEmail] = useState("");
  const barId = currentBar.currentBar?.id;
  const inviteStaff = useInviteStaff(barId ?? "");
  const isOwner = currentBar.currentBar !== null;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-four px-four py-six">
      <BackButton fallbackHref="/service" />
      <Text variant="display">{t("inviteStaff")}</Text>

      {!isOwner ? (
        <EmptyState title={t("noBarSelected")} description={t("noBarSelectedDescription")} />
      ) : (
        <div className="flex flex-col gap-two">
          <Text variant="body" muted>
            {t("invitingTo", { bar: currentBar.currentBar?.name ?? "" })}
          </Text>
          <Input
            label={t("email")}
            placeholder={t("emailPlaceholder")}
            autoCapitalize="none"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button
            disabled={email.trim() === "" || inviteStaff.isPending}
            onClick={() => inviteStaff.mutate(email.trim(), { onSuccess: () => setEmail("") })}
          >
            {inviteStaff.isPending ? t("sending") : t("sendInvite")}
          </Button>
          {inviteStaff.isSuccess && <Text variant="bodySmall">{t("inviteSent")}</Text>}
          {inviteStaff.isError && (
            <Text variant="bodySmall" className="text-danger">
              {t("inviteFailed")}
            </Text>
          )}
        </div>
      )}
    </div>
  );
}
