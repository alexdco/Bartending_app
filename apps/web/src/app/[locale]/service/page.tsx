import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ServicePageClient } from "@/service/service-page-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("service");
  return { title: t("metaTitle") };
}

export default function ServicePage() {
  return (
    <main className="flex flex-1 flex-col">
      <ServicePageClient />
    </main>
  );
}
