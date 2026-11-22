"use client";

import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { LinkButton } from "@/components/link-button";

/** Guests and anonymous sessions see this instead of the form (spec 0064 AC-4). */
export function SubmissionSignInPrompt() {
  const t = useTranslations("submissions");
  return (
    <EmptyState
      title={t("signInTitle")}
      description={t("signInDescription")}
      action={<LinkButton href="/account">{t("signInAction")}</LinkButton>}
    />
  );
}
