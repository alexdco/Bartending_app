import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AccountPageClient } from "@/auth/account-page-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("metaTitle") };
}

export default function AccountPage() {
  return (
    <main className="flex flex-1 flex-col">
      <AccountPageClient />
    </main>
  );
}
