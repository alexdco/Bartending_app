import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { BartenderSearchPageClient } from "@/service/bartender-search-page-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("service");
  return { title: t("searchMetaTitle") };
}

export default function BartenderSearchPage() {
  return (
    <main className="flex flex-1 flex-col">
      <Suspense>
        <BartenderSearchPageClient />
      </Suspense>
    </main>
  );
}
