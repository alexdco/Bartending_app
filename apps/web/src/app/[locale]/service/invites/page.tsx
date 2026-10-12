import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BarInviteAcceptPageClient } from "@/service/bar-invite-accept-page-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("service");
  return { title: t("invitesMetaTitle") };
}

export default function BarInviteAcceptPage() {
  return (
    <main className="flex flex-1 flex-col">
      <BarInviteAcceptPageClient />
    </main>
  );
}
