import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ResetPasswordPageClient } from "@/auth/reset-password-page-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("account");
  return { title: t("resetPasswordMetaTitle") };
}

export default function ResetPasswordPage() {
  return (
    <main className="flex flex-1 flex-col">
      <ResetPasswordPageClient />
    </main>
  );
}
