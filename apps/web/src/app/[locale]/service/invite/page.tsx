import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { BarInvitePageClient } from "@/service/bar-invite-page-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("service");
  return { title: t("inviteMetaTitle") };
}

export default function BarInvitePage() {
  return (
    <main className="flex flex-1 flex-col">
      <BarInvitePageClient />
    </main>
  );
}
